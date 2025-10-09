import { useState, useEffect, useRef } from 'react';

export const usePatientAlerts = (patient, waveforms) => {
  const [alerts, setAlerts] = useState([]);
  const lastAlertTimeRef = useRef({});
  const alertSoundRef = useRef(null);

  // Alert thresholds
  const THRESHOLDS = {
    HR_LOW_CRITICAL: 40,
    HR_LOW_WARNING: 50,
    HR_HIGH_WARNING: 100,
    HR_HIGH_CRITICAL: 120,
    SPO2_LOW_CRITICAL: 90,
    SPO2_LOW_WARNING: 95,
    TEMP_LOW: 35.0,
    TEMP_HIGH: 38.5,
    RR_LOW: 8,
    RR_HIGH: 25,
  };

  useEffect(() => {
    const newAlerts = [];
    const { VS = [], information, status } = patient;

    // Helper to get vital sign value
    const getVital = (name) => {
      const vital = VS.find(v => v.name === name);
      const value = parseFloat(vital?.value);
      return isNaN(value) ? null : value;
    };

    // Check Heart Rate
    const hr = getVital('HR');
    if (hr !== null) {
      if (hr < THRESHOLDS.HR_LOW_CRITICAL) {
        newAlerts.push({
          type: 'CRITICAL',
          category: 'BRADYCARDIA',
          message: `Severe Bradycardia: ${hr} bpm`,
          value: hr,
          icon: '💔',
          sound: true
        });
      } else if (hr < THRESHOLDS.HR_LOW_WARNING) {
        newAlerts.push({
          type: 'WARNING',
          category: 'BRADYCARDIA',
          message: `Bradycardia: ${hr} bpm`,
          value: hr,
          icon: '⚠️',
          sound: false
        });
      } else if (hr > THRESHOLDS.HR_HIGH_CRITICAL) {
        newAlerts.push({
          type: 'CRITICAL',
          category: 'TACHYCARDIA',
          message: `Severe Tachycardia: ${hr} bpm`,
          value: hr,
          icon: '💓',
          sound: true
        });
      } else if (hr > THRESHOLDS.HR_HIGH_WARNING) {
        newAlerts.push({
          type: 'WARNING',
          category: 'TACHYCARDIA',
          message: `Tachycardia: ${hr} bpm`,
          value: hr,
          icon: '⚠️',
          sound: false
        });
      }
    }

    // Check SpO2
    const spo2 = getVital('SpO2');
    if (spo2 !== null) {
      if (spo2 < THRESHOLDS.SPO2_LOW_CRITICAL) {
        newAlerts.push({
          type: 'CRITICAL',
          category: 'HYPOXIA',
          message: `Critical Low SpO2: ${spo2}%`,
          value: spo2,
          icon: '🫁',
          sound: true
        });
      } else if (spo2 < THRESHOLDS.SPO2_LOW_WARNING) {
        newAlerts.push({
          type: 'WARNING',
          category: 'HYPOXIA',
          message: `Low SpO2: ${spo2}%`,
          value: spo2,
          icon: '⚠️',
          sound: false
        });
      }
    }

    // Check Temperature
    const temp = getVital('Tskin') || getVital('Trect');
    if (temp !== null) {
      if (temp < THRESHOLDS.TEMP_LOW) {
        newAlerts.push({
          type: 'WARNING',
          category: 'HYPOTHERMIA',
          message: `Low Temperature: ${temp}°C`,
          value: temp,
          icon: '🌡️',
          sound: false
        });
      } else if (temp > THRESHOLDS.TEMP_HIGH) {
        newAlerts.push({
          type: 'WARNING',
          category: 'FEVER',
          message: `High Temperature: ${temp}°C`,
          value: temp,
          icon: '🌡️',
          sound: false
        });
      }
    }

    // Check Respiratory Rate
    const rr = getVital('RR') || getVital('RR/CO2');
    if (rr !== null) {
      if (rr < THRESHOLDS.RR_LOW) {
        newAlerts.push({
          type: 'WARNING',
          category: 'BRADYPNEA',
          message: `Low Respiratory Rate: ${rr}/min`,
          value: rr,
          icon: '🫁',
          sound: false
        });
      } else if (rr > THRESHOLDS.RR_HIGH) {
        newAlerts.push({
          type: 'WARNING',
          category: 'TACHYPNEA',
          message: `High Respiratory Rate: ${rr}/min`,
          value: rr,
          icon: '🫁',
          sound: false
        });
      }
    }

    // Check device status
    if (status?.connected === 0) {
      newAlerts.push({
        type: 'CRITICAL',
        category: 'DISCONNECTED',
        message: 'Device Disconnected',
        icon: '🔌',
        sound: true
      });
    }

    // Check for arrhythmia alarms
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