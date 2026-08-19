import { describe, it, expect } from 'vitest';
import { classifyFrame, getStreamState, buildStreamStates } from '../signalState';

function csv(values) {
  return values.join(',');
}

describe('classifyFrame', () => {
  it('classifies a constant ECG payload of 500 as SENSOR_OFF', () => {
    expect(classifyFrame({ data: csv(new Array(256).fill(500)), kind: 'ECG' })).toBe('SENSOR_OFF');
  });

  it('classifies a constant ECG payload of 2500 as SENSOR_OFF', () => {
    expect(classifyFrame({ data: csv(new Array(256).fill(2500)), kind: 'ECG' })).toBe('SENSOR_OFF');
  });

  it('classifies a constant ECG payload of -500 as SENSOR_OFF', () => {
    expect(classifyFrame({ data: csv(new Array(256).fill(-500)), kind: 'ECG' })).toBe('SENSOR_OFF');
  });

  it('classifies a constant SpO2 payload of 0 as SENSOR_OFF', () => {
    expect(classifyFrame({ data: csv(new Array(128).fill(0)), kind: 'SpO2' })).toBe('SENSOR_OFF');
  });

  it('classifies a constant CO2 payload of 0 as SENSOR_OFF', () => {
    expect(classifyFrame({ data: csv(new Array(128).fill(0)), kind: 'CO2' })).toBe('SENSOR_OFF');
  });

  it('classifies a constant non-sentinel payload as INVALID', () => {
    // A bit-exact constant that isn't a known sentinel can't come from a
    // live amplifier either — it's an instrumentation fault, not asystole.
    expect(classifyFrame({ data: csv(new Array(256).fill(137)), kind: 'ECG' })).toBe('INVALID');
  });

  it('classifies a constant non-sentinel RIMP payload as INVALID (no known RIMP sentinel)', () => {
    expect(classifyFrame({ data: csv(new Array(128).fill(305)), kind: 'RIMP' })).toBe('INVALID');
  });

  it('classifies an empty payload as EMPTY, not SENSOR_OFF', () => {
    // Number('') is 0 — this guards against an empty payload being
    // misread as a constant-0 SpO2 frame and therefore a false sensor-off.
    expect(classifyFrame({ data: '', kind: 'SpO2' })).toBe('EMPTY');
    expect(classifyFrame({ data: ',,,', kind: 'ECG' })).toBe('EMPTY');
  });

  it('classifies a missing data payload as EMPTY', () => {
    expect(classifyFrame({ data: undefined, kind: 'ECG' })).toBe('EMPTY');
    expect(classifyFrame({ kind: 'ECG' })).toBe('EMPTY');
  });

  it('skips empty entries within an otherwise valid payload', () => {
    expect(classifyFrame({ data: '10,,20,30', kind: 'ECG' })).toBe('OK');
  });

  it('classifies a real varying ECG trace as OK', () => {
    const values = [3, 1, 1, 2, 2, 2, 0, 0, 0, 1, -28, -29, -27, -23, -17, -13, -12, -10, -10, -12];
    expect(classifyFrame({ data: csv(values), kind: 'ECG' })).toBe('OK');
  });

  it('classifies a low-amplitude but noisy trace as OK (guards the genuine-asystole path)', () => {
    // Baseline noise/mains interference/movement artefact means a real
    // signal — even a very flat one — is never bit-exact constant. This
    // must never be classified as sensor-off; that would swallow a real
    // flatline alarm.
    const values = [500, 501, 499, 500, 502, 498, 500, 501, 499, 500, 500, 499, 501, 500, 498];
    expect(classifyFrame({ data: csv(values), kind: 'ECG' })).toBe('OK');
  });

  it('accepts array payloads, not just CSV strings', () => {
    expect(classifyFrame({ data: [500, 500, 500], kind: 'ECG' })).toBe('SENSOR_OFF');
    expect(classifyFrame({ data: [1, 2, 3], kind: 'ECG' })).toBe('OK');
  });
});

describe('getStreamState', () => {
  const BASE = 1_000_000_000_000; // arbitrary fixed "now" anchor

  function frame(offsetMs, value, count = 256) {
    return { data: csv(new Array(count).fill(value)), receivedAt: BASE + offsetMs };
  }

  function varyingFrame(offsetMs) {
    return { data: csv([1, 2, 3, 2, 1, 0, -1, -2, -1, 0]), receivedAt: BASE + offsetMs };
  }

  it('returns NO_DATA when no frames have ever been received', () => {
    const result = getStreamState([], BASE, 'ECG');
    expect(result.state).toBe('NO_DATA');
    expect(result.drawTrace).toBe(false);
    expect(result.isFault).toBe(false);
    expect(result.lastAt).toBe(null);
  });

  it('returns LIVE for fresh, OK frames', () => {
    const frames = [varyingFrame(0), varyingFrame(200), varyingFrame(400)];
    const result = getStreamState(frames, BASE + 400, 'ECG');
    expect(result.state).toBe('LIVE');
    expect(result.drawTrace).toBe(true);
    expect(result.isFault).toBe(false);
  });

  it('returns SENSOR_OFF once 3 consecutive frames agree on a sentinel value', () => {
    const frames = [frame(0, 500), frame(200, 500), frame(400, 500)];
    const result = getStreamState(frames, BASE + 400, 'ECG');
    expect(result.state).toBe('SENSOR_OFF');
    expect(result.drawTrace).toBe(false);
    expect(result.isFault).toBe(true);
    expect(result.label).toBe('LEAD OFF');
  });

  it('does not flip to SENSOR_OFF on a single odd frame', () => {
    // Two live-looking frames and one sentinel frame — majority is OK.
    const frames = [varyingFrame(0), varyingFrame(200), frame(400, 500)];
    const result = getStreamState(frames, BASE + 400, 'ECG');
    expect(result.state).toBe('LIVE');
  });

  it('does not flip to LIVE on a single odd frame while faulted', () => {
    // Two sentinel frames and one live-looking frame — majority is fault.
    const frames = [frame(0, 500), frame(200, 500), varyingFrame(400)];
    const result = getStreamState(frames, BASE + 400, 'ECG');
    expect(result.state).toBe('SENSOR_OFF');
  });

  it('sensor state wins over freshness — fresh but constant frames are not LIVE', () => {
    const frames = [frame(0, 0), frame(200, 0), frame(400, 0)];
    const result = getStreamState(frames, BASE + 400, 'SpO2');
    expect(result.state).toBe('SENSOR_OFF');
    expect(result.label).toBe('PROBE OFF');
  });

  it('returns STALE between 5s and 30s since the last frame', () => {
    const frames = [varyingFrame(0)];
    const result = getStreamState(frames, BASE + 10_000, 'ECG');
    expect(result.state).toBe('STALE');
    expect(result.drawTrace).toBe(false);
    expect(result.isFault).toBe(true);
  });

  it('returns LOST after 30s since the last frame', () => {
    const frames = [varyingFrame(0)];
    const result = getStreamState(frames, BASE + 35_000, 'ECG');
    expect(result.state).toBe('LOST');
    expect(result.drawTrace).toBe(false);
    expect(result.label).toContain('NO DATA since');
  });

  it('classifies a constant non-sentinel stream as INVALID', () => {
    const frames = [frame(0, 137), frame(200, 137), frame(400, 137)];
    const result = getStreamState(frames, BASE + 400, 'ECG');
    expect(result.state).toBe('INVALID');
    expect(result.isFault).toBe(true);
  });
});

describe('buildStreamStates', () => {
  const BASE = 2_000_000_000_000;

  function constantWaveformFrame(name, value, offsetMs, count = 256) {
    return {
      waveform: { name, data: new Array(count).fill(value).join(',') },
      receivedAt: BASE + offsetMs,
    };
  }

  // A live sample block carries natural point-to-point variation, unlike a
  // sensor-off frame which is bit-exact constant.
  function varyingWaveformFrame(name, base, offsetMs, count = 20) {
    const data = new Array(count).fill(0).map((_, i) => base + (i % 3) - 1).join(',');
    return { waveform: { name, data }, receivedAt: BASE + offsetMs };
  }

  it('groups frames by channel kind and resolves each independently', () => {
    const waveforms = [
      constantWaveformFrame('II', 500, 0),
      constantWaveformFrame('II', 500, 200),
      constantWaveformFrame('II', 500, 400),
      varyingWaveformFrame('SpO2', 80, 0),
      varyingWaveformFrame('SpO2', 90, 200),
      varyingWaveformFrame('SpO2', 85, 400),
    ];

    const states = buildStreamStates(waveforms, BASE + 400);

    expect(states.ECG.state).toBe('SENSOR_OFF');
    expect(states.ECG.leadName).toBe('II');
    expect(states.SpO2.state).toBe('LIVE');
    expect(states.RIMP.state).toBe('NO_DATA');
    expect(states.RIMP.isFault).toBe(false);
    expect(states.CO2.state).toBe('NO_DATA');
  });

  it('records the actual lead name received, not a hard-coded II', () => {
    const waveforms = [
      varyingWaveformFrame('III', 1, 0),
      varyingWaveformFrame('III', 2, 200),
      varyingWaveformFrame('III', 3, 400),
    ];

    const states = buildStreamStates(waveforms, BASE + 400);
    expect(states.ECG.leadName).toBe('III');
    expect(states.ECG.state).toBe('LIVE');
  });
});
