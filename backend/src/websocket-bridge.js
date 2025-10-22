// websocket-bridge.js - FIXED VERSION
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

    // FIXED: Normalize and extract group name consistently
    extractGroupName(patientInfo, deviceId) {
        // Priority 1: Use groupName from Kafka if it looks like a hospital code
        if (patientInfo?.groupName) {
            const kafkaGroup = patientInfo.groupName.toUpperCase().trim();
            
            // If it's a known hospital code, use it
            if (['TGH', 'MNGH', 'RGH', 'AISH', 'MFG'].includes(kafkaGroup)) {
                return kafkaGroup;
            }
        }
        
        // Priority 2: Extract from device ID
        if (deviceId.includes('TGH')) return 'TGH';
        if (deviceId.includes('MNGH')) return 'MNGH';
        if (deviceId.includes('RGH')) return 'RGH';
        if (deviceId.includes('AIGH')) return 'AISH';
        if (deviceId.includes('MFG')) return 'MFG';
        
        // Priority 3: Use pattern match
        const match = deviceId.match(/([A-Z]+)-/);
        if (match) return match[1];
        
        // Priority 4: Use Kafka groupName as-is or default to ICU
        return patientInfo?.groupName || 'ICU';
    }

    ensurePatientExists(deviceId, patientInfo) {
        if (!this.patientData.has(deviceId)) {
            const groupName = this.extractGroupName(patientInfo, deviceId);
            
            this.patientData.set(deviceId, {
                information: {
                    deviceId: deviceId,
                    patientId: patientInfo?.patientId || `PT${deviceId.substring(0, 6)}`,
                    facilityId: patientInfo?.facilityId || 'site-1',
                    bedId: patientInfo?.bedId || 'Unknown',
                    groupName: groupName,
                    patientName: patientInfo?.patientId ? `Patient ${patientInfo.patientId}` : `Patient ${deviceId}`,
                    timeStamp: Date.now(),
                    alarmMode: patientInfo?.alarmMode || 0,
                    status: patientInfo?.status || {
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
            
            console.log(`📝 Created patient: ${deviceId} → Group: ${groupName}`);
        }
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

        // Debug endpoint to check groups
        this.app.get('/api/debug/groups', (req, res) => {
            const groupCounts = {};
            
            this.patientData.forEach((patient) => {
                const groupName = patient.information?.groupName || 'UNKNOWN';
                groupCounts[groupName] = (groupCounts[groupName] || 0) + 1;
            });
            
            res.json({
                totalPatients: this.patientData.size,
                groupCounts: groupCounts,
                patients: Array.from(this.patientData.values()).map(p => ({
                    deviceId: p.information?.deviceId,
                    groupName: p.information?.groupName,
                    hasVitals: p.VS && p.VS.length > 0
                }))
            });
        });

        // FIXED: Receive vital signs - preserve groupName
        this.app.post('/kafka/vitals', (req, res) => {
            try {
                const { message } = req.body;
                const data = JSON.parse(message.value);
                
                const deviceId = data.information?.deviceId;
                if (!deviceId) {
                    return res.status(400).json({ error: 'Missing deviceId' });
                }

                // Ensure patient exists (creates if needed)
                this.ensurePatientExists(deviceId, data.information);

                // Get existing patient to preserve groupName
                const existingPatient = this.patientData.get(deviceId);
                const preservedGroupName = existingPatient.information.groupName;

                // Update patient data - PRESERVE the groupName we set
                this.patientData.set(deviceId, {
                    ...data,
                    information: {
                        ...data.information,
                        groupName: preservedGroupName  // ✅ Keep the normalized group name
                    },
                    lastUpdate: Date.now()
                });

                // Broadcast to all connected clients
                this.broadcast({
                    type: 'vitals',
                    data: {
                        ...data,
                        information: {
                            ...data.information,
                            groupName: preservedGroupName
                        }
                    }
                });

                res.json({ success: true });
            } catch (error) {
                console.error('Error processing vitals:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Receive waveform data
        this.app.post('/kafka/waveform', (req, res) => {
            try {
                const { message } = req.body;
                const data = JSON.parse(message.value);
                
                const deviceId = data.information?.deviceId;
                if (!deviceId) {
                    return res.status(400).json({ error: 'Missing deviceId' });
                }

                // Ensure patient exists
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

                if (waveforms.length > 100) {
                    waveforms.shift();
                }

                // Broadcast
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

        // Get waveform data
        this.app.get('/api/waveform/:deviceId', (req, res) => {
            const waveforms = this.waveformData.get(req.params.deviceId) || [];
            res.json(waveforms);
        });
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        this.clients.forEach(client => {
            if (client.readyState === 1) {
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