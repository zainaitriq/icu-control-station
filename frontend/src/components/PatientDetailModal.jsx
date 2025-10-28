import { X, User, Activity, AlertTriangle, Heart, Droplet, Thermometer, Wind } from 'lucide-react';
import WaveformChart from './WaveformChart';

const HOSPITAL_NAMES = {
  'TGH': 'Tafeela',
  'RGH': 'Ramtha',
  'MNGH': 'Maan',
  'MFG': 'Mafraq',
  'AIGH': 'Ajloun',
  'AISH': 'Ajloun',
  'ICU': 'ICU'
};

const getHospitalName = (groupName) => {
  if (!groupName) return 'ICU';
  return HOSPITAL_NAMES[groupName] || groupName;
};

const PatientDetailModal = ({ patient, waveforms = [], alerts = [], onClose }) => {
  const { information, VS = [] } = patient;

  const getVital = (name) => {
    if (!VS || VS.length === 0) return '--';
    const vital = VS.find(v => v.name === name);
    return vital?.value || '--';
  };

  // Get recent waveforms
  const recentWaveforms = waveforms.slice(-5);

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

  const ecgWaveform = findWaveform(['II', 'I', 'III', 'ECG', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']);
  const spo2Waveform = findWaveform(['SpO2', 'SPO2', 'Spo2']);
  const fallbackECG = ecgWaveform || (recentWaveforms.length > 0 ? recentWaveforms[recentWaveforms.length - 1] : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-icu-dark border-2 border-icu-green rounded-xl max-w-5xl w-full max-h-[95vh] overflow-y-auto shadow-2xl shadow-icu-green/20">
        {/* Header */}
        <div className="sticky top-0 bg-icu-dark border-b border-icu-green p-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="bg-icu-green/20 p-2 rounded border border-icu-green">
              <User className="w-5 h-5 text-icu-green" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-mono">{information?.deviceId || 'Unknown'}</h2>
              <p className="text-gray-400 text-xs">
                {information?.groupName || 'ICU'} - {getHospitalName(information?.groupName)} • Bed: {information?.bedId || 'N/A'}
              </p>
              {information?.patientId && information.patientId !== `PT${information.deviceId?.substring(0, 6)}` && (
                <p className="text-icu-green font-mono text-xs">
                  Patient ID: {information.patientId}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 p-2 rounded-lg transition-all border border-red-500/50 hover:border-red-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div className="p-3 border-b border-icu-border">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Active Alerts
            </h3>
            <div className="space-y-1">
              {alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold ${
                    alert.type === 'CRITICAL'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  <span className="flex-1">{alert.message}</span>
                  <span className="text-sm">{alert.icon}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vital Signs Section */}
        <div className="p-3 border-b border-icu-border">
          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4 text-icu-green" />
            Vital Signs
          </h3>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <DetailedVitalSign 
              icon={<Heart className="w-4 h-4" />}
              label="Heart Rate" 
              value={getVital('HR')} 
              unit="bpm"
              color="text-red-400"
            />
            <DetailedVitalSign 
              icon={<Droplet className="w-4 h-4" />}
              label="SpO2" 
              value={getVital('SpO2')} 
              unit="%"
              color="text-blue-400"
            />
            <DetailedVitalSign 
              icon={<Thermometer className="w-4 h-4" />}
              label="Temperature" 
              value={getVital('Tskin') || getVital('Trect')} 
              unit="°C"
              color="text-orange-400"
            />
            <DetailedVitalSign 
              icon={<Wind className="w-4 h-4" />}
              label="Respiratory Rate" 
              value={getVital('RR') || getVital('RR/CO2')} 
              unit="bpm"
              color="text-cyan-400"
            />
          </div>

          {/* Additional Vital Signs */}
          <div className="grid grid-cols-5 gap-2">
            {getVital('Psys') !== '--' && (
              <DetailedVitalSign 
                label="Systolic BP" 
                value={getVital('Psys')} 
                unit="mmHg"
                color="text-purple-400"
                compact
              />
            )}
            {getVital('Pdia') !== '--' && (
              <DetailedVitalSign 
                label="Diastolic BP" 
                value={getVital('Pdia')} 
                unit="mmHg"
                color="text-purple-400"
                compact
              />
            )}
            {getVital('Pmean') !== '--' && (
              <DetailedVitalSign 
                label="Mean BP" 
                value={getVital('Pmean')} 
                unit="mmHg"
                color="text-purple-400"
                compact
              />
            )}
            {getVital('EtCO2') !== '--' && (
              <DetailedVitalSign 
                label="EtCO2" 
                value={getVital('EtCO2')} 
                unit="mmHg"
                color="text-green-400"
                compact
              />
            )}
            {getVital('FiCO2') !== '--' && (
              <DetailedVitalSign 
                label="FiCO2" 
                value={getVital('FiCO2')} 
                unit="mmHg"
                color="text-green-400"
                compact
              />
            )}
          </div>
        </div>

        {/* Waveforms Section */}
        <div className="p-3">
          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4 text-icu-green" />
            Live Waveforms
          </h3>

          {/* ECG Waveform */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-300">
                ECG {ecgWaveform?.waveform?.name || fallbackECG?.waveform?.name || 'II'}
              </span>
              {fallbackECG?.waveform?.data && (
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-icu-green animate-pulse-glow" />
                  <span className="text-xs text-icu-green font-semibold">Live</span>
                </span>
              )}
            </div>
            <div className="bg-black/50 rounded border border-icu-green/50 overflow-hidden">
              <WaveformChart 
                data={fallbackECG} 
                color="#00ff88" 
                height={140}
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
              <span className="text-xs font-semibold text-gray-300">SpO2 Plethysmograph</span>
              {spo2Waveform?.waveform?.data && (
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-icu-blue animate-pulse-glow" />
                  <span className="text-xs text-icu-blue font-semibold">Live</span>
                </span>
              )}
            </div>
            <div className="bg-black/50 rounded border border-icu-blue/50 overflow-hidden">
              <WaveformChart 
                data={spo2Waveform} 
                color="#00a8ff" 
                height={140}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>25mm/s</span>
              <span>{spo2Waveform?.waveform?.data ? 'Active' : 'Waiting'}</span>
              <span>10mm/mV</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-icu-dark border-t border-icu-green p-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-icu-green hover:bg-icu-green/80 text-black text-sm font-semibold rounded transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const DetailedVitalSign = ({ icon, label, value, unit, color = "text-white", compact = false }) => {
  const isNoData = value === '--' || value === 'undefined' || !value;

  if (compact) {
    return (
      <div className="bg-icu-card border border-icu-border rounded p-2 hover:border-icu-green/30 transition-all">
        <span className="text-xs text-gray-400 block mb-1">{label}</span>
        <div className="flex items-baseline gap-1">
          <span className={`text-lg font-bold font-mono ${
            isNoData ? 'text-gray-600' : 'text-white'
          }`}>
            {value}
          </span>
          {!isNoData && <span className="text-xs text-gray-500">{unit}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-icu-card border border-icu-border rounded p-2 hover:border-icu-green/30 transition-all">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className={color}>{icon}</span>}
        <span className="text-xs text-gray-400 font-semibold">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold font-mono ${
          isNoData ? 'text-gray-600' : 'text-white'
        }`}>
          {value}
        </span>
        {!isNoData && <span className="text-xs text-gray-500">{unit}</span>}
      </div>
    </div>
  );
};

export default PatientDetailModal;