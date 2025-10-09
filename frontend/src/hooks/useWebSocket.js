import { useEffect, useState, useRef, useCallback } from 'react';

export const useWebSocket = (url) => {
  const [isConnected, setIsConnected] = useState(false);
  const [patients, setPatients] = useState(new Map());
  const [waveforms, setWaveforms] = useState(new Map());
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'initial') {
            // Initial data load
            const patientMap = new Map();
            message.patients.forEach(patient => {
              patientMap.set(patient.information.deviceId, patient);
            });
            setPatients(patientMap);
          } else if (message.type === 'vitals') {
            // Update vital signs
            setPatients(prev => {
              const newMap = new Map(prev);
              const deviceId = message.data.information.deviceId;
              newMap.set(deviceId, message.data);
              return newMap;
            });
          } else if (message.type === 'waveform') {
            // Update waveform data
            setWaveforms(prev => {
              const newMap = new Map(prev);
              const deviceId = message.data.information.deviceId;
              const existing = newMap.get(deviceId) || [];
              
              // Keep last 50 waveform segments
              const updated = [...existing, message.data].slice(-50);
              newMap.set(deviceId, updated);
              return newMap;
            });
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
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 Attempting to reconnect...');
          connect();
        }, 3000);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, [url]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, patients, waveforms };
};