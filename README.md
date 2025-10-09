# ICU Control Station

Real-time patient monitoring system that consumes data from Nihon Kohden Digital Health Solutions (NKDHS) Kafka stream and displays live vital signs and waveforms.

![ICU Dashboard](screenshot.png)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│              NKDHS Kafka Broker                     │
│  (VITAL_SIGNS_LIVE, WAVEFORM_LIVE, LIMITS_LIVE)   │
└─────────────────┬───────────────────────────────────┘
                  │ SSL/TLS
                  ↓
        ┌─────────────────────┐
        │  Kafka Consumer      │  (Port: N/A)
        │  (consumer.js)       │
        └──────────┬───────────┘
                   │ HTTP
                   ↓
        ┌─────────────────────┐
        │  WebSocket Bridge    │  (Port: 8081)
        │  (websocket-bridge.js)│
        └──────────┬───────────┘
                   │ WebSocket
                   ↓
        ┌─────────────────────┐
        │  React Frontend      │  (Port: 3000)
        │  (Real-time UI)      │
        └─────────────────────┘
```

## ✨ Features

- ✅ **Real-time Vital Signs** - HR, SpO2, Temperature, Respiratory Rate
- ✅ **Live Waveforms** - ECG and SpO2 waveforms with real-time updates
- ✅ **Patient Status Monitoring** - Normal, Warning, Critical classifications
- ✅ **Multi-Hospital Support** - Filter by hospital location
- ✅ **Auto-Reconnection** - Automatic reconnection on connection loss
- ✅ **SSL/TLS Security** - Secure connection to Kafka broker

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Access to NKDHS Kafka Broker
- SSL Certificates (CA, Key, Certificate)

### Installation

```bash
# Clone and setup
git clone <repository>
cd icu-control-station

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Configuration

1. **Place SSL Certificates** in `backend/certs/`:
   - `clientwflive-ca1-signed.crt`
   - `clientwflive.key`
   - `clientwflive.certificate.pem`

2. **Configure Environment** - Edit `backend/.env`:

```env
# Kafka Configuration
KAFKA_BROKER_HOST=your-kafka-broker-host
KAFKA_BROKER_PORT=9092
CLIENT_ID=icu-dashboard-consumer
CONSUMER_GROUP_ID=icu-dashboard-group

# SSL Certificate Paths
SSL_CA_PATH=./certs/clientwflive-ca1-signed.crt
SSL_KEY_PATH=./certs/clientwflive.key
SSL_CERT_PATH=./certs/clientwflive.certificate.pem

# Kafka Topics
VITAL_SIGNS_TOPIC=VITAL_SIGNS_LIVE
WAVEFORM_TOPIC=WAVEFORM_LIVE
LIMITS_TOPIC=LIMITS_LIVE
ESCALATION_TOPIC=ESCALATION_LIVE

# Consumer Settings
FROM_BEGINNING=false
LOG_LEVEL=info

# WebSocket Bridge
BRIDGE_URL=http://localhost:8081

# Server Configuration
PORT=3001
```

### Running the System

#### Terminal 1: Start WebSocket Bridge

```bash
cd backend
npm run bridge
```

Expected output:
```
✅ Dashboard Bridge running on port 8081
🌐 WebSocket: ws://localhost:8081
🌐 HTTP API: http://localhost:8081
```

#### Terminal 2: Start Kafka Consumer

```bash
cd backend
npm run consumer
```

Expected output:
```
🚀 Starting NKDHS ICU Consumer...
✅ Connected to Kafka broker
✅ Subscribed to: VITAL_SIGNS_LIVE
✅ Subscribed to: WAVEFORM_LIVE
✅ Consumer running - Data flowing to ICU Dashboard!
```

#### Terminal 3: Start Frontend

```bash
cd frontend
npm run dev
```

Expected output:
```
VITE ready in xxx ms
➜ Local: http://localhost:3000/
```

#### Terminal 4 (Optional): Backend API

```bash
cd backend
npm run dev
```

### Check System Status

```bash
cd backend
npm run status
```

This will show:
- ✅ Bridge status and connected clients
- ✅ Number of patients being monitored
- ✅ API server status
- 🔗 All service URLs

## 📊 Data Flow

### Vital Signs Data
```json
{
  "information": {
    "deviceId": "OR09",
    "patientId": "OR09009",
    "groupName": "ICU",
    "bedId": "546184809",
    "timeStamp": 1723499158471
  },
  "VS": [
    { "name": "HR", "value": "80" },
    { "name": "SpO2", "value": "98" },
    { "name": "Tskin", "value": "36.5" }
  ]
}
```

### Waveform Data
```json
{
  "information": {
    "deviceId": "ICU04",
    "patientId": "51681",
    "timeStart": 1605787134693
  },
  "waveform": {
    "name": "II",
    "data": "16,15,13,11,8,7,5,2,1...",
    "sampleRate": 8
  }
}
```

## 🧪 Testing Without Kafka

For development/testing without Kafka access:

```bash
cd backend
npm run test-producer
```

This generates simulated patient data for 7 patients with realistic waveforms.

## 🛠️ Troubleshooting

### No Data Appearing

1. **Check Consumer Logs**
   ```bash
   # Look for messages like:
   💓 VITAL SIGNS: Device=XXX Count=20
   ```

2. **Check Bridge Health**
   ```bash
   curl http://localhost:8081/health
   ```

3. **Check WebSocket Connection**
   - Open browser console (F12)
   - Look for WebSocket connection messages

### Connection Issues

- Verify SSL certificates are in `backend/certs/`
- Check `.env` configuration
- Ensure Kafka broker is accessible
- Verify firewall rules

### Frontend Not Updating

- Check "Connected" indicator in top-right
- Check browser console for errors
- Verify bridge is running on port 8081

## 📁 Project Structure

```
icu-control-station/
├── backend/
│   ├── src/
│   │   ├── consumer.js           # Kafka consumer
│   │   ├── websocket-bridge.js   # WebSocket server
│   │   ├── server.js             # Express API
│   │   └── test-producer.js      # Test data generator
│   ├── certs/                    # SSL certificates
│   ├── .env                      # Configuration
│   ├── package.json
│   └── check-status.js           # Health check script
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── PatientCard.jsx
│   │   │   └── WaveformChart.jsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── tailwind.config.js
└── README.md
```

## 🎨 UI Components

### Patient Card
- Patient ID and location
- Status badge (Normal/Warning/Critical)
- Vital signs grid (HR, SpO2, Temp, RR)
- Live ECG waveform (green)
- Live SpO2 waveform (blue)

### Dashboard Features
- Filter by hospital location
- Status summary (Total/Normal/Warning/Critical)
- Real-time connection status
- Waiting state with elapsed time
- Auto-reconnection handling

## 🔐 Security

- SSL/TLS encryption for Kafka connection
- Certificate-based authentication
- WebSocket secure connection ready
- Environment variable configuration

## 📈 Performance

- Efficient WebSocket broadcasting
- Canvas-based waveform rendering
- Optimized data structures (Map)
- Batched updates for smooth animations

## 🚦 System States

### 1. Disconnected
- Red "Disconnected" indicator
- "Connection Lost" message
- Automatic reconnection attempts

### 2. Connected - Waiting for Data
- Green "Connected" indicator
- "Monitoring Kafka Stream" message
- Elapsed wait time counter
- List of subscribed topics

### 3. Connected - Receiving Data
- Green "Connected" indicator
- Patient count in header
- Live patient cards with waveforms
- Real-time updates

## 📝 License

Copyright © 2025 - ICU Control Station

## 👥 Support

For issues or questions:
1. Check system status: `npm run status`
2. Review logs in each terminal
3. Check browser console (F12)
4. Verify Kafka connectivity

---

**Built with** React, Node.js, KafkaJS, WebSocket, Tailwind CSS