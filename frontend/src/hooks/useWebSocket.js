import { useEffect, useState, useRef } from 'react';

export const useWebSocket = (url) => {
  const [isConnected, setIsConnected] = useState(false);
  const [patients, setPatients] = useState(new Map());
  const [waveforms, setWaveforms] = useState(new Map());
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  
  // Refs to store pending updates (avoids excessive re-renders)
  const pendingPatientsRef = useRef(new Map());
  const pendingWaveformsRef = useRef(new Map());
  const updateTimerRef = useRef(null);

  useEffect(() => {
    let ws = null;
    let shouldReconnect = true;

    // Batch updates - only update state every 100ms instead of on every message
    const flushPendingUpdates = () => {
      if (pendingPatientsRef.current.size > 0) {
        setPatients(prev => {
          const newMap = new Map(prev);
          pendingPatientsRef.current.forEach((patient, deviceId) => {
            newMap.set(deviceId, patient);
          });
          pendingPatientsRef.current.clear();
          return newMap;
        });
      }

      if (pendingWaveformsRef.current.size > 0) {
        setWaveforms(prev => {
          const newMap = new Map(prev);
          pendingWaveformsRef.current.forEach((waveformUpdates, deviceId) => {
            const existing = prev.get(deviceId) || [];
            const updated = [...existing, ...waveformUpdates].slice(-100);
            newMap.set(deviceId, updated);
          });
          pendingWaveformsRef.current.clear();
          return newMap;
        });
      }
    };

    // Schedule periodic updates
    const scheduleUpdate = () => {
      if (!updateTimerRef.current) {
        updateTimerRef.current = setTimeout(() => {
          flushPendingUpdates();
          updateTimerRef.current = null;
        }, 50); // Batch updates every 50ms for faster responsiveness
      }
    };

    const connect = () => {
      try {
        // Clean up existing connection
        if (ws) {
          ws.close();
        }

        ws = new WebSocket(url);
        wsRef.current = ws;
        
        ws.onopen = () => {
          console.log('✅ WebSocket connected');
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'initial') {
              // Initial data load - apply immediately
              const patientMap = new Map();
              message.patients.forEach(patient => {
                patientMap.set(patient.information.deviceId, patient);
              });
              setPatients(patientMap);
              
            } else if (message.type === 'vitals') {
              // Batch vital signs updates
              const deviceId = message.data.information.deviceId;
              pendingPatientsRef.current.set(deviceId, message.data);
              scheduleUpdate();
              
            } else if (message.type === 'waveform') {
              // Batch waveform updates
              const deviceId = message.data.information.deviceId;
              
              if (!pendingWaveformsRef.current.has(deviceId)) {
                pendingWaveformsRef.current.set(deviceId, []);
              }
              pendingWaveformsRef.current.get(deviceId).push(message.data);
              
              scheduleUpdate();
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('❌ WebSocket disconnected');
          setIsConnected(false);
          wsRef.current = null;
          
          // Flush any pending updates before reconnecting
          flushPendingUpdates();
          
          if (shouldReconnect && reconnectAttemptsRef.current < 10) {
            const delay = Math.min(3000 * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
            reconnectAttemptsRef.current++;
            
            console.log(`🔄 Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttemptsRef.current})`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          }
        };

      } catch (error) {
        console.error('Error creating WebSocket:', error);
        
        if (shouldReconnect && reconnectAttemptsRef.current < 10) {
          const delay = Math.min(3000 * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      }
    };

    // Initial connection
    connect();

    // Cleanup function
    return () => {
      shouldReconnect = false;
      
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Flush any pending updates
      flushPendingUpdates();
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [url]);

  return { isConnected, patients, waveforms };
};