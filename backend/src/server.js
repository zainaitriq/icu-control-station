// server.js - Express API server
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'ICU Backend API'
    });
});

// API routes will proxy to the bridge
app.get('/api/patients', async (req, res) => {
    try {
        const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:8081';
        const response = await fetch(`${bridgeUrl}/api/patients`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch patients' });
    }
});

app.get('/api/patients/:deviceId', async (req, res) => {
    try {
        const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:8081';
        const response = await fetch(`${bridgeUrl}/api/patients/${req.params.deviceId}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch patient' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Backend API Server running on port ${PORT}`);
    console.log(`🌐 http://0.0.0.0:${PORT}`);
});