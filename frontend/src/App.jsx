import { useState, useMemo, useEffect } from 'react';
import { Activity, Wifi, WifiOff, Clock, Database } from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket';
import PatientCard from './components/PatientCard';

function App() {
  const { isConnected, patients, waveforms } = useWebSocket('ws://localhost:8081');
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [waitingTime, setWaitingTime] = useState(0);

  // Track waiting time
  useEffect(() => {
    if (isConnected && patients.size === 0) {
      const interval = setInterval(() => {
        setWaitingTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setWaitingTime(0);
    }
  }, [isConnected, patients.size]);

  // Convert patients Map to array
  const patientsArray = useMemo(() => Array.from(patients.values()), [patients]);

  // Group patients by location
  const groupedPatients = useMemo(() => {
    const groups = new Map();
    
    patientsArray.forEach(patient => {
      const location = patient.information?.groupName || 'Unknown';
      if (!groups.has(location)) {
        groups.set(location, []);
      }
      groups.get(location).push(patient);
    });

    return groups;
  }, [patientsArray]);

  // Get filter counts
  const filterCounts = useMemo(() => {
    const counts = {
      ALL: patientsArray.length,
      TGH: 0,
      MNGH: 0,
      RGH: 0,
      AISH: 0,
      MFG: 0
    };

    patientsArray.forEach(patient => {
      const location = patient.information?.groupName;
      if (location && counts.hasOwnProperty(location)) {
        counts[location]++;
      }
    });

    return counts;
  }, [patientsArray]);

  // Get status counts
  const statusCounts = useMemo(() => {
    let normal = 0, warning = 0, critical = 0;

    patientsArray.forEach(patient => {
      const hr = parseInt(patient.VS?.find(v => v.name === 'HR')?.value || 0);
      const spo2 = parseInt(patient.VS?.find(v => v.name === 'SpO2')?.value || 0);

      if (hr < 40 || hr > 120 || spo2 < 90) {
        critical++;
      } else if (hr < 50 || hr > 100 || spo2 < 95) {
        warning++;
      } else {
        normal++;
      }
    });

    return { normal, warning, critical };
  }, [patientsArray]);

  // Filter patients by selected location
  const filteredPatients = useMemo(() => {
    if (selectedFilter === 'ALL') return patientsArray;
    return patientsArray.filter(p => p.information?.groupName === selectedFilter);
  }, [patientsArray, selectedFilter]);

  const formatWaitTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-icu-dark text-white">
      {/* Header */}
      <header className="bg-icu-card border-b border-icu-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-icu-green" />
            <div>
              <h1 className="text-2xl font-bold">ICU Medical Monitor</h1>
              <p className="text-sm text-gray-400">Real-time Patient Monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2 px-4 py-2 bg-icu-dark rounded-lg border border-icu-border">
              {isConnected ? (
                <>
                  <Wifi className="w-5 h-5 text-icu-green animate-pulse" />
                  <span className="text-icu-green font-semibold">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-5 h-5 text-red-500" />
                  <span className="text-red-500 font-semibold">Disconnected</span>
                </>
              )}
            </div>
            
            {/* Data Stream Status */}
            {isConnected && (
              <div className="flex items-center gap-2 px-4 py-2 bg-icu-dark rounded-lg border border-icu-border">
                <Database className="w-5 h-5 text-icu-blue" />
                <span className="text-gray-300">
                  {patientsArray.length > 0 
                    ? `${patientsArray.length} Active` 
                    : 'Awaiting Data'}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="px-6 py-4 border-b border-icu-border">
        <div className="flex gap-2 flex-wrap">
          {Object.entries(filterCounts).map(([key, count]) => (
            <button
              key={key}
              onClick={() => setSelectedFilter(key)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                selectedFilter === key
                  ? 'bg-icu-green text-black'
                  : 'bg-icu-card border border-icu-border text-white hover:border-icu-green/50'
              }`}
            >
              {key} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Status Summary */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-icu-card border border-icu-border rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Total Patients</div>
            <div className="text-3xl font-bold">{patientsArray.length}</div>
          </div>
          <div className="bg-icu-card border border-green-500/20 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Normal</div>
            <div className="text-3xl font-bold text-icu-green">{statusCounts.normal}</div>
          </div>
          <div className="bg-icu-card border border-yellow-500/20 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Warning</div>
            <div className="text-3xl font-bold text-icu-warning">{statusCounts.warning}</div>
          </div>
          <div className="bg-icu-card border border-red-500/20 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Critical</div>
            <div className="text-3xl font-bold text-icu-critical">{statusCounts.critical}</div>
          </div>
        </div>
      </div>

      {/* Patient Grid or Waiting State */}
      <div className="px-6 pb-6">
        {!isConnected ? (
          <div className="text-center py-20">
            <WifiOff className="w-16 h-16 text-red-500 mx-auto mb-4 animate-pulse" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">Connection Lost</h3>
            <p className="text-gray-500">Attempting to reconnect to data stream...</p>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-20">
            <div className="relative inline-block mb-6">
              <Database className="w-16 h-16 text-icu-blue mx-auto animate-pulse" />
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-icu-green rounded-full flex items-center justify-center">
                <Wifi className="w-4 h-4 text-black" />
              </div>
            </div>
            <h3 className="text-2xl font-semibold text-gray-300 mb-2">
              Monitoring Kafka Stream
            </h3>
            <p className="text-gray-400 mb-4">
              System is connected and ready. Waiting for patient data from NKDHS Digital Health Platform...
            </p>
            <div className="flex items-center justify-center gap-3 text-gray-500">
              <Clock className="w-5 h-5" />
              <span className="font-mono text-lg">{formatWaitTime(waitingTime)}</span>
            </div>
            <div className="mt-8 bg-icu-card border border-icu-border rounded-lg p-6 max-w-2xl mx-auto">
              <h4 className="text-sm font-semibold text-gray-400 mb-3">Listening to Topics:</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-icu-green">
                  <div className="w-2 h-2 bg-icu-green rounded-full animate-pulse"></div>
                  <span>VITAL_SIGNS_LIVE</span>
                </div>
                <div className="flex items-center gap-2 text-icu-green">
                  <div className="w-2 h-2 bg-icu-green rounded-full animate-pulse"></div>
                  <span>WAVEFORM_LIVE</span>
                </div>
                <div className="flex items-center gap-2 text-icu-green">
                  <div className="w-2 h-2 bg-icu-green rounded-full animate-pulse"></div>
                  <span>LIMITS_LIVE</span>
                </div>
                <div className="flex items-center gap-2 text-icu-green">
                  <div className="w-2 h-2 bg-icu-green rounded-full animate-pulse"></div>
                  <span>ESCALATION_LIVE</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPatients.map(patient => (
              <PatientCard
                key={patient.information.deviceId}
                patient={patient}
                waveforms={waveforms.get(patient.information.deviceId) || []}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;