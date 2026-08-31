// websocket-bridge.js - FIXED VERSION
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

// File logger for bridge vitals investigation
const logsDir = path.resolve('logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const bridgeLogStream = fs.createWriteStream(path.join(logsDir, 'bridge-vitals.log'), { flags: 'a' });

function logBridge(msg) {
    bridgeLogStream.write(`[${new Date().toISOString()}] ${msg}\n`);
}

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

            // Send initial patient data
            ws.send(JSON.stringify({
                type: 'initial',
                patients: Array.from(this.patientData.values())
            }));

            // Send accumulated waveform data for each patient — but only
            // frames recent enough to still be trustworthy. A browser that
            // opens after the feed has died must not receive a chart that
            // looks live; each replayed frame keeps its real receivedAt so
            // the client's own staleness clock stays correct.
            const replayCutoff = Date.now() - 10000;
            this.waveformData.forEach((waveforms, deviceId) => {
                waveforms.forEach(waveform => {
                    if ((waveform.receivedAt ?? 0) >= replayCutoff) {
                        ws.send(JSON.stringify({
                            type: 'waveform',
                            data: waveform
                        }));
                    }
                });
            });

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
            if (['TGH', 'MNGH', 'RGH', 'AIGH', 'MFG'].includes(kafkaGroup)) {
                return kafkaGroup;
            }
        }
        
        // Priority 2: Extract from device ID
        if (deviceId.includes('TGH')) return 'TGH';
        if (deviceId.includes('MNGH')) return 'MNGH';
        if (deviceId.includes('RGH')) return 'RGH';
        if (deviceId.includes('AIGH') || deviceId.includes('AISH')) return 'AIGH';
        if (deviceId.includes('MFG')) return 'MFG';
        
        // Priority 3: Use pattern match
        const match = deviceId.match(/([A-Z]+)-/);
        if (match) return match[1];
        
        // Priority 4: Use Kafka groupName as-is or default to ICU
        return patientInfo?.groupName || 'ICU';
    }

    ensurePatientExists(deviceId, patientInfo) {
        const existing = this.patientData.get(deviceId);

        if (!existing) {
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
            return;
        }

        // FIXED: a device is keyed by deviceId, but a bed can be reassigned
        // to a different admitted patient. Without this, waveformData was
        // never cleared on patientId change, so a newly admitted patient
        // inherited the previous patient's trace.
        const incomingPatientId = patientInfo?.patientId;
        const storedPatientId = existing.information.patientId;

        if (incomingPatientId && storedPatientId && incomingPatientId !== storedPatientId) {
            this.waveformData.delete(deviceId);
            this.broadcast({ type: 'patient_changed', deviceId });
            console.log(`🔄 Patient changed on ${deviceId}: ${storedPatientId} → ${incomingPatientId}`);
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

                // Log received vitals for HR/SpO2 investigation
                const vsArray = data.VS || [];
                const hrVal = vsArray.find(v => v.name === 'HR');
                const spo2Val = vsArray.find(v => v.name === 'SpO2');
                logBridge(`BRIDGE VITALS [${deviceId}] HR=${hrVal?.value ?? 'N/A'} SpO2=${spo2Val?.value ?? 'N/A'} | raw VS count=${vsArray.length} | timestamp=${data.information?.timeStamp}`);

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

                // Stamp receivedAt so clients can evaluate staleness on a
                // clock, and so a client connecting later only replays
                // frames that are still recent (see setupWebSocket).
                data.receivedAt = Date.now();

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
        this.server.listen(port, '0.0.0.0', () => {
            console.log(`✅ Dashboard Bridge running on port ${port}`);
            console.log(`🌐 WebSocket: ws://0.0.0.0:${port}`);
            console.log(`🌐 HTTP API: http://0.0.0.0:${port}`);
        });
    }
}

const bridge = new DashboardBridge();
bridge.start(8081);

export default DashboardBridge;