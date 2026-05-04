# 🚀 ICU Control Station - Production Deployment Guide

## 📋 Overview

This guide covers deploying the ICU Control Station to client environments with:
- ✅ Code encryption/obfuscation
- ✅ Auto-start on system boot (always running)
- ✅ Process management and monitoring
- ✅ Professional packaging

---

## 🔐 Part 1: Code Encryption & Obfuscation

### Method 1: JavaScript Obfuscation (Recommended)

#### Install Obfuscation Tool

```bash
npm install -g javascript-obfuscator
```

#### Create Obfuscation Script

Create `scripts/obfuscate.js`:

```javascript
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const config = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: true,
    debugProtectionInterval: 2000,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
};

function obfuscateDirectory(dir, outputDir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            const newOutputDir = path.join(outputDir, file);
            if (!fs.existsSync(newOutputDir)) {
                fs.mkdirSync(newOutputDir, { recursive: true });
            }
            obfuscateDirectory(filePath, newOutputDir);
        } else if (file.endsWith('.js')) {
            console.log(`Obfuscating: ${filePath}`);
            const code = fs.readFileSync(filePath, 'utf8');
            const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, config).getObfuscatedCode();
            const outputPath = path.join(outputDir, file);
            fs.writeFileSync(outputPath, obfuscatedCode);
        } else {
            // Copy non-JS files as is
            const outputPath = path.join(outputDir, file);
            fs.copyFileSync(filePath, outputPath);
        }
    });
}

// Obfuscate backend
console.log('🔒 Obfuscating backend...');
const backendSrc = path.join(__dirname, '../backend/src');
const backendDist = path.join(__dirname, '../backend-obfuscated/src');
fs.mkdirSync(backendDist, { recursive: true });
obfuscateDirectory(backendSrc, backendDist);

console.log('✅ Obfuscation complete!');
```

#### Run Obfuscation

```bash
node scripts/obfuscate.js
```

### Method 2: Using pkg (Compile to Binary)

This creates a single executable file that's harder to reverse-engineer:

```bash
# Install pkg globally
npm install -g pkg

# Package backend into executable
cd backend
pkg . --targets node18-linux-x64 --output ../dist/icu-backend

# This creates a single binary file that includes Node.js and your code
```

Create `backend/pkg-config.json`:

```json
{
  "name": "icu-backend",
  "version": "1.0.0",
  "main": "src/consumer.js",
  "bin": {
    "icu-backend": "src/consumer.js",
    "icu-bridge": "src/websocket-bridge.js"
  },
  "pkg": {
    "assets": [
      "certs/**/*"
    ],
    "targets": [
      "node18-linux-x64"
    ],
    "outputPath": "../dist"
  }
}
```

---

## 🔄 Part 2: Always Running Setup (Linux)

### Option A: Using PM2 (Recommended - Easy Management)

#### 1. Install PM2

```bash
npm install -g pm2
```

#### 2. Create PM2 Ecosystem File

Create `ecosystem.config.js` in project root:

```javascript
module.exports = {
  apps: [
    {
      name: 'icu-bridge',
      script: './backend/src/websocket-bridge.js',
      cwd: './backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 8081
      },
      error_file: './logs/bridge-error.log',
      out_file: './logs/bridge-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'icu-consumer',
      script: './backend/src/consumer.js',
      cwd: './backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/consumer-error.log',
      out_file: './logs/consumer-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
```

#### 3. Start Services with PM2

```bash
# Start all services
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions shown (it will give you a command to run)
```

#### 4. PM2 Management Commands

```bash
# View status
pm2 status

# View logs
pm2 logs

# Restart services
pm2 restart all

# Stop services
pm2 stop all

# Monitor in real-time
pm2 monit

# View detailed info
pm2 info icu-bridge
```

### Option B: Using systemd (Native Linux Service)

#### 1. Create Service Files

Create `/etc/systemd/system/icu-bridge.service`:

```ini
[Unit]
Description=ICU Control Station - WebSocket Bridge
After=network.target

[Service]
Type=simple
User=icu-user
WorkingDirectory=/opt/icu-control-station/backend
Environment="NODE_ENV=production"
Environment="PORT=8081"
ExecStart=/usr/bin/node /opt/icu-control-station/backend/src/websocket-bridge.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/icu/bridge.log
StandardError=append:/var/log/icu/bridge-error.log

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/icu-consumer.service`:

```ini
[Unit]
Description=ICU Control Station - Kafka Consumer
After=network.target
Requires=icu-bridge.service

[Service]
Type=simple
User=icu-user
WorkingDirectory=/opt/icu-control-station/backend
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /opt/icu-control-station/backend/src/consumer.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/icu/consumer.log
StandardError=append:/var/log/icu/consumer-error.log

[Install]
WantedBy=multi-user.target
```

#### 2. Enable and Start Services

```bash
# Create log directory
sudo mkdir -p /var/log/icu
sudo chown icu-user:icu-user /var/log/icu

# Reload systemd
sudo systemctl daemon-reload

# Enable services (start on boot)
sudo systemctl enable icu-bridge
sudo systemctl enable icu-consumer

# Start services
sudo systemctl start icu-bridge
sudo systemctl start icu-consumer

# Check status
sudo systemctl status icu-bridge
sudo systemctl status icu-consumer

# View logs
sudo journalctl -u icu-bridge -f
sudo journalctl -u icu-consumer -f
```

---

## 📦 Part 3: Complete Deployment Package

### Directory Structure for Client

```
icu-control-station-deploy/
├── install.sh                    # Automated installer
├── backend-obfuscated/           # Encrypted backend code
│   ├── src/
│   └── package.json
├── frontend-build/               # Production build
│   └── dist/
├── certs/                        # SSL certificates (client provides)
├── config/
│   ├── .env.template
│   └── ecosystem.config.js
├── scripts/
│   ├── start.sh
│   ├── stop.sh
│   ├── status.sh
│   └── update.sh
└── docs/
    ├── INSTALLATION.md
    └── OPERATION.md
```

### Create Installation Script

Create `install.sh`:

```bash
#!/bin/bash

set -e

echo "🏥 ICU Control Station - Installation Script"
echo "============================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root (sudo ./install.sh)"
    exit 1
fi

# Configuration
INSTALL_DIR="/opt/icu-control-station"
SERVICE_USER="icu-user"
LOG_DIR="/var/log/icu"

echo "📁 Creating directories..."
mkdir -p $INSTALL_DIR
mkdir -p $LOG_DIR

# Create service user
if id "$SERVICE_USER" &>/dev/null; then
    echo "✅ User $SERVICE_USER already exists"
else
    echo "👤 Creating service user..."
    useradd -r -s /bin/false $SERVICE_USER
fi

# Copy files
echo "📋 Copying application files..."
cp -r ./backend-obfuscated/* $INSTALL_DIR/
cp -r ./config/* $INSTALL_DIR/

# Set permissions
echo "🔒 Setting permissions..."
chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR
chown -R $SERVICE_USER:$SERVICE_USER $LOG_DIR
chmod 600 $INSTALL_DIR/.env

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

# Install dependencies
echo "📦 Installing dependencies..."
cd $INSTALL_DIR
npm install --production

# Install PM2
echo "🔧 Installing PM2..."
npm install -g pm2

# Configure environment
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo "⚙️  Please configure $INSTALL_DIR/.env before starting"
    cp $INSTALL_DIR/.env.template $INSTALL_DIR/.env
    chmod 600 $INSTALL_DIR/.env
    echo "❗ Edit $INSTALL_DIR/.env with your Kafka configuration"
    exit 1
fi

# Start services
echo "🚀 Starting services..."
cd $INSTALL_DIR
sudo -u $SERVICE_USER pm2 start ecosystem.config.js
sudo -u $SERVICE_USER pm2 save
pm2 startup systemd -u $SERVICE_USER --hp /home/$SERVICE_USER

# Install Nginx for frontend (optional)
read -p "Install Nginx for frontend? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    apt-get install -y nginx
    cp ./config/nginx.conf /etc/nginx/sites-available/icu-dashboard
    ln -sf /etc/nginx/sites-available/icu-dashboard /etc/nginx/sites-enabled/
    systemctl reload nginx
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "📝 Next steps:"
echo "1. Edit configuration: sudo nano $INSTALL_DIR/.env"
echo "2. Add SSL certificates to: $INSTALL_DIR/certs/"
echo "3. Start services: sudo pm2 start ecosystem.config.js"
echo "4. Check status: sudo pm2 status"
echo "5. View logs: sudo pm2 logs"
echo ""
echo "🌐 Frontend will be available at: http://your-server-ip"
echo "🔌 WebSocket Bridge: ws://your-server-ip:8081"
```

### Create Management Scripts

Create `scripts/start.sh`:

```bash
#!/bin/bash
cd /opt/icu-control-station
pm2 start ecosystem.config.js
echo "✅ ICU Control Station started"
```

Create `scripts/stop.sh`:

```bash
#!/bin/bash
pm2 stop ecosystem.config.js
echo "🛑 ICU Control Station stopped"
```

Create `scripts/status.sh`:

```bash
#!/bin/bash
echo "📊 ICU Control Station Status"
echo "=============================="
pm2 status
echo ""
echo "📝 Recent Logs:"
pm2 logs --lines 20 --nostream
```

---

## 🔧 Part 4: Frontend Production Build

### 1. Build Frontend for Production

```bash
cd frontend
npm run build
```

This creates optimized files in `frontend/dist/`

### 2. Serve with Nginx

Create `/etc/nginx/sites-available/icu-dashboard`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    root /opt/icu-control-station/frontend/dist;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy WebSocket connections
    location /ws {
        proxy_pass http://localhost:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

Enable and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/icu-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 📊 Part 5: Monitoring & Health Checks

### Create Health Check Script

Create `scripts/health-check.sh`:

```bash
#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "🏥 ICU Control Station - Health Check"
echo "======================================"

# Check PM2 processes
echo -e "\n📊 Process Status:"
pm2 status

# Check if bridge is responding
echo -e "\n🔌 WebSocket Bridge:"
if curl -f http://localhost:8081/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Bridge is healthy${NC}"
else
    echo -e "${RED}❌ Bridge is not responding${NC}"
fi

# Check disk space
echo -e "\n💾 Disk Space:"
df -h / | tail -1

# Check memory
echo -e "\n🧠 Memory Usage:"
free -h | grep Mem

# Check logs for errors
echo -e "\n📝 Recent Errors (last 10):"
tail -n 10 /var/log/icu/bridge-error.log 2>/dev/null || echo "No errors"
tail -n 10 /var/log/icu/consumer-error.log 2>/dev/null || echo "No errors"

# Check network connectivity
echo -e "\n🌐 Network Connectivity:"
if ping -c 1 google.com > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Internet connection OK${NC}"
else
    echo -e "${RED}❌ No internet connection${NC}"
fi
```

### Add Cron Job for Monitoring

```bash
# Add to crontab (every 5 minutes)
*/5 * * * * /opt/icu-control-station/scripts/health-check.sh >> /var/log/icu/health-check.log 2>&1
```

---

## 🔐 Part 6: Security Hardening

### 1. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8081/tcp  # WebSocket bridge
sudo ufw enable
```

### 2. SSL/TLS for HTTPS

```bash
# Install certbot for Let's Encrypt
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

### 3. Secure Environment Variables

```bash
# Encrypt .env file
sudo chmod 600 /opt/icu-control-station/.env
sudo chown icu-user:icu-user /opt/icu-control-station/.env
```

---

## 📦 Part 7: Creating Deployment Package

### Build Complete Package

```bash
#!/bin/bash

# Create deployment package
VERSION="1.0.0"
PACKAGE_NAME="icu-control-station-v${VERSION}"

echo "📦 Building deployment package..."

# Create directory structure
mkdir -p ${PACKAGE_NAME}/{backend-obfuscated,frontend-build,config,scripts,docs,certs}

# Obfuscate backend
echo "🔒 Obfuscating backend code..."
node scripts/obfuscate.js

# Build frontend
echo "🏗️  Building frontend..."
cd frontend && npm run build && cd ..
cp -r frontend/dist ${PACKAGE_NAME}/frontend-build/

# Copy obfuscated backend
cp -r backend-obfuscated/* ${PACKAGE_NAME}/backend-obfuscated/

# Copy configuration templates
cp ecosystem.config.js ${PACKAGE_NAME}/config/
cp backend/.env ${PACKAGE_NAME}/config/.env.template

# Copy scripts
cp install.sh ${PACKAGE_NAME}/
cp scripts/*.sh ${PACKAGE_NAME}/scripts/
chmod +x ${PACKAGE_NAME}/*.sh
chmod +x ${PACKAGE_NAME}/scripts/*.sh

# Copy documentation
cp DEPLOYMENT_GUIDE.md ${PACKAGE_NAME}/docs/
cp README.md ${PACKAGE_NAME}/docs/

# Create archive
echo "📦 Creating archive..."
tar -czf ${PACKAGE_NAME}.tar.gz ${PACKAGE_NAME}/

echo "✅ Package created: ${PACKAGE_NAME}.tar.gz"
echo "📦 Size: $(du -h ${PACKAGE_NAME}.tar.gz | cut -f1)"
```

---

## 🚀 Part 8: Client Installation Instructions

### Quick Install

```bash
# 1. Extract package
tar -xzf icu-control-station-v1.0.0.tar.gz
cd icu-control-station-v1.0.0

# 2. Run installer
sudo ./install.sh

# 3. Configure environment
sudo nano /opt/icu-control-station/.env

# 4. Add SSL certificates
sudo cp your-ca.crt /opt/icu-control-station/certs/
sudo cp your-client.key /opt/icu-control-station/certs/
sudo cp your-client.pem /opt/icu-control-station/certs/

# 5. Start services
cd /opt/icu-control-station
sudo -u icu-user pm2 start ecosystem.config.js

# 6. Check status
sudo pm2 status
```

---

## 📋 Checklist for Deployment

- [ ] Code obfuscated/encrypted
- [ ] Frontend built for production
- [ ] PM2 configured for auto-restart
- [ ] systemd startup configured
- [ ] Nginx configured (if applicable)
- [ ] SSL certificates installed
- [ ] Firewall rules configured
- [ ] Environment variables secured
- [ ] Logs directory created with proper permissions
- [ ] Health check script configured
- [ ] Backup strategy in place
- [ ] Documentation provided to client
- [ ] Client training completed

---

## 🛠️ Maintenance Commands

```bash
# View service status
pm2 status

# View logs
pm2 logs

# Restart services
pm2 restart all

# Update application
./scripts/update.sh

# Backup configuration
tar -czf icu-backup-$(date +%Y%m%d).tar.gz /opt/icu-control-station/

# View system resources
pm2 monit
```

---

## 🐛 Troubleshooting Production Issues

### Service Won't Start

```bash
# Check PM2 logs
pm2 logs --err

# Check system logs
sudo journalctl -u icu-bridge -n 50
sudo journalctl -u icu-consumer -n 50

# Verify permissions
ls -la /opt/icu-control-station/
```

### High Memory Usage

```bash
# Check memory
pm2 monit

# Restart services
pm2 restart all

# Check for memory leaks
pm2 logs --lines 1000 | grep "memory"
```

### Connection Issues

```bash
# Test WebSocket
wscat -c ws://localhost:8081

# Test Kafka connectivity
telnet kafka-broker-host 9092

# Check firewall
sudo ufw status
```

---

**End of Deployment Guide**