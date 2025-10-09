// websocket-bridge.js - WebSocket server for real-time data streaming
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

class DashboardBridge {
    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });
        this.clients = new Set();
        this.patientData = new Map();
        this.waveformData = new Map();
        
        this.setupMiddleware();
        this.setupWebSocket();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json({ limit: '50mb' }));
    }

    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('✅ New WebSocket client connected');
            this.clients.add(ws);

            // Send current data to new client
            ws.send(JSON.stringify({
                type: 'initial',
                patients: Array.from(this.patientData.values())
            }));

            ws.on('close', () => {
                console.log('❌ Client disconnected');
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.clients.delete(ws);
            });
        });
    }

    ensurePatientExists(deviceId, patientInfo) {
        if (!this.patientData.has(deviceId)) {
            // Create patient entry with default values
            this.patientData.set(deviceId, {
                information: {
                    deviceId: deviceId,
                    patientId: patientInfo?.patientId || `PT${deviceId.substring(0, 6)}`,
                    facilityId: 'site-1',
                    bedId: patientInfo?.bedId || 'Unknown',
                    groupName: this.extractHospitalFromDevice(deviceId),
                    patientName: patientInfo?.patientId ? `Patient ${patientInfo.patientId}` : `Patient ${deviceId}`,
                    timeStamp: Date.now(),
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
                    }
                },
                VS: [],
                lastUpdate: Date.now()
            });
            console.log(`📝 Created patient entry for device: ${deviceId} with patient ID: ${patientInfo?.patientId || 'N/A'}`);
        } else {
            // Update patient ID if it exists in the new data
            const existing = this.patientData.get(deviceId);
            if (patientInfo?.patientId && patientInfo.patientId !== existing.information.patientId) {
                existing.information.patientId = patientInfo.patientId;
                existing.information.patientName = `Patient ${patientInfo.patientId}`;
                console.log(`✏️ Updated patient ID for ${deviceId}: ${patientInfo.patientId}`);
            }
        }
    }

    extractHospitalFromDevice(deviceId) {
        // Extract hospital from device ID
        if (deviceId.includes('TGH')) return 'TGH';
        if (deviceId.includes('MNGH')) return 'MNGH';
        if (deviceId.includes('RGH')) return 'RGH';
        if (deviceId.includes('AIGH')) return 'AISH';
        if (deviceId.includes('MFG')) return 'MFG';
        
        // Default extraction from device ID pattern
        const match = deviceId.match(/([A-Z]+)-/);
        return match ? match[1] : 'ICU';
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                connectedClients: this.clients.size,
                patientsMonitored: this.patientData.size
            });
        });

        // Receive vital signs from Kafka consumer
        this.app.post('/kafka/vitals', (req, res) => {
            try {
                const { message } = req.body;
                const data = JSON.parse(message.value);
                
                const deviceId = data.information?.deviceId;
                if (!deviceId) {
                    return res.status(400).json({ error: 'Missing deviceId' });
                }

                // Ensure patient exists
                this.ensurePatientExists(deviceId, data.information);

                // Update patient data with vital signs
                this.patientData.set(deviceId, {
                    ...data,
                    lastUpdate: Date.now()
                });

                console.log(`💓 Updated vitals for ${deviceId}`);

                // Broadcast to all connected clients
                this.broadcast({
                    type: 'vitals',
                    data: data
                });

                res.json({ success: true });
            } catch (error) {
                console.error('Error processing vitals:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Receive waveform data from Kafka consumer
        this.app.post('/kafka/waveform', (req, res) => {
            try {
                const { message } = req.body;
                const data = JSON.parse(message.value);
                
                const deviceId = data.information?.deviceId;
                if (!deviceId) {
                    return res.status(400).json({ error: 'Missing deviceId' });
                }

                // Ensure patient exists (create from waveform data if needed)
                this.ensurePatientExists(deviceId, data.information);

                // Update last activity time
                const patient = this.patientData.get(deviceId);
                if (patient) {
                    patient.lastUpdate = Date.now();
                    patient.information.timeStamp = Date.now();
                }

                // Store waveform data
                if (!this.waveformData.has(deviceId)) {
                    this.waveformData.set(deviceId, []);
                }

                const waveforms = this.waveformData.get(deviceId);
                waveforms.push(data);

                // Keep only last 100 waveform segments per device
                if (waveforms.length > 100) {
                    waveforms.shift();
                }

                // Broadcast to all connected clients
                this.broadcast({
                    type: 'waveform',
                    data: data
                });

                res.json({ success: true });
            } catch (error) {
                console.error('Error processing waveform:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Get all patients
        this.app.get('/api/patients', (req, res) => {
            const patients = Array.from(this.patientData.values());
            res.json(patients);
        });

        // Get specific patient
        this.app.get('/api/patients/:deviceId', (req, res) => {
            const patient = this.patientData.get(req.params.deviceId);
            if (!patient) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            res.json(patient);
        });

        // Get waveform data for specific patient
        this.app.get('/api/waveform/:deviceId', (req, res) => {
            const waveforms = this.waveformData.get(req.params.deviceId) || [];
            res.json(waveforms);
        });
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        this.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                try {
                    client.send(data);
                } catch (error) {
                    console.error('Error broadcasting to client:', error);
                }
            }
        });
    }

    start(port = 8081) {
        this.server.listen(port, () => {
            console.log(`✅ Dashboard Bridge running on port ${port}`);
            console.log(`🌐 WebSocket: ws://localhost:${port}`);
            console.log(`🌐 HTTP API: http://localhost:${port}`);
        });
    }
}

const bridge = new DashboardBridge();
bridge.start(8081);

export default DashboardBridge;