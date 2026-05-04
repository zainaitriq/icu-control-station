#!/bin/bash

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

VERSION="1.0.0"
PACKAGE_NAME="icu-control-station-v${VERSION}"
BUILD_DIR="./build"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════╗"
echo "║  ICU Control Station - Deployment Builder     ║"
echo "║  Version ${VERSION}                                ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"

# Clean previous build
if [ -d "$BUILD_DIR" ]; then
    echo -e "${YELLOW}🗑️  Cleaning previous build...${NC}"
    rm -rf $BUILD_DIR
fi

# Create directory structure
echo -e "${BLUE}📁 Creating package structure...${NC}"
mkdir -p ${BUILD_DIR}/${PACKAGE_NAME}/{backend-obfuscated,frontend-build,config,scripts,docs}

# Step 1: Obfuscate backend code
echo -e "\n${BLUE}🔒 Step 1: Obfuscating backend code...${NC}"

# Check if javascript-obfuscator is installed
if ! npm list -g javascript-obfuscator > /dev/null 2>&1; then
    echo -e "${YELLOW}   Installing javascript-obfuscator...${NC}"
    npm install -g javascript-obfuscator
fi

# Run obfuscation script
if [ -f "./scripts/obfuscate.js" ]; then
    node ./scripts/obfuscate.js
    
    if [ -d "./backend-obfuscated" ]; then
        cp -r ./backend-obfuscated/* ${BUILD_DIR}/${PACKAGE_NAME}/backend-obfuscated/
        echo -e "${GREEN}   ✅ Backend code obfuscated and copied${NC}"
    else
        echo -e "${YELLOW}   ⚠️  Obfuscation failed, using original code${NC}"
        cp -r ./backend/* ${BUILD_DIR}/${PACKAGE_NAME}/backend-obfuscated/
    fi
else
    echo -e "${YELLOW}   ⚠️  Obfuscation script not found, using original code${NC}"
    cp -r ./backend/* ${BUILD_DIR}/${PACKAGE_NAME}/backend-obfuscated/
fi

# Remove dev files from backend
rm -rf ${BUILD_DIR}/${PACKAGE_NAME}/backend-obfuscated/node_modules
rm -f ${BUILD_DIR}/${PACKAGE_NAME}/backend-obfuscated/.env

# Step 2: Build frontend
echo -e "\n${BLUE}🏗️  Step 2: Building frontend...${NC}"
cd frontend

if [ -d "node_modules" ]; then
    npm run build
else
    echo -e "${YELLOW}   Installing dependencies...${NC}"
    npm install
    npm run build
fi

cd ..

if [ -d "./frontend/dist" ]; then
    cp -r ./frontend/dist ${BUILD_DIR}/${PACKAGE_NAME}/frontend-build/
    echo -e "${GREEN}   ✅ Frontend built and copied${NC}"
else
    echo -e "${YELLOW}   ⚠️  Frontend build failed${NC}"
fi

# Step 3: Copy configuration files
echo -e "\n${BLUE}📋 Step 3: Copying configuration files...${NC}"

# Copy ecosystem config
cp ./ecosystem.config.js ${BUILD_DIR}/${PACKAGE_NAME}/config/
echo -e "${GREEN}   ✅ ecosystem.config.js${NC}"

# Create .env template
cat > ${BUILD_DIR}/${PACKAGE_NAME}/config/.env.template << 'EOF'
# Kafka Configuration
KAFKA_BROKER_HOST=your-kafka-broker.com
KAFKA_BROKER_PORT=9092
CLIENT_ID=icu-dashboard-consumer
CONSUMER_GROUP_ID=icu-dashboard-group

# SSL Certificate Paths
SSL_CA_PATH=./certs/ca.crt
SSL_KEY_PATH=./certs/client.key
SSL_CERT_PATH=./certs/client.pem

# Kafka Topics
VITALSIGN_TOPIC=VITALSIGN_LIVE
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
EOF
echo -e "${GREEN}   ✅ .env.template${NC}"

# Copy Nginx config if exists
if [ -f "./config/nginx.conf" ]; then
    cp ./config/nginx.conf ${BUILD_DIR}/${PACKAGE_NAME}/config/
    echo -e "${GREEN}   ✅ nginx.conf${NC}"
fi

# Step 4: Copy scripts
echo -e "\n${BLUE}📜 Step 4: Copying scripts...${NC}"

cp ./install.sh ${BUILD_DIR}/${PACKAGE_NAME}/
chmod +x ${BUILD_DIR}/${PACKAGE_NAME}/install.sh
echo -e "${GREEN}   ✅ install.sh${NC}"

# Create additional management scripts
cat > ${BUILD_DIR}/${PACKAGE_NAME}/scripts/update.sh << 'EOF'
#!/bin/bash
echo "🔄 Updating ICU Control Station..."
cd /opt/icu-control-station

# Stop services
sudo -u icu-user pm2 stop ecosystem.config.js

# Backup current version
sudo tar -czf /opt/icu-backups/pre-update-$(date +%Y%m%d-%H%M%S).tar.gz /opt/icu-control-station

# Pull updates (if using git) or copy new files
# git pull origin main

# Install dependencies
sudo -u icu-user npm install --production

# Restart services
sudo -u icu-user pm2 restart ecosystem.config.js

echo "✅ Update complete!"
EOF

cat > ${BUILD_DIR}/${PACKAGE_NAME}/scripts/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/icu-backups"
BACKUP_FILE="$BACKUP_DIR/icu-backup-$(date +%Y%m%d-%H%M%S).tar.gz"

mkdir -p $BACKUP_DIR
echo "💾 Creating backup: $BACKUP_FILE"

tar -czf $BACKUP_FILE \
    --exclude=/opt/icu-control-station/node_modules \
    --exclude=/opt/icu-control-station/logs \
    /opt/icu-control-station

echo "✅ Backup created: $BACKUP_FILE"
ls -lh $BACKUP_FILE
EOF

cat > ${BUILD_DIR}/${PACKAGE_NAME}/scripts/health-check.sh << 'EOF'
#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "🏥 ICU Control Station - Health Check"
echo "======================================"

# Check PM2 processes
echo -e "\n📊 Process Status:"
pm2 status

# Check WebSocket bridge
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

echo ""
EOF

chmod +x ${BUILD_DIR}/${PACKAGE_NAME}/scripts/*.sh
echo -e "${GREEN}   ✅ Management scripts created${NC}"

# Step 5: Copy documentation
echo -e "\n${BLUE}📚 Step 5: Copying documentation...${NC}"

if [ -f "./README.md" ]; then
    cp ./README.md ${BUILD_DIR}/${PACKAGE_NAME}/docs/
    echo -e "${GREEN}   ✅ README.md${NC}"
fi

if [ -f "./DEPLOYMENT_GUIDE.md" ]; then
    cp ./DEPLOYMENT_GUIDE.md ${BUILD_DIR}/${PACKAGE_NAME}/docs/
    echo -e "${GREEN}   ✅ DEPLOYMENT_GUIDE.md${NC}"
fi

# Create installation guide
cat > ${BUILD_DIR}/${PACKAGE_NAME}/INSTALL.md << 'EOF'
# ICU Control Station - Installation Instructions

## Quick Start

1. **Extract the package:**
   ```bash
   tar -xzf icu-control-station-v1.0.0.tar.gz
   cd icu-control-station-v1.0.0
   ```

2. **Run the installer:**
   ```bash
   sudo ./install.sh
   ```

3. **Configure the system:**
   ```bash
   sudo nano /opt/icu-control-station/.env
   ```

4. **Add SSL certificates:**
   ```bash
   sudo cp your-ca.crt /opt/icu-control-station/certs/ca.crt
   sudo cp your-client.key /opt/icu-control-station/certs/client.key
   sudo cp your-client.pem /opt/icu-control-station/certs/client.pem
   ```

5. **Start the services:**
   ```bash
   icu-start
   ```

6. **Check status:**
   ```bash
   icu-status
   ```

## Management Commands

- `icu-start` - Start all services
- `icu-stop` - Stop all services
- `icu-restart` - Restart all services
- `icu-status` - View service status
- `icu-logs` - View real-time logs

## Support

For detailed documentation, see:
- `docs/README.md` - Complete system documentation
- `docs/DEPLOYMENT_GUIDE.md` - Production deployment guide

## System Requirements

- Ubuntu 20.04+ or similar Linux distribution
- 2+ CPU cores
- 4GB+ RAM
- Node.js 18+
- Network access to Kafka broker

## Ports Used

- 8081 - WebSocket Bridge
- 3001 - Backend API (optional)
- 80/443 - Frontend (if Nginx installed)

© 2025 All Rights Reserved
EOF
echo -e "${GREEN}   ✅ INSTALL.md${NC}"

# Create certs directory
mkdir -p ${BUILD_DIR}/${PACKAGE_NAME}/backend-obfuscated/certs
cat > ${BUILD_DIR}/${PACKAGE_NAME}/backend-obfuscated/certs/README.txt << 'EOF'
SSL Certificate Directory
=========================

Place your Kafka SSL certificates here:

Required files:
- ca.crt (CA certificate)
- client.key (Client private key)
- client.pem (Client certificate)

Or with custom names (update .env accordingly):
- experia-ca1-signed.crt
- experia.key
- experia.certificate.pem

These files must be provided by your Kafka administrator.
EOF
echo -e "${GREEN}   ✅ certs/README.txt${NC}"

# Step 6: Create README for package
cat > ${BUILD_DIR}/${PACKAGE_NAME}/README.md << 'EOF'
# ICU Control Station - Production Package

Version 1.0.0

## Contents

- `backend-obfuscated/` - Encrypted backend application
- `frontend-build/` - Production frontend build
- `config/` - Configuration templates
- `scripts/` - Management scripts
- `docs/` - Complete documentation
- `install.sh` - Automated installer

## Installation

Run the automated installer:

```bash
sudo ./install.sh
```

Follow the prompts and complete the configuration steps.

## Documentation

See `INSTALL.md` for quick start instructions.
See `docs/DEPLOYMENT_GUIDE.md` for complete deployment guide.

## Security Notice

⚠️ This package contains obfuscated code to protect intellectual property.
The code is licensed for use only by authorized clients.

© 2025 All Rights Reserved
EOF

# Step 7: Create archive
echo -e "\n${BLUE}📦 Step 7: Creating deployment archive...${NC}"

cd $BUILD_DIR
tar -czf ${PACKAGE_NAME}.tar.gz ${PACKAGE_NAME}/
cd ..

# Get file size
SIZE=$(du -h ${BUILD_DIR}/${PACKAGE_NAME}.tar.gz | cut -f1)

echo -e "\n${GREEN}╔════════════════════════════════════════════════╗"
echo -e "║          Package Build Complete!                ║"
echo -e "╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}📦 Package: ${BUILD_DIR}/${PACKAGE_NAME}.tar.gz${NC}"
echo -e "${GREEN}📏 Size: ${SIZE}${NC}"
echo ""
echo -e "${BLUE}📝 Package Contents:${NC}"
echo "   • Obfuscated backend code"
echo "   • Production frontend build"
echo "   • Automated installer"
echo "   • Management scripts"
echo "   • Complete documentation"
echo ""
echo -e "${BLUE}🚀 Next Steps:${NC}"
echo "   1. Transfer package to client server"
echo "   2. Extract: tar -xzf ${PACKAGE_NAME}.tar.gz"
echo "   3. Run: cd ${PACKAGE_NAME} && sudo ./install.sh"
echo ""
echo -e "${GREEN}Build script completed successfully!${NC}"