import { useState, useMemo, useEffect } from 'react';

import { useWebSocket } from './hooks/useWebSocket';
import PatientCard from './components/PatientCard';
import { usePatientAlerts } from './hooks/usePatientAlerts';
import { Activity, Wifi, WifiOff, Clock, Database, Bell, AlertTriangle, Volume2, VolumeX } from 'lucide-react';

function App() {
  // Construct WebSocket URL dynamically based on current hostname
  const hostname = window.location.hostname;
  const wsUrl = import.meta.env.VITE_WS_URL || "ws://" + hostname + ":8081";
  const { isConnected, patients, waveforms } = useWebSocket(wsUrl);
  // const [selectedFilter, setSelectedFilter] = useState('ALL'); // ALL tab removed
  const [selectedFilter, setSelectedFilter] = useState('TGH');
  const [waitingTime, setWaitingTime] = useState(0);
  const [isGlobalMuted, setIsGlobalMuted] = useState(true);
  const [showCriticalTooltip, setShowCriticalTooltip] = useState(false);
  const [showWarningTooltip, setShowWarningTooltip] = useState(false);
  const [showNormalTooltip, setShowNormalTooltip] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const patientsPerPage = 6;

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
      // ALL: patientsArray.length, // ALL tab removed
      TGH: 0,
      MNGH: 0,
      RGH: 0,
      AIGH: 0,
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
    let normal = 0, warning = 0, critical = 0, noData = 0;

    patientsArray.forEach(patient => {
      // No `|| 0` fallback: parseInt('---') is NaN and must stay NaN so a
      // bed with no usable vitals routes to noData instead of silently
      // becoming a false "Normal" (0 bpm / 0% would read as critical, and a
      // missing value becoming 0 with the old `|| 0` fallback masked that).
      const hr = parseInt(patient.VS?.find(v => v.name === 'HR')?.value);
      const spo2 = parseInt(patient.VS?.find(v => v.name === 'SpO2')?.value);

      if (Number.isNaN(hr) && Number.isNaN(spo2)) {
        noData++;
      } else if (hr < 40 || hr > 120 || spo2 < 90) {
        critical++;
      } else if (hr < 50 || hr > 100 || spo2 < 95) {
        warning++;
      } else {
        normal++;
      }
    });

    return { normal, warning, critical, noData };
  }, [patientsArray]);

  // Get critical patients by ICU/hospital group
  const criticalByICU = useMemo(() => {
    const icuMap = new Map();

    patientsArray.forEach(patient => {
      const hr = parseInt(patient.VS?.find(v => v.name === 'HR')?.value || 0);
      const spo2 = parseInt(patient.VS?.find(v => v.name === 'SpO2')?.value || 0);
      const groupName = patient.information?.groupName || 'Unknown';

      // Check if patient is critical
      if (hr < 40 || hr > 120 || spo2 < 90) {
        if (!icuMap.has(groupName)) {
          icuMap.set(groupName, 0);
        }
        icuMap.set(groupName, icuMap.get(groupName) + 1);
      }
    });

    return icuMap;
  }, [patientsArray]);

  // Get warning patients by ICU/hospital group
  const warningByICU = useMemo(() => {
    const icuMap = new Map();

    patientsArray.forEach(patient => {
      const hr = parseInt(patient.VS?.find(v => v.name === 'HR')?.value || 0);
      const spo2 = parseInt(patient.VS?.find(v => v.name === 'SpO2')?.value || 0);
      const groupName = patient.information?.groupName || 'Unknown';

      // Check if patient is warning (not critical)
      if (!(hr < 40 || hr > 120 || spo2 < 90)) {
        if (hr < 50 || hr > 100 || spo2 < 95) {
          if (!icuMap.has(groupName)) {
            icuMap.set(groupName, 0);
          }
          icuMap.set(groupName, icuMap.get(groupName) + 1);
        }
      }
    });

    return icuMap;
  }, [patientsArray]);

  // Get normal patients by ICU/hospital group
  const normalByICU = useMemo(() => {
    const icuMap = new Map();

    patientsArray.forEach(patient => {
      const hr = parseInt(patient.VS?.find(v => v.name === 'HR')?.value || 0);
      const spo2 = parseInt(patient.VS?.find(v => v.name === 'SpO2')?.value || 0);
      const groupName = patient.information?.groupName || 'Unknown';

      // Check if patient is normal (not critical or warning)
      if (!(hr < 40 || hr > 120 || spo2 < 90)) {
        if (!(hr < 50 || hr > 100 || spo2 < 95)) {
          if (!icuMap.has(groupName)) {
            icuMap.set(groupName, 0);
          }
          icuMap.set(groupName, icuMap.get(groupName) + 1);
        }
      }
    });

    return icuMap;
  }, [patientsArray]);

  // Count total alerts across all patients
  const alertCounts = useMemo(() => {
    let totalAlerts = 0;
    let criticalAlerts = 0;

    patientsArray.forEach(patient => {
      const hr = parseInt(patient.VS?.find(v => v.name === 'HR')?.value || 0);
      const spo2 = parseInt(patient.VS?.find(v => v.name === 'SpO2')?.value || 0);

      if (hr < 40 || hr > 120) {
        criticalAlerts++;
        totalAlerts++;
      } else if (hr < 50 || hr > 100) {
        totalAlerts++;
      }

      if (spo2 < 90) {
        criticalAlerts++;
        totalAlerts++;
      } else if (spo2 < 95) {
        totalAlerts++;
      }

      if (patient.status?.connected === 0) {
        criticalAlerts++;
        totalAlerts++;
      }
    });

    return { total: totalAlerts, critical: criticalAlerts };
  }, [patientsArray]);

  // Filter patients by selected location
  const filteredPatients = useMemo(() => {
    // if (selectedFilter === 'ALL') return patientsArray; // ALL tab removed
    return patientsArray.filter(p => p.information?.groupName === selectedFilter);
  }, [patientsArray, selectedFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / patientsPerPage));
  const paginatedPatients = useMemo(() => {
    const start = (currentPage - 1) * patientsPerPage;
    return filteredPatients.slice(start, start + patientsPerPage);
  }, [filteredPatients, currentPage, patientsPerPage]);

  // Reset to page 1 when filter changes or if current page exceeds total
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

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
              <h1 className="text-2xl font-bold">JDHC</h1>
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

            {/* Mute/Unmute Button */}
            <button
              onClick={() => setIsGlobalMuted(prev => !prev)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${isGlobalMuted
                  ? 'bg-icu-dark border-gray-600 hover:border-gray-500'
                  : 'bg-icu-blue/20 border-icu-blue hover:bg-icu-blue/30'
                }`}
            >
              {isGlobalMuted ? (
                <>
                  <VolumeX className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-400 font-semibold">Muted</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-5 h-5 text-icu-blue" />
                  <span className="text-icu-blue font-semibold">Sound On</span>
                </>
              )}
            </button>

            {/* Alert Indicator */}
            {/**
          * 
             {alertCounts.total > 0 && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                alertCounts.critical > 0
                  ? 'bg-red-500/20 border-red-500 animate-pulse'
                  : 'bg-yellow-500/20 border-yellow-500'
              }`}>
                <Bell className={`w-5 h-5 ${alertCounts.critical > 0 ? 'text-red-500' : 'text-yellow-500'}`} />
                <div className="flex flex-col">
                  <span className={`text-xs ${alertCounts.critical > 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                    Active Alerts
                  </span>
                  <span className={`font-bold ${alertCounts.critical > 0 ? 'text-red-500' : 'text-yellow-500'}`}>
                    {alertCounts.total} {alertCounts.critical > 0 && `(${alertCounts.critical} Critical)`}
                  </span>
                </div>
              </div>
            )}
          * 
          * 
          */}

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
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${selectedFilter === key
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
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-icu-card border border-icu-border rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Total Patients</div>
            <div className="text-3xl font-bold">{patientsArray.length}</div>
          </div>
          <div className="bg-icu-card border border-gray-500/20 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">No Data</div>
            <div className="text-3xl font-bold text-gray-400">{statusCounts.noData}</div>
          </div>
          <div
            className="bg-icu-card border border-green-500/20 rounded-lg p-4 relative cursor-pointer hover:border-green-500/50 transition-all"
            onMouseEnter={() => setShowNormalTooltip(true)}
            onMouseLeave={() => setShowNormalTooltip(false)}
          >
            <div className="text-sm text-gray-400 mb-1">Normal</div>
            <div className="text-3xl font-bold text-icu-green">{statusCounts.normal}</div>

            {/* Tooltip */}
            {showNormalTooltip && normalByICU.size > 0 && (
              <div className="absolute z-50 left-0 top-full mt-2 bg-icu-dark border border-green-500/50 rounded-lg shadow-xl p-4 min-w-[250px]">
                <div className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Normal ICUs
                </div>
                <div className="space-y-2">
                  {Array.from(normalByICU.entries())
                    .sort((a, b) => b[1] - a[1]) // Sort by count descending
                    .map(([icu, count]) => (
                      <div key={icu} className="flex items-center justify-between text-sm">
                        <span className="text-gray-300 font-medium">{icu}</span>
                        <span className="text-green-400 font-bold bg-green-500/20 px-2 py-1 rounded">
                          {count} {count === 1 ? 'patient' : 'patients'}
                        </span>
                      </div>
                    ))}
                </div>
                <div className="mt-3 pt-3 border-t border-green-500/20 text-xs text-gray-500">
                  Normal: HR 50-100 bpm, SpO2 ≥95%
                </div>
              </div>
            )}
          </div>
          <div
            className="bg-icu-card border border-yellow-500/20 rounded-lg p-4 relative cursor-pointer hover:border-yellow-500/50 transition-all"
            onMouseEnter={() => setShowWarningTooltip(true)}
            onMouseLeave={() => setShowWarningTooltip(false)}
          >
            <div className="text-sm text-gray-400 mb-1">Warning</div>
            <div className="text-3xl font-bold text-icu-warning">{statusCounts.warning}</div>

            {/* Tooltip */}
            {showWarningTooltip && warningByICU.size > 0 && (
              <div className="absolute z-50 left-0 top-full mt-2 bg-icu-dark border border-yellow-500/50 rounded-lg shadow-xl p-4 min-w-[250px]">
                <div className="text-sm font-semibold text-yellow-400 mb-2 flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Warning ICUs
                </div>
                <div className="space-y-2">
                  {Array.from(warningByICU.entries())
                    .sort((a, b) => b[1] - a[1]) // Sort by count descending
                    .map(([icu, count]) => (
                      <div key={icu} className="flex items-center justify-between text-sm">
                        <span className="text-gray-300 font-medium">{icu}</span>
                        <span className="text-yellow-400 font-bold bg-yellow-500/20 px-2 py-1 rounded">
                          {count} {count === 1 ? 'patient' : 'patients'}
                        </span>
                      </div>
                    ))}
                </div>
                <div className="mt-3 pt-3 border-t border-yellow-500/20 text-xs text-gray-500">
                  Warning: HR 40-50 or 100-120 bpm, SpO2 90-95%
                </div>
              </div>
            )}
          </div>
          <div
            className="bg-icu-card border border-red-500/20 rounded-lg p-4 relative cursor-pointer hover:border-red-500/50 transition-all"
            onMouseEnter={() => setShowCriticalTooltip(true)}
            onMouseLeave={() => setShowCriticalTooltip(false)}
          >
            <div className="text-sm text-gray-400 mb-1">Critical</div>
            <div className="text-3xl font-bold text-icu-critical">{statusCounts.critical}</div>

            {/* Tooltip */}
            {showCriticalTooltip && criticalByICU.size > 0 && (
              <div className="absolute z-50 left-0 top-full mt-2 bg-icu-dark border border-red-500/50 rounded-lg shadow-xl p-4 min-w-[250px]">
                <div className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Critical ICUs
                </div>
                <div className="space-y-2">
                  {Array.from(criticalByICU.entries())
                    .sort((a, b) => b[1] - a[1]) // Sort by count descending
                    .map(([icu, count]) => (
                      <div key={icu} className="flex items-center justify-between text-sm">
                        <span className="text-gray-300 font-medium">{icu}</span>
                        <span className="text-red-400 font-bold bg-red-500/20 px-2 py-1 rounded">
                          {count} {count === 1 ? 'patient' : 'patients'}
                        </span>
                      </div>
                    ))}
                </div>
                <div className="mt-3 pt-3 border-t border-red-500/20 text-xs text-gray-500">
                  Critical: HR &lt;40 or &gt;120 bpm, SpO2 &lt;90%
                </div>
              </div>
            )}
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
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedPatients.map(patient => (
              <PatientCard
                key={patient.information.deviceId}
                patient={patient}
                waveforms={waveforms.get(patient.information.deviceId) || []}
                isMuted={isGlobalMuted}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-lg font-semibold bg-icu-card border border-icu-border text-white hover:border-icu-green/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-9 h-9 rounded-lg font-semibold transition-all ${
                      currentPage === page
                        ? 'bg-icu-green text-black'
                        : 'bg-icu-card border border-icu-border text-white hover:border-icu-green/50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-lg font-semibold bg-icu-card border border-icu-border text-white hover:border-icu-green/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <span className="text-sm text-gray-400 ml-3">
                Showing {(currentPage - 1) * patientsPerPage + 1}-{Math.min(currentPage * patientsPerPage, filteredPatients.length)} of {filteredPatients.length}
              </span>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;