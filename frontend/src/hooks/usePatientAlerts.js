import { useState, useEffect, useRef } from 'react';

export const usePatientAlerts = (patient, waveforms) => {
  const [alerts, setAlerts] = useState([]);
  const lastAlertTimeRef = useRef({});
  const alertSoundRef = useRef(null);

  useEffect(() => {
    const newAlerts = [];
    const { information, status } = patient;

    // Helper to analyze waveform patterns
    const analyzeWaveform = (waveformData, type) => {
      if (!waveformData?.waveform?.data) return null;
      
      const dataString = waveformData.waveform.data;
      const values = dataString.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
      
      if (values.length === 0) return null;

      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      const range = max - min;

      return { avg, max, min, range, values };
    };

    // Get recent waveforms for this device
    const recentWaveforms = waveforms.slice(-10);
    
    // Find ECG waveform
    const ecgWaveform = recentWaveforms.find(w => 
      w.waveform && (
        w.waveform.name === 'II' || 
        w.waveform.name === 'I' || 
        w.waveform.name?.includes('ECG')
      )
    );

    // Find SpO2 waveform
    const spo2Waveform = recentWaveforms.find(w => 
      w.waveform && (
        w.waveform.name === 'SpO2' || 
        w.waveform.name === 'SPO2'
      )
    );

    // Analyze ECG waveform
    if (ecgWaveform) {
      const ecgAnalysis = analyzeWaveform(ecgWaveform, 'ECG');
      
      if (ecgAnalysis) {
        // Check for flat line (very low range)
        if (ecgAnalysis.range < 5) {
          newAlerts.push({
            type: 'CRITICAL',
            category: 'ECG_FLATLINE',
            message: 'ECG: Flatline or Very Weak Signal',
            icon: '⚠️',
            sound: true
          });
        }
        // Check for irregular rhythm (too much variation)
        else if (ecgAnalysis.range > 100) {
          newAlerts.push({
            type: 'WARNING',
            category: 'ECG_IRREGULAR',
            message: 'ECG: Irregular Rhythm Detected',
            icon: '💓',
            sound: false
          });
        }
        // Check for abnormally high amplitude
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
      // No ECG signal
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
        // Check for flat SpO2 (poor perfusion)
        if (spo2Analysis.range < 3) {
          newAlerts.push({
            type: 'WARNING',
            category: 'SPO2_WEAK',
            message: 'SpO2: Weak Perfusion Signal',
            icon: '🫁',
            sound: false
          });
        }
        // Check for very low SpO2 waveform amplitude
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
      // No SpO2 signal
      newAlerts.push({
        type: 'WARNING',
        category: 'NO_SPO2',
        message: 'No SpO2 Signal Detected',
        icon: '📡',
        sound: false
      });
    }

    // Check device connection status
    if (status?.connected === 0) {
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

    // Play sound for critical alerts (with cooldown)
    newAlerts.forEach(alert => {
      if (alert.sound && alert.type === 'CRITICAL') {
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
  }, [patient, waveforms]);

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

  return { alerts, hasCritical: alerts.some(a => a.type === 'CRITICAL') };
};