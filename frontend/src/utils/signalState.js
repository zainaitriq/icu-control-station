// Single source of truth for classifying whether a waveform channel carries
// real physiological signal, a disconnected-sensor sentinel, or nothing at all.
//
// SAFETY: the constancy test in classifyFrame is exact (max === min). A real
// asystole recorded through a *connected* electrode always carries baseline
// noise, mains interference and movement artefact, so it can never be
// bit-exact constant across a frame. Do NOT relax this to a tolerance or a
// `range < N` threshold — that would start swallowing genuine flatline alarms.

const SENTINELS = {
  ECG: [500, 2500, -500],
  SpO2: [0],
  RIMP: [],
  CO2: [0],
};

const FRESH_MS = 5000;
const STALE_MS = 30000;
const AGREE_COUNT = 3;

const ECG_LEAD_NAMES = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

const FAULT_LABELS = {
  ECG: { SENSOR_OFF: 'LEAD OFF', INVALID: 'NO SIGNAL' },
  SpO2: { SENSOR_OFF: 'PROBE OFF', INVALID: 'NO SIGNAL' },
  CO2: { SENSOR_OFF: 'PROBE OFF', INVALID: 'NO SIGNAL' },
  RIMP: { SENSOR_OFF: 'PROBE OFF', INVALID: 'NO SIGNAL' },
};

const FAULT_MESSAGES = {
  ECG: {
    SENSOR_OFF: 'ECG lead disconnected — no signal from monitor',
    INVALID: 'ECG signal is constant but not a recognised sensor-off pattern — check leads',
  },
  SpO2: {
    SENSOR_OFF: 'SpO2 probe not on patient — no signal from monitor',
    INVALID: 'SpO2 signal is constant but not a recognised sensor-off pattern — check probe',
  },
  CO2: {
    SENSOR_OFF: 'Capnography module not attached — no signal from monitor',
    INVALID: 'CO2 signal is constant but not a recognised sensor-off pattern — check module',
  },
  RIMP: {
    SENSOR_OFF: 'Respiration sensor not attached — no signal from monitor',
    INVALID: 'RIMP signal is constant but not a recognised sensor-off pattern — check sensor',
  },
};

/**
 * Classify a single waveform frame's payload.
 * frame: { data: string | number[], kind: 'ECG' | 'SpO2' | 'RIMP' | 'CO2' }
 * returns 'OK' | 'SENSOR_OFF' | 'INVALID' | 'EMPTY'
 */
export function classifyFrame(frame) {
  const { data, kind } = frame || {};
  const raw = typeof data === 'string' ? data.split(',') : Array.isArray(data) ? data : [];

  const values = [];
  for (const item of raw) {
    if (typeof item === 'number') {
      if (Number.isFinite(item)) values.push(item);
      continue;
    }
    const trimmed = typeof item === 'string' ? item.trim() : item;
    // Skip empty strings explicitly — Number('') is 0, which would turn an
    // empty payload into a constant-0 frame and therefore a false "sensor off".
    if (trimmed === '' || trimmed === null || trimmed === undefined) continue;
    const num = Number(trimmed);
    if (Number.isFinite(num)) values.push(num);
  }

  if (values.length === 0) return 'EMPTY';

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max === min) {
    const sentinels = SENTINELS[kind] || [];
    return sentinels.includes(min) ? 'SENSOR_OFF' : 'INVALID';
  }

  return 'OK';
}

function formatClockTime(ms) {
  if (ms == null) return '';
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

// Resolve a consensus classification across the most recent frames so a
// single odd frame cannot flip the panel between fault and live states.
function resolveConsensus(classifications) {
  const counts = {};
  classifications.forEach(c => {
    counts[c] = (counts[c] || 0) + 1;
  });
  const total = classifications.length;
  const [topClass, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  if (topCount > total / 2) return topClass;

  // No strict majority — bias toward the safer (fault) reading rather than LIVE.
  return (
    classifications.find(c => c === 'SENSOR_OFF') ||
    classifications.find(c => c === 'INVALID') ||
    classifications.find(c => c === 'EMPTY') ||
    classifications[classifications.length - 1]
  );
}

/**
 * Resolve the display state for one channel's stream of frames.
 * frames: [{ data, receivedAt }] ordered oldest -> newest
 * now: Date.now() at evaluation time
 * kind: 'ECG' | 'SpO2' | 'RIMP' | 'CO2'
 */
export function getStreamState(frames, now, kind) {
  if (!frames || frames.length === 0) {
    return {
      state: 'NO_DATA',
      ageMs: null,
      drawTrace: false,
      isFault: false,
      label: 'NO DATA',
      message: 'No data received from monitor',
      tone: 'grey',
      lastAt: null,
    };
  }

  const lastFrame = frames[frames.length - 1];
  const lastAt = lastFrame.receivedAt;
  const ageMs = now - lastAt;

  if (ageMs > STALE_MS) {
    return {
      state: 'LOST',
      ageMs,
      drawTrace: false,
      isFault: true,
      label: `NO DATA since ${formatClockTime(lastAt)}`,
      message: 'No data received from monitor for over 30 seconds',
      tone: 'amber',
      lastAt,
    };
  }

  if (ageMs > FRESH_MS) {
    return {
      state: 'STALE',
      ageMs,
      drawTrace: false,
      isFault: true,
      label: `${Math.floor(ageMs / 1000)}s ago`,
      message: 'Signal has not updated recently',
      tone: 'amber',
      lastAt,
    };
  }

  // Fresh: sensor state wins over freshness — frames ARE arriving, they just
  // may carry no usable signal.
  const recent = frames.slice(-AGREE_COUNT);
  const classifications = recent.map(f => classifyFrame({ data: f.data, kind }));
  const consensus = resolveConsensus(classifications);

  if (consensus === 'SENSOR_OFF') {
    return {
      state: 'SENSOR_OFF',
      ageMs,
      drawTrace: false,
      isFault: true,
      label: FAULT_LABELS[kind]?.SENSOR_OFF || 'SENSOR OFF',
      message: FAULT_MESSAGES[kind]?.SENSOR_OFF || 'Sensor disconnected — no signal from monitor',
      tone: 'amber',
      lastAt,
    };
  }

  if (consensus === 'INVALID' || consensus === 'EMPTY') {
    return {
      state: 'INVALID',
      ageMs,
      drawTrace: false,
      isFault: true,
      label: FAULT_LABELS[kind]?.INVALID || 'NO SIGNAL',
      message: FAULT_MESSAGES[kind]?.INVALID || 'Signal present but not physiological',
      tone: 'amber',
      lastAt,
    };
  }

  return {
    state: 'LIVE',
    ageMs,
    drawTrace: true,
    isFault: false,
    label: 'Live',
    message: '',
    tone: 'green',
    lastAt,
  };
}

function classifyChannelKind(name) {
  if (!name) return null;
  const upper = name.toUpperCase();
  if (upper === 'SPO2' || upper.includes('PLETH')) return 'SpO2';
  if (upper === 'RIMP') return 'RIMP';
  if (upper.includes('CO2')) return 'CO2';
  if (ECG_LEAD_NAMES.some(lead => lead.toUpperCase() === upper)) return 'ECG';
  return null;
}

/**
 * Group a device's accumulated waveform frames by channel kind and resolve
 * each channel's stream state. This is the single place PatientCard and
 * PatientDetailModal both read from, so they can never disagree.
 *
 * waveforms: [{ waveform: { name, data }, receivedAt }]
 * returns { ECG: {...state, leadName}, SpO2: {...state}, RIMP: {...state}, CO2: {...state} }
 */
export function buildStreamStates(waveforms, now) {
  const framesByKind = { ECG: [], SpO2: [], RIMP: [], CO2: [] };
  let ecgLeadName = null;

  (waveforms || []).forEach(w => {
    const name = w?.waveform?.name;
    const kind = classifyChannelKind(name);
    if (!kind) return;

    framesByKind[kind].push({
      data: w.waveform.data,
      receivedAt: w.receivedAt ?? now,
    });

    if (kind === 'ECG') ecgLeadName = name;
  });

  const states = {};
  Object.keys(framesByKind).forEach(kind => {
    states[kind] = {
      ...getStreamState(framesByKind[kind], now, kind),
      ...(kind === 'ECG' ? { leadName: ecgLeadName } : {}),
    };
  });

  return states;
}
