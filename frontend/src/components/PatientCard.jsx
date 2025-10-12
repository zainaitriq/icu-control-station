import { User, Activity, AlertTriangle } from 'lucide-react';
import WaveformChart from './WaveformChart';
import { usePatientAlerts } from '../hooks/usePatientAlerts';

const PatientCard = ({ patient, waveforms = [] ,isMuted }) => {
  const { information, VS = [], status } = patient;
const { alerts, hasCritical } = usePatientAlerts(patient, waveforms, isMuted);  
  // Get vital signs by name - return '--' if not found
  const getVital = (name) => {
    if (!VS || VS.length === 0) return '--';
    const vital = VS.find(v => v.name === name);
    return vital?.value || '--';
  };

  // Determine status badge
  const getStatusColor = () => {
    // If status object exists and explicitly says not connected
    if (status && status.connected === 0) return 'bg-gray-500';
    if (status?.comfortCare === 1) return 'bg-purple-500';
    
    // Check if we have vital signs to determine status
    const hr = parseInt(getVital('HR'));
    const spo2 = parseInt(getVital('SpO2'));
    
    // If we have waveforms but no vitals, show monitoring (blue)
    if (isNaN(hr) || isNaN(spo2)) {
      return waveforms.length > 0 ? 'bg-icu-blue' : 'bg-gray-600';
    }
    
    if (hr < 40 || hr > 120 || spo2 < 90) return 'bg-icu-critical';
    if (hr < 50 || hr > 100 || spo2 < 95) return 'bg-icu-warning';
    return 'bg-icu-green';
  };

  const getStatusText = () => {
    // Only show disconnected if explicitly set to 0
    if (status && status.connected === 0) return 'DISCONNECTED';
    if (status?.comfortCare === 1) return 'COMFORT CARE';
    
    const hr = parseInt(getVital('HR'));
    const spo2 = parseInt(getVital('SpO2'));
    
    // If we have waveforms but no vitals
    if (isNaN(hr) || isNaN(spo2)) {
      return waveforms.length > 0 ? 'MONITORING' : 'STANDBY';
    }
    
    if (hr < 40 || hr > 120 || spo2 < 90) return 'CRITICAL';
    if (hr < 50 || hr > 100 || spo2 < 95) return 'WARNING';
    return 'NORMAL';
  };

  // Get the most recent 5 waveforms for this device
  const recentWaveforms = waveforms.slice(-5);

  // Find specific waveform types (check all recent waveforms)
  const findWaveform = (names) => {
    for (let i = recentWaveforms.length - 1; i >= 0; i--) {
      const w = recentWaveforms[i];
      if (w.waveform && names.some(name => 
        w.waveform.name === name || 
        w.waveform.name?.includes(name)
      )) {
        return w;
      }
    }
    return null;
  };

  // Get ECG waveforms - try multiple lead types
  const ecgWaveform = findWaveform(['II', 'I', 'III', 'ECG', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']);
  
  // Get SpO2 waveform
  const spo2Waveform = findWaveform(['SpO2', 'SPO2', 'Spo2']);

  // Fallback: if no specific waveforms found, use any recent waveform for ECG
  const fallbackECG = ecgWaveform || (recentWaveforms.length > 0 ? recentWaveforms[recentWaveforms.length - 1] : null);

  return (
    <div className={`bg-icu-card rounded-lg p-4 hover:border-icu-green/30 transition-all ${
      hasCritical 
        ? 'border-2 border-red-500 animate-pulse shadow-lg shadow-red-500/50' 
        : 'border border-icu-border'
    }`}>
      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div className="mb-3 space-y-1">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold ${
                alert.type === 'CRITICAL'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse'
                  : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
              }`}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{alert.message}</span>
              <span className="text-xs">{alert.icon}</span>
            </div>
          ))}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-gray-400" />
          <div>
            <div className="font-mono font-bold text-white">{information?.deviceId || 'Unknown'}</div>
            <div className="text-xs text-gray-400">
              {information?.groupName || 'ICU'} • {information?.bedId || 'N/A'}
            </div>
            {information?.patientId && information.patientId !== `PT${information.deviceId?.substring(0, 6)}` && (
              <div className="text-xs text-icu-green font-mono mt-0.5">
                ID: {information.patientId}
              </div>
            )}
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>

      {/* Vital Signs Grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <VitalSign icon="❤️" label="HR" value={getVital('HR')} unit="bpm" />
        <VitalSign icon="💨" label="SPO2" value={getVital('SpO2')} unit="%" />
        <VitalSign icon="🌡️" label="TEMP" value={getVital('Tskin') || getVital('Trect')} unit="°C" />
        <VitalSign icon="🫁" label="RR" value={getVital('RR') || getVital('RR/CO2')} unit="bpm" />
      </div>

      {/* ECG Waveform */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-400">
            ECG {ecgWaveform?.waveform?.name || fallbackECG?.waveform?.name || 'II'}
          </span>
          {fallbackECG?.waveform?.data && (
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-icu-green animate-pulse-glow" />
              <span className="text-xs text-icu-green">Live</span>
            </span>
          )}
        </div>
        <div className="bg-black/50 rounded-md border border-icu-border overflow-hidden">
          <WaveformChart 
            data={fallbackECG} 
            color="#00ff88" 
            height={120}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>25mm/s</span>
          <span>{fallbackECG?.waveform?.data ? 'Active' : 'Waiting'}</span>
          <span>10mm/mV</span>
        </div>
      </div>

      {/* SpO2 Waveform */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-400">SpO2</span>
          {spo2Waveform?.waveform?.data && (
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
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>25mm/s</span>
          <span>{spo2Waveform?.waveform?.data ? 'Active' : 'Waiting'}</span>
          <span>10mm/mV</span>
        </div>
      </div>
    </div>
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