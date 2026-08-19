import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { classifyFrame } from '../signalState';

// Regression check against real captured logs: classifyFrame's SENSOR_OFF
// verdict on each ECG frame should agree with the paired vitals message
// reporting HR as "---" at the nearest timestamp for that device. This is
// the empirical basis for the whole fix — a constant ECG payload means
// "sensor not connected", not "no heartbeat".

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const WAVEFORM_LOG = path.join(REPO_ROOT, 'backend/logs/waveform.log');
const VITALS_LOG = path.join(REPO_ROOT, 'backend/logs/vitals.log');

const VITALS_RE = /^\[([^\]]+)\]\s+VITALS\s+\[([^\]]+)\]\s+HR=(\S+)\s+SpO2=(\S+)/;
const WAVEFORM_RE = /^\[([^\]]+)\]\s+WAVEFORM\s+\[([^\]]+)\]:\s+Device=(\S+)\s+sampleRate=\d+\s+dataPoints=\d+\s+\|\s+first10=([^\s|]+)/;

function parseVitalsLog(filePath) {
  const byDevice = new Map();
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

  for (const line of lines) {
    const m = VITALS_RE.exec(line);
    if (!m) continue;
    const [, iso, deviceId, hr] = m;
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) continue;

    if (!byDevice.has(deviceId)) byDevice.set(deviceId, []);
    byDevice.get(deviceId).push({ ts, hr });
  }

  // Sort per-device so we can binary-search for the nearest timestamp.
  byDevice.forEach(entries => entries.sort((a, b) => a.ts - b.ts));
  return byDevice;
}

function parseEcgWaveformLog(filePath) {
  const frames = [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

  for (const line of lines) {
    const m = WAVEFORM_RE.exec(line);
    if (!m) continue;
    const [, iso, kindLabel, deviceId, first10] = m;
    if (!['I', 'II', 'III'].includes(kindLabel)) continue; // ECG leads only
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) continue;

    frames.push({ ts, deviceId, first10 });
  }

  return frames;
}

// Binary search for the vitals entry with the closest timestamp.
function findNearest(entries, ts) {
  let lo = 0;
  let hi = entries.length - 1;
  if (hi < 0) return null;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].ts < ts) lo = mid + 1;
    else hi = mid;
  }

  const candidates = [entries[lo]];
  if (lo > 0) candidates.push(entries[lo - 1]);

  return candidates.reduce((best, cur) =>
    Math.abs(cur.ts - ts) < Math.abs(best.ts - ts) ? cur : best
  );
}

const logsAvailable = fs.existsSync(WAVEFORM_LOG) && fs.existsSync(VITALS_LOG);

describe.skipIf(!logsAvailable)('classifyFrame regression against captured logs', () => {
  it('agrees with HR === "---" for at least 99.9% of real ECG frames', () => {
    const vitalsByDevice = parseVitalsLog(VITALS_LOG);
    const ecgFrames = parseEcgWaveformLog(WAVEFORM_LOG);

    expect(ecgFrames.length).toBeGreaterThan(0);

    let compared = 0;
    let agreements = 0;
    const disagreements = [];

    for (const frame of ecgFrames) {
      const deviceVitals = vitalsByDevice.get(frame.deviceId);
      if (!deviceVitals || deviceVitals.length === 0) continue;

      const nearest = findNearest(deviceVitals, frame.ts);
      if (!nearest) continue;

      const classification = classifyFrame({ data: frame.first10, kind: 'ECG' });
      const sensorOff = classification === 'SENSOR_OFF';
      const hrDashes = nearest.hr === '---';

      compared++;
      if (sensorOff === hrDashes) {
        agreements++;
      } else {
        disagreements.push({ device: frame.deviceId, ts: frame.ts, classification, hr: nearest.hr });
      }
    }

    const agreementRate = agreements / compared;

    // Surface a few examples if the assertion below ever fails.
    if (agreementRate < 0.999 && disagreements.length > 0) {
      console.log('Sample disagreements:', disagreements.slice(0, 10));
    }

    expect(compared).toBeGreaterThan(1000);
    expect(agreementRate).toBeGreaterThanOrEqual(0.999);
  });
});
