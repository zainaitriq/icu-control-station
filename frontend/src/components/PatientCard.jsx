import { useState, useMemo } from 'react';
import { User, Activity, AlertTriangle, Maximize2, Radio } from 'lucide-react';
import WaveformChart from './WaveformChart';
import { usePatientAlerts } from '../hooks/usePatientAlerts';
import { useNow } from '../hooks/useNow';
import { buildStreamStates } from '../utils/signalState';
import PatientDetailModal from './PatientDetailModal';

// Hospital name mapping
const HOSPITAL_NAMES = {
  'TGH': 'Tafeela',
  'RGH': 'Ramtha',
  'MNGH': 'Maan',
  'MFG': 'Mafraq',
  'AIGH': 'Ajloun',
  'AISH': 'Ajloun', // Alternative abbreviation
  'ICU': 'ICU'
};

// Helper function to get full hospital name
const getHospitalName = (groupName) => {
  if (!groupName) return 'ICU';
  return HOSPITAL_NAMES[groupName] || groupName;
};

const SOURCE_STRIP_CHANNELS = [
  { kind: 'ECG', label: 'ECG' },
  { kind: 'SpO2', label: 'SpO2' },
  { kind: 'RIMP', label: 'RESP' },
  { kind: 'CO2', label: 'CO2' },
];

const TONE_CLASSES = {
  green: 'bg-icu-green/20 text-icu-green border-icu-green/40',
  amber: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/40',
  grey: 'bg-gray-700/30 text-gray-500 border-gray-600/40',
};

const SourceStrip = ({ streams }) => (
  <div className="flex flex-wrap gap-1.5 mb-3">
    {SOURCE_STRIP_CHANNELS.map(({ kind, label }) => {
      const streamState = streams[kind];
      const isNA = streamState.state === 'NO_DATA';
      const tone = isNA ? 'grey' : streamState.tone;
      const text = isNA ? 'n/a' : streamState.label;
      return (
        <span
          key={kind}
          title={streamState.message || `${label}: ${text}`}
          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${TONE_CLASSES[tone]}`}
        >
          {label} · {text}
        </span>
      );
    })}
  </div>
);

const PatientCard = ({ patient, waveforms = [], isMuted }) => {
  const { information, VS = [], status } = patient;
  const now = useNow();
  const streams = useMemo(() => buildStreamStates(waveforms, now), [waveforms, now]);
  const { alerts, hasCritical } = usePatientAlerts(patient, waveforms, isMuted, streams);
  const [showModal, setShowModal] = useState(false);

  // Get vital signs by name - return '--' if not found
  const getVital = (name) => {
    if (!VS || VS.length === 0) return '--';
    const vital = VS.find(v => v.name === name);
    return vital?.value || '--';
  };

  const hr = parseInt(getVital('HR'));
  const spo2 = parseInt(getVital('SpO2'));
  const noVitals = isNaN(hr) && isNaN(spo2);
  // "No data from monitor" only when the two streams that actually drive
  // clinical vitals (ECG, SpO2) are both non-live — a device that simply
  // doesn't send RIMP/CO2 should never trip this.
  const noDataFromMonitor = noVitals && streams.ECG.state !== 'LIVE' && streams.SpO2.state !== 'LIVE';

  // Determine status badge
  const getStatusColor = () => {
    // If status object exists and explicitly says not connected
    if (status && status.connected === 0) return 'bg-gray-500';
    if (status?.comfortCare === 1) return 'bg-purple-500';
    if (noDataFromMonitor) return 'bg-gray-500';

    // If we have waveforms but no vitals, show monitoring (blue)
    if (isNaN(hr) || isNaN(spo2)) {
      return streams.ECG.state === 'LIVE' || streams.SpO2.state === 'LIVE' ? 'bg-icu-blue' : 'bg-gray-600';
    }

    if (hr < 40 || hr > 120 || spo2 < 90) return 'bg-icu-critical';
    if (hr < 50 || hr > 100 || spo2 < 95) return 'bg-icu-warning';
    return 'bg-icu-green';
  };

  const getStatusText = () => {
    // Only show disconnected if explicitly set to 0
    if (status && status.connected === 0) return 'DISCONNECTED';
    if (status?.comfortCare === 1) return 'COMFORT CARE';
    if (noDataFromMonitor) return 'NO DATA';

    // If we have waveforms but no vitals
    if (isNaN(hr) || isNaN(spo2)) {
      return streams.ECG.state === 'LIVE' || streams.SpO2.state === 'LIVE' ? 'MONITORING' : 'STANDBY';
    }

    if (hr < 40 || hr > 120 || spo2 < 90) return 'CRITICAL';
    if (hr < 50 || hr > 100 || spo2 < 95) return 'WARNING';
    return 'NORMAL';
  };

  // Keep the latest waveform per type (name) to avoid losing ECG when RIMP/CO2 arrive after
  const latestByType = useMemo(() => {
    const map = new Map();
    waveforms.forEach(w => {
      if (w.waveform?.name) {
        map.set(w.waveform.name, w);
      }
    });
    return map;
  }, [waveforms]);

  // Find specific waveform types from the per-type map
  const findWaveform = (names) => {
    for (const name of names) {
      // Exact match first
      if (latestByType.has(name)) return latestByType.get(name);
      // Partial match
      for (const [key, value] of latestByType) {
        if (key.includes(name)) return value;
      }
    }
    return null;
  };

  // Get ECG waveforms - try multiple lead types (NOT RIMP/CO2)
  const ecgWaveform = findWaveform(['II', 'I', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']);

  // Get SpO2 waveform
  const spo2Waveform = findWaveform(['SpO2', 'SPO2', 'Spo2']);

  return (
    <>
      <div className={`bg-icu-card rounded-lg p-4 hover:border-icu-green/30 transition-all ${
        hasCritical
          ? 'border-2 border-red-500 animate-pulse shadow-lg shadow-red-500/50'
          : 'border border-icu-border'
      }`}>
        {/* Alert Banner - Fixed height to prevent card resizing */}
        <div className="mb-3 h-[72px] overflow-y-auto scrollbar-thin scrollbar-thumb-icu-border scrollbar-track-transparent">
          {alerts.length > 0 ? (
            <div className="space-y-1">
              {alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold ${
                    alert.type === 'CRITICAL'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse'
                      : alert.type === 'TECHNICAL'
                      ? 'bg-amber-500/10 text-amber-500 border border-amber-500/40'
                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{alert.message}</span>
                  <span className="text-xs">{alert.icon}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full" />
          )}
        </div>

        {/* Header with View Details Button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-gray-400" />
            <div>
              <div className="font-mono font-bold text-white">{information?.deviceId || 'Unknown'}</div>
              <div className="text-xs text-gray-400">
                {information?.groupName || 'ICU'} - {getHospitalName(information?.groupName)}
              </div>
              {information?.patientId && information.patientId !== `PT${information.deviceId?.substring(0, 6)}` && (
                <div className="text-xs text-icu-green font-mono mt-0.5">
                  ID: {information.patientId}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor()}`}>
              {getStatusText()}
            </span>
            <button
              onClick={() => setShowModal(true)}
              className="bg-icu-green/20 hover:bg-icu-green/30 text-icu-green p-2 rounded-lg transition-all border border-icu-green/50 hover:border-icu-green group"
              title="View Details"
            >
              <Maximize2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>

        {/* Vital Signs Grid */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <VitalSign icon="❤️" label="HR" value={getVital('HR')} unit="bpm" />
          <VitalSign icon="💨" label="SPO2" value={getVital('SpO2')} unit="%" />
          <VitalSign icon="🌡️" label="TEMP" value={getVital('Tskin') || getVital('Trect')} unit="°C" />
          <VitalSign icon="🫁" label="RR" value={getVital('RR') || getVital('RR/CO2')} unit="bpm" />
        </div>

        {/* Source Strip */}
        <SourceStrip streams={streams} />

        {/* No Data From Monitor Banner */}
        {noDataFromMonitor && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-gray-700/40 border border-gray-500/50 text-gray-300">
            <Radio className="w-4 h-4 flex-shrink-0 text-gray-400" />
            <span className="text-sm font-bold tracking-wide">NO DATA FROM MONITOR</span>
          </div>
        )}

        {/* ECG Waveform */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-400">
              ECG {streams.ECG.leadName || 'n/a'}
            </span>
            {streams.ECG.state === 'LIVE' && (
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-icu-green animate-pulse-glow" />
                <span className="text-xs text-icu-green">Live</span>
              </span>
            )}
          </div>
          <div className="bg-black/50 rounded-md border border-icu-border overflow-hidden">
            <WaveformChart
              data={ecgWaveform}
              color="#00ff88"
              height={120}
              signalState={streams.ECG}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>25mm/s</span>
            <span>{streams.ECG.state === 'LIVE' ? 'Active' : streams.ECG.label}</span>
            <span>10mm/mV</span>
          </div>
        </div>

        {/* SpO2 Waveform */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-400">SpO2</span>
            {streams.SpO2.state === 'LIVE' && (
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-icu-blue animate-pulse-glow" />
                <span className="text-xs text-icu-blue">Live</span>
              </span>
            )}
          </div>
          <div className="bg-black/50 rounded-md border border-icu-border overflow-hidden">
            <WaveformChart
              data={spo2Waveform}
              color="#00a8ff"
              height={100}
              signalState={streams.SpO2}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>25mm/s</span>
            <span>{streams.SpO2.state === 'LIVE' ? 'Active' : streams.SpO2.label}</span>
            <span>10mm/mV</span>
          </div>
        </div>
      </div>

      {/* Patient Detail Modal */}
      {showModal && (
        <PatientDetailModal
          patient={patient}
          waveforms={waveforms}
          alerts={alerts}
          streams={streams}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

const VitalSign = ({ icon, label, value, unit }) => {
  const isNoData = value === '--' || value === 'undefined' || !value;

  // Determine if value is abnormal
  const numValue = parseFloat(value);
  let isAbnormal = false;
  let isCritical = false;

  if (!isNaN(numValue)) {
    if (label === 'HR') {
      isCritical = numValue < 40 || numValue > 120;
      isAbnormal = numValue < 50 || numValue > 100;
    } else if (label === 'SPO2') {
      isCritical = numValue < 90;
      isAbnormal = numValue < 95;
    } else if (label === 'TEMP') {
      isAbnormal = numValue < 35.0 || numValue > 38.5;
    } else if (label === 'RR') {
      isAbnormal = numValue < 8 || numValue > 25;
    }
  }

  return (
    <div className={`bg-black/30 rounded-md p-2 border transition-all ${
      isCritical
        ? 'border-red-500 bg-red-500/10'
        : isAbnormal
        ? 'border-yellow-500 bg-yellow-500/10'
        : 'border-icu-border/50'
    }`}>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs">{icon}</span>
        <span className="text-xs text-gray-400 font-semibold">{label}</span>
        {(isCritical || isAbnormal) && (
          <AlertTriangle className={`w-3 h-3 ml-auto ${
            isCritical ? 'text-red-500' : 'text-yellow-500'
          }`} />
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-bold font-mono ${
          isNoData
            ? 'text-gray-600'
            : isCritical
            ? 'text-red-500 animate-pulse'
            : isAbnormal
            ? 'text-yellow-500'
            : 'text-white'
        }`}>
          {value}
        </span>
        {!isNoData && <span className="text-xs text-gray-500">{unit}</span>}
      </div>
    </div>
  );
};

export default PatientCard;
