// test-producer.js - Generates test data for development
import axios from 'axios';

const BRIDGE_URL = 'http://localhost:8081';

const hospitals = ['TGH', 'MNGH', 'RGH', 'AIGH', 'MFG'];
const deviceIds = [
  '2004939691', '9542003175', '9282005907', '9811012691',
  '9472005129', '9402003212', '9502002478'
];

// Generate random vital signs
function generateVitalSigns(deviceId, hospital) {
  const baseHR = 60 + Math.floor(Math.random() * 40);
  const baseSpo2 = 94 + Math.floor(Math.random() * 6);
  const baseTemp = 36.0 + Math.random() * 1.5;
  const baseRR = 12 + Math.floor(Math.random() * 8);

  return {
    information: {
      facilityId: `site-${Math.floor(Math.random() * 5) + 1}`,
      groupName: hospital,
      deviceId: deviceId,
      bedId: `${Math.floor(Math.random() * 999999999)}`,
      alarmMode: 0,
      status: {
        admitted: 1,
        connected: 1,
        comfortCare: 0,
        pairingSAI: 0,
        pairingV2: 0,
        pairing: 0,
        transferring: 0,
        measuring: 1
      },
      patientDOB: '19850505',
      timeStamp: Date.now(),
      patientId: `PT${deviceId.substring(0, 6)}`,
      patientName: `Patient, ${deviceId.substring(0, 4)}`,
      sequenceNumber: Math.floor(Math.random() * 30000),
      packetNumber: 1,
      totalPackets: 1
    },
    VS: [
      { name: 'HR', value: String(baseHR + Math.floor(Math.random() * 10 - 5)) },
      { name: 'VPC/m', value: '0' },
      { name: 'ST I', value: '+0.03' },
      { name: 'ST II', value: '+0.06' },
      { name: 'SpO2', value: String(baseSpo2 + Math.floor(Math.random() * 3 - 1)) },
      { name: 'SpO2/PR', value: String(baseHR) },
      { name: 'Tskin', value: baseTemp.toFixed(1) },
      { name: 'Trect', value: (baseTemp + 0.5).toFixed(1) },
      { name: 'RR', value: String(baseRR + Math.floor(Math.random() * 4 - 2)) },
      { name: 'RR/CO2', value: String(baseRR) },
      { name: 'EtCO2', value: String(35 + Math.floor(Math.random() * 8)) },
      { name: 'ART-S', value: String(110 + Math.floor(Math.random() * 30)) },
      { name: 'ART-D', value: String(70 + Math.floor(Math.random() * 20)) },
      { name: 'ART-M', value: String(85 + Math.floor(Math.random() * 20)) }
    ]
  };
}

// Generate ECG waveform data
function generateECGWaveform(deviceId) {
  // Generate realistic ECG pattern
  const ecgPattern = [];
  const sampleRate = 8; // 8ms between samples
  const duration = 1024; // 1024ms segment

  for (let i = 0; i < duration / sampleRate; i++) {
    const phase = (i * sampleRate / duration) * Math.PI * 2;
    
    // P wave
    if (phase < 0.5) {
      ecgPattern.push(Math.floor(3 * Math.sin(phase * 4)));
    }
    // QRS complex
    else if (phase >= 1.5 && phase < 2.0) {
      const qrsPhase = (phase - 1.5) / 0.5;
      if (qrsPhase < 0.3) {
        ecgPattern.push(Math.floor(-8 * qrsPhase / 0.3)); // Q
      } else if (qrsPhase < 0.5) {
        ecgPattern.push(Math.floor(30 * (qrsPhase - 0.3) / 0.2)); // R
      } else if (qrsPhase < 0.7) {
        ecgPattern.push(Math.floor(30 - 40 * (qrsPhase - 0.5) / 0.2)); // S
      } else {
        ecgPattern.push(Math.floor(-10 + 10 * (qrsPhase - 0.7) / 0.3));
      }
    }
    // T wave
    else if (phase >= 3.5 && phase < 4.5) {
      ecgPattern.push(Math.floor(8 * Math.sin((phase - 3.5) * Math.PI)));
    }
    // Baseline
    else {
      ecgPattern.push(Math.floor(Math.random() * 2 - 1));
    }
  }

  return {
    information: {
      deviceId: deviceId,
      patientId: `PT${deviceId.substring(0, 6)}`,
      timeStart: Date.now(),
      numberOfWaveforms: 1,
      sequenceStart: Math.floor(Math.random() * 30000),
      sequenceEnd: Math.floor(Math.random() * 30000),
      timeEnd: Date.now()
    },
    waveform: {
      name: 'II',
      data: ecgPattern.join(','),
      sampleRate: sampleRate
    }
  };
}

// Generate SpO2 waveform data
function generateSpO2Waveform(deviceId) {
  const spo2Pattern = [];
  const sampleRate = 8;
  const duration = 1024;

  for (let i = 0; i < duration / sampleRate; i++) {
    const phase = (i * sampleRate / duration) * Math.PI * 2;
    // Simple pulse wave
    const value = Math.floor(50 * Math.sin(phase) + 10 * Math.sin(phase * 2));
    spo2Pattern.push(value);
  }

  return {
    information: {
      deviceId: deviceId,
      patientId: `PT${deviceId.substring(0, 6)}`,
      timeStart: Date.now(),
      numberOfWaveforms: 1,
      sequenceStart: Math.floor(Math.random() * 30000),
      sequenceEnd: Math.floor(Math.random() * 30000),
      timeEnd: Date.now()
    },
    waveform: {
      name: 'SpO2',
      data: spo2Pattern.join(','),
      sampleRate: sampleRate
    }
  };
}

// Send data to bridge
async function sendToBridge(endpoint, data) {
  try {
    await axios.post(`${BRIDGE_URL}${endpoint}`, {
      topic: endpoint.includes('vitals') ? 'VITAL_SIGNS_LIVE' : 'WAVEFORM_LIVE',
      partition: 0,
      offset: String(Date.now()),
      message: {
        value: JSON.stringify(data)
      }
    });
    return true;
  } catch (error) {
    console.error(`Error sending to bridge:`, error.message);
    return false;
  }
}

// Main test producer
async function startTestProducer() {
  console.log('🧪 Starting Test Data Producer...');
  console.log(`📡 Sending data to: ${BRIDGE_URL}`);
  console.log(`👥 Simulating ${deviceIds.length} patients`);
  console.log('');

  let messageCount = 0;

  // Send initial vital signs for all devices
  for (const deviceId of deviceIds) {
    const hospital = hospitals[Math.floor(Math.random() * hospitals.length)];
    const vitals = generateVitalSigns(deviceId, hospital);
    await sendToBridge('/kafka/vitals', vitals);
    messageCount++;
  }

  console.log(`✅ Sent initial vital signs for ${deviceIds.length} patients`);

  // Continuously send updates
  setInterval(async () => {
    for (const deviceId of deviceIds) {
      // Send vital signs update (every 3 seconds)
      if (messageCount % 3 === 0) {
        const hospital = hospitals[Math.floor(Math.random() * hospitals.length)];
        const vitals = generateVitalSigns(deviceId, hospital);
        await sendToBridge('/kafka/vitals', vitals);
      }

      // Send ECG waveform
      const ecg = generateECGWaveform(deviceId);
      await sendToBridge('/kafka/waveform', ecg);

      // Send SpO2 waveform
      const spo2 = generateSpO2Waveform(deviceId);
      await sendToBridge('/kafka/waveform', spo2);

      messageCount++;
    }

    if (messageCount % 100 === 0) {
      console.log(`📊 Sent ${messageCount} messages...`);
    }
  }, 1000); // Send updates every second
}

// Check bridge health before starting
async function checkBridge() {
  try {
    const response = await axios.get(`${BRIDGE_URL}/health`);
    console.log(`✅ Bridge is healthy: ${response.data.status}`);
    return true;
  } catch (error) {
    console.error(`❌ Bridge not available at ${BRIDGE_URL}`);
    console.error('Please make sure the bridge is running: npm run bridge');
    return false;
  }
}

// Start
(async () => {
  const bridgeHealthy = await checkBridge();
  if (bridgeHealthy) {
    await startTestProducer();
  } else {
    process.exit(1);
  }
})();