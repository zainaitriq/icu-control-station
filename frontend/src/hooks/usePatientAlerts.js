import { useState, useEffect, useRef } from 'react';

export const usePatientAlerts = (patient, waveforms, isMuted = true) => {
  const [alerts, setAlerts] = useState([]);
  const lastAlertTimeRef = useRef({});
  const alertSoundRef = useRef(null);

  const analyzeWaveform = (waveform, type) => {
    // Check if waveform is valid and is an array
    if (!waveform || !Array.isArray(waveform) || waveform.length === 0) {
      return null;
    }

    // Extract values - handle different possible structures
    const values = waveform.map(w => {
      // If it's already a number, use it
      if (typeof w === 'number') {
        return w;
      }
      // If it's an object, try to get y, value, or the object itself
      if (typeof w === 'object' && w !== null) {
        return parseFloat(w.y || w.value || 0);
      }
      // Otherwise try to parse it
      return parseFloat(w) || 0;
    });

    if (values.length === 0) return null;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);

    return {
      avg,
      max,
      min,
      range: max - min
    };
  };

  useEffect(() => {
    const newAlerts = [];

    // Get the most recent waveforms (last 5)
    const recentWaveforms = waveforms?.slice(-5) || [];

    // Helper to find waveform by name
    const findWaveform = (names) => {
      for (let i = recentWaveforms.length - 1; i >= 0; i--) {
        const w = recentWaveforms[i];
        if (w?.waveform && names.some(name => 
          w.waveform.name === name || 
          w.waveform.name?.includes(name)
        )) {
          // Get the data - it might be a string or an array
          let data = w.waveform.data;
          
          // If data is a string, parse it into an array
          if (typeof data === 'string') {
            data = data.split(',').map(v => parseFloat(v.trim()) || 0);
          }
          
          return (Array.isArray(data) && data.length > 0) ? data : null;
        }
      }
      return null;
    };

    // Get waveforms - try multiple lead types
    const ecgWaveform = findWaveform(['II', 'I', 'III', 'ECG', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']);
    const spo2Waveform = findWaveform(['SpO2', 'SPO2', 'Spo2']);

    // Analyze ECG waveform
    if (ecgWaveform) {
      const ecgAnalysis = analyzeWaveform(ecgWaveform, 'ECG');
      
      if (ecgAnalysis) {
        if (ecgAnalysis.range < 5) {
          newAlerts.push({
            type: 'CRITICAL',
            category: 'ECG_FLATLINE',
            message: 'ECG: Flatline or Very Weak Signal',
            icon: '⚠️',
            sound: true
          });
        }
        else if (ecgAnalysis.range > 100) {
          newAlerts.push({
            type: 'WARNING',
            category: 'ECG_IRREGULAR',
            message: 'ECG: Irregular Rhythm Detected',
            icon: '💓',
            sound: false
          });
        }
        else if (ecgAnalysis.max > 150) {
          newAlerts.push({
            type: 'WARNING',
            category: 'ECG_HIGH_AMPLITUDE',
            message: 'ECG: Abnormally High Amplitude',
            icon: '📈',
            sound: false
          });
        }
      }
    } else {
      newAlerts.push({
        type: 'WARNING',
        category: 'NO_ECG',
        message: 'No ECG Signal Detected',
        icon: '📡',
        sound: false
      });
    }

    // Analyze SpO2 waveform
    if (spo2Waveform) {
      const spo2Analysis = analyzeWaveform(spo2Waveform, 'SPO2');
      
      if (spo2Analysis) {
        if (spo2Analysis.range < 3) {
          newAlerts.push({
            type: 'WARNING',
            category: 'SPO2_WEAK',
            message: 'SpO2: Weak Perfusion Signal',
            icon: '🫁',
            sound: false
          });
        }
        else if (spo2Analysis.max < 10) {
          newAlerts.push({
            type: 'CRITICAL',
            category: 'SPO2_LOW',
            message: 'SpO2: Very Low Signal Amplitude',
            icon: '🫁',
            sound: true
          });
        }
      }
    } else {
      newAlerts.push({
        type: 'WARNING',
        category: 'NO_SPO2',
        message: 'No SpO2 Signal Detected',
        icon: '📡',
        sound: false
      });
    }

    // Check device connection status
    if (patient.status?.connected === 0) {
      newAlerts.push({
        type: 'CRITICAL',
        category: 'DISCONNECTED',
        message: 'Device Disconnected',
        icon: '🔌',
        sound: true
      });
    }

    // Check for arrhythmia alarms from device
    const arrhythmia = patient.arrhythmia;
    if (arrhythmia?.alarm) {
      newAlerts.push({
        type: 'CRITICAL',
        category: 'ARRHYTHMIA',
        message: `Arrhythmia: ${arrhythmia.alarm}`,
        icon: '⚡',
        sound: true
      });
    }

    // Play sound for critical alerts (with cooldown) - only if not muted
    newAlerts.forEach(alert => {
      if (alert.sound && alert.type === 'CRITICAL' && !isMuted) {
        const now = Date.now();
        const lastAlertTime = lastAlertTimeRef.current[alert.category] || 0;
        
        // Only play sound once every 30 seconds per alert type
        if (now - lastAlertTime > 30000) {
          playAlertSound(alert.type);
          lastAlertTimeRef.current[alert.category] = now;
        }
      }
    });

    setAlerts(newAlerts);
  }, [patient, waveforms, isMuted]);

  const playAlertSound = (type) => {
    // Create audio context if not exists
    if (!alertSoundRef.current) {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        alertSoundRef.current = audioContext;
      } catch (e) {
        console.log('Audio not supported');
        return;
      }
    }

    const ctx = alertSoundRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Critical alert: three beeps
    if (type === 'CRITICAL') {
      oscillator.frequency.value = 800;
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1);

      // Second beep
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 800;
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.1);
      }, 150);

      // Third beep
      setTimeout(() => {
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.frequency.value = 800;
        gain3.gain.setValueAtTime(0.3, ctx.currentTime);
        osc3.start(ctx.currentTime);
        osc3.stop(ctx.currentTime + 0.1);
      }, 300);
    }
  };

  return { 
    alerts, 
    hasCritical: alerts.some(a => a.type === 'CRITICAL')
  };
};