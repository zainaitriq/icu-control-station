// consumer.js - Updated Kafka consumer with ES modules
import { Kafka, logLevel } from 'kafkajs';
import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class FixedNKDHSConsumer {
    constructor() {
        this.kafka = null;
        this.consumer = null;
        this.isRunning = false;
        this.messageHandlers = new Map();
        this.partitionStats = new Map();
        this.bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:8081';
        this.bridgeHealthy = false;
        this.messageCount = 0;
        
        this.initializeKafka();
        this.setupMessageHandlers();
        this.setupGracefulShutdown();
        this.startBridgeHealthCheck();
    }

    startBridgeHealthCheck() {
        const checkHealth = async () => {
            try {
                const response = await axios.get(`${this.bridgeUrl}/health`, { timeout: 2000 });
                if (!this.bridgeHealthy) {
                    console.log('✅ Bridge connection restored');
                    this.bridgeHealthy = true;
                }
            } catch (error) {
                if (this.bridgeHealthy || this.messageCount === 0) {
                    console.log('⚠️  Bridge connection lost - will retry...');
                    this.bridgeHealthy = false;
                }
            }
        };

        checkHealth();
        setInterval(checkHealth, 5000);
    }

    trackPartitionUsage(topic, partition) {
        if (!this.partitionStats.has(topic)) {
            this.partitionStats.set(topic, new Set());
        }
        this.partitionStats.get(topic).add(partition);
    }

    initializeKafka() {
        const brokerHost = process.env.KAFKA_BROKER_HOST;
        const brokerPort = process.env.KAFKA_BROKER_PORT || '9092';
        const clientId = process.env.CLIENT_ID || 'icu-dashboard-consumer';

        if (!brokerHost) {
            console.error('❌ KAFKA_BROKER_HOST is required but not set in .env file');
            process.exit(1);
        }

        const sslConfig = {
            rejectUnauthorized: false,
            ca: [this.readCertFile(process.env.SSL_CA_PATH || './certs/clientwflive-ca1-signed.crt')],
            key: this.readCertFile(process.env.SSL_KEY_PATH || './certs/clientwflive.key'),
            cert: this.readCertFile(process.env.SSL_CERT_PATH || './certs/clientwflive.certificate.pem')
        };

        this.kafka = new Kafka({
            clientId: clientId,
            brokers: [`${brokerHost}:${brokerPort}`],
            ssl: sslConfig,
            logLevel: this.getLogLevel(),
            connectionTimeout: 10000,
            requestTimeout: 30000,
            retry: {
                initialRetryTime: 1000,
                retries: 5,
                maxRetryTime: 30000,
                factor: 2
            }
        });

        console.log(`✅ Kafka client initialized - Broker: ${brokerHost}:${brokerPort}`);
    }

    readCertFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`Certificate file not found: ${filePath}`);
            }
            return fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            console.error(`❌ Error reading certificate file ${filePath}:`, error.message);
            process.exit(1);
        }
    }

    getLogLevel() {
        const level = process.env.LOG_LEVEL || 'info';
        const levels = {
            'error': logLevel.ERROR,
            'warn': logLevel.WARN,
            'info': logLevel.INFO,
            'debug': logLevel.DEBUG
        };
        return levels[level] || logLevel.INFO;
    }

    async sendToBridge(endpoint, data) {
        if (!this.bridgeHealthy) {
            return false;
        }

        try {
            const payload = {
                topic: data.topic || 'UNKNOWN',
                partition: data.partition || 0,
                offset: String(data.offset || '0'),
                message: {
                    value: data.message?.value || JSON.stringify(data)
                }
            };

            const response = await axios.post(`${this.bridgeUrl}${endpoint}`, payload, {
                timeout: 3000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            return response.status === 200;

        } catch (error) {
            if (error.response) {
                console.error(`Bridge error ${error.response.status}: ${error.response.statusText}`);
            } else if (error.code === 'ECONNREFUSED') {
                this.bridgeHealthy = false;
            } else {
                console.error(`Bridge send error:`, error.message);
            }
            return false;
        }
    }

    setupMessageHandlers() {
        this.messageHandlers.set('VITALSIGN_LIVE', async (messageInfo) => {
            try {
                const messageValue = messageInfo.message.value.toString();
                let data;
                
                try {
                    data = JSON.parse(messageValue);
                } catch (parseError) {
                    console.error('Failed to parse vital signs JSON');
                    return;
                }
                
                this.messageCount++;
                
                if (this.messageCount % 20 === 0) {
                    console.log(`💓 VITAL SIGNS: Device=${data.information?.deviceId} Patient=${data.information?.patientId} Count=${this.messageCount}`);
                }

                const success = await this.sendToBridge('/kafka/vitals', {
                    topic: messageInfo.topic,
                    partition: messageInfo.partition,
                    offset: messageInfo.offset,
                    message: {
                        value: messageValue
                    }
                });

                if (!success && this.messageCount % 50 === 0) {
                    console.log('⚠️  Bridge not available for vital signs');
                }

            } catch (error) {
                console.error('Error processing vital signs:', error.message);
            }
        });

        this.messageHandlers.set('WAVEFORM_LIVE', async (messageInfo) => {
            try {
                const messageValue = messageInfo.message.value.toString();
                let data;
                
                try {
                    data = JSON.parse(messageValue);
                } catch (parseError) {
                    console.error('Failed to parse waveform JSON');
                    return;
                }
                
                this.messageCount++;
                
                const deviceId = data.information?.deviceId;
                const patientId = data.information?.patientId;
                const waveformName = data.waveform?.name;

                if (this.messageCount % 50 === 0) {
                    console.log(`📊 WAVEFORM [${waveformName}]: Device=${deviceId} Patient=${patientId}`);
                }

                const success = await this.sendToBridge('/kafka/waveform', {
                    topic: messageInfo.topic,
                    partition: messageInfo.partition,
                    offset: messageInfo.offset,
                    message: {
                        value: messageValue
                    }
                });

                if (!success && this.messageCount % 100 === 0) {
                    console.log('⚠️  Bridge not available for waveform data');
                }

            } catch (error) {
                console.error('Error processing waveform:', error.message);
            }
        });

        this.messageHandlers.set('LIMITS_LIVE', async (messageInfo) => {
            try {
                const data = JSON.parse(messageInfo.message.value.toString());
                if (this.messageCount % 100 === 0) {
                    console.log(`⚙️  LIMITS: Device=${data.information?.deviceId}`);
                }
            } catch (error) {
                console.error('Error processing limits:', error.message);
            }
        });

        this.messageHandlers.set('ESCALATION_LIVE', async (messageInfo) => {
            try {
                const data = JSON.parse(messageInfo.message.value.toString());
                console.log(`🚨 ESCALATION: Device=${data.information?.deviceId}`);
            } catch (error) {
                console.error('Error processing escalation:', error.message);
            }
        });

        this.messageHandlers.set('default', async (messageInfo) => {
            console.log(`❓ Unknown topic: ${messageInfo.topic}`);
        });
    }

    async checkBridgeHealth() {
        try {
            const response = await axios.get(`${this.bridgeUrl}/health`, { timeout: 3000 });
            console.log(`✅ Bridge Status: ${response.data.status} (${response.data.connectedClients} clients)`);
            this.bridgeHealthy = true;
            return true;
        } catch (error) {
            console.log(`⚠️  Bridge not available at ${this.bridgeUrl}`);
            console.log('Make sure to run: node src/websocket-bridge.js');
            this.bridgeHealthy = false;
            return false;
        }
    }

// Replace the subscription loop in your start() method with this:

async start() {
    try {
        console.log('🚀 Starting NKDHS ICU Consumer...');
        console.log('Configuration:');
        console.log(`  Kafka Broker: ${process.env.KAFKA_BROKER_HOST}:${process.env.KAFKA_BROKER_PORT || '9092'}`);
        console.log(`  Consumer Group: ${process.env.CONSUMER_GROUP_ID || 'icu-dashboard-group'}`);
        console.log(`  Bridge URL: ${this.bridgeUrl}`);

        await this.checkBridgeHealth();

        const groupId = process.env.CONSUMER_GROUP_ID || 'icu-dashboard-group';
        this.consumer = this.kafka.consumer({
            groupId: groupId,
            sessionTimeout: 30000,
            heartbeatInterval: 3000,
            maxWaitTimeInMs: 5000,
            retry: { retries: 5, initialRetryTime: 1000 }
        });

        console.log('🔌 Connecting to Kafka...');
        await this.consumer.connect();
        console.log('✅ Connected to Kafka broker');

        const topics = [
            process.env.VITAL_SIGNS_TOPIC || 'VITALSIGN_LIVE',
            process.env.WAVEFORM_TOPIC || 'WAVEFORM_LIVE',
            process.env.LIMITS_TOPIC || 'LIMITS_LIVE',
            process.env.ESCALATION_TOPIC || 'ESCALATION_LIVE'
        ];

        const fromBeginning = process.env.FROM_BEGINNING === 'true';

        // ✅ CRITICAL: Subscribe to ALL topics at once using 'topics' array
        console.log('📋 Subscribing to topics:', topics);
        await this.consumer.subscribe({ 
            topics: topics,  // Use 'topics' (plural) with array
            fromBeginning: fromBeginning 
        });
        
        console.log(`✅ Successfully subscribed to ${topics.length} topics`);
        topics.forEach(topic => console.log(`   ✓ ${topic}`));

        this.isRunning = true;
        console.log('🎯 Starting message consumption...');
        console.log('📡 Forwarding data to dashboard bridge...');

        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    this.trackPartitionUsage(topic, partition);

                    const messageInfo = { 
                        topic, 
                        partition, 
                        message, 
                        offset: message.offset 
                    };
                    
                    const handler = this.messageHandlers.get(topic) || this.messageHandlers.get('default');
                    await handler(messageInfo);

                } catch (error) {
                    console.error('Error processing message:', error.message);
                }
            },
        });

        console.log('✅ Consumer running - Data flowing to ICU Dashboard!');

    } catch (error) {
        console.error('❌ Error starting consumer:', error.message);
        process.exit(1);
    }
}


    async stop() {
        if (this.isRunning && this.consumer) {
            console.log('🛑 Stopping consumer...');
            this.isRunning = false;

            try {
                await this.consumer.disconnect();
                console.log('✅ Consumer stopped gracefully');
            } catch (error) {
                console.error('Error stopping consumer:', error.message);
            }
        }
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            console.log(`\n📴 Received ${signal}, shutting down...`);
            await this.stop();
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
            this.stop().then(() => process.exit(1));
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection:', reason);
            this.stop().then(() => process.exit(1));
        });
    }
}

const consumer = new FixedNKDHSConsumer();

consumer.start().catch((error) => {
    console.error('❌ Failed to start consumer:', error);
    process.exit(1);
});

export default FixedNKDHSConsumer;