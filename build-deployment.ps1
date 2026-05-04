# ICU Control Station - Windows Build Script
# Run with: powershell -ExecutionPolicy Bypass -File build-deployment.ps1

$ErrorActionPreference = "Stop"

$VERSION = "1.0.0"
$PACKAGE_NAME = "icu-control-station-v$VERSION"
$BUILD_DIR = ".\build"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  ICU Control Station - Deployment Builder     " -ForegroundColor Cyan
Write-Host "  Version $VERSION                              " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Clean previous build
if (Test-Path $BUILD_DIR) {
    Write-Host "Cleaning previous build..." -ForegroundColor Yellow
    Remove-Item -Path $BUILD_DIR -Recurse -Force
}

# Create directory structure
Write-Host "Creating package structure..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path "$BUILD_DIR\$PACKAGE_NAME\backend-obfuscated\src" -Force | Out-Null
New-Item -ItemType Directory -Path "$BUILD_DIR\$PACKAGE_NAME\backend-obfuscated\certs" -Force | Out-Null
New-Item -ItemType Directory -Path "$BUILD_DIR\$PACKAGE_NAME\frontend-build" -Force | Out-Null
New-Item -ItemType Directory -Path "$BUILD_DIR\$PACKAGE_NAME\config" -Force | Out-Null
New-Item -ItemType Directory -Path "$BUILD_DIR\$PACKAGE_NAME\scripts" -Force | Out-Null
New-Item -ItemType Directory -Path "$BUILD_DIR\$PACKAGE_NAME\docs" -Force | Out-Null

# Step 1: Obfuscate backend code
Write-Host ""
Write-Host "Step 1: Obfuscating backend code..." -ForegroundColor Cyan

# Check if obfuscator is installed
try {
    $null = Get-Command javascript-obfuscator -ErrorAction Stop
    Write-Host "  javascript-obfuscator found" -ForegroundColor Green
} catch {
    Write-Host "  Installing javascript-obfuscator..." -ForegroundColor Yellow
    npm install -g javascript-obfuscator
}

# Obfuscate each backend file
if (Test-Path ".\backend\src") {
    $backendFiles = Get-ChildItem -Path ".\backend\src\*.js" -File

    foreach ($file in $backendFiles) {
        Write-Host "  Obfuscating: $($file.Name)" -ForegroundColor Gray
        
        $outputPath = "$BUILD_DIR\$PACKAGE_NAME\backend-obfuscated\src\$($file.Name)"
        
        javascript-obfuscator $file.FullName `
            --output $outputPath `
            --compact true `
            --control-flow-flattening true `
            --control-flow-flattening-threshold 0.75 `
            --dead-code-injection true `
            --dead-code-injection-threshold 0.4 `
            --debug-protection true `
            --disable-console-output false `
            --identifier-names-generator hexadecimal `
            --log false `
            --rename-globals false `
            --self-defending true `
            --string-array true `
            --string-array-encoding "base64" `
            --string-array-threshold 0.75
    }

    Write-Host "  Backend code obfuscated" -ForegroundColor Green
} else {
    Write-Host "  WARNING: backend\src directory not found!" -ForegroundColor Red
    Write-Host "  Copying backend as-is..." -ForegroundColor Yellow
    Copy-Item -Path ".\backend\*" -Destination "$BUILD_DIR\$PACKAGE_NAME\backend-obfuscated\" -Recurse -Force
}

# Step 2: Build frontend
Write-Host ""
Write-Host "Step 2: Building frontend..." -ForegroundColor Cyan
if (Test-Path ".\frontend") {
    Push-Location .\frontend

    if (Test-Path ".\node_modules") {
        npm run build
    } else {
        Write-Host "  Installing dependencies..." -ForegroundColor Yellow
        npm install
        npm run build
    }

    Pop-Location

    if (Test-Path ".\frontend\dist") {
        Copy-Item -Path ".\frontend\dist\*" -Destination "$BUILD_DIR\$PACKAGE_NAME\frontend-build\" -Recurse -Force
        Write-Host "  Frontend built and copied" -ForegroundColor Green
    } else {
        Write-Host "  Frontend build failed" -ForegroundColor Yellow
    }
} else {
    Write-Host "  WARNING: frontend directory not found!" -ForegroundColor Red
}

# Step 3: Copy package.json and create .env template
Write-Host ""
Write-Host "Step 3: Copying configuration files..." -ForegroundColor Cyan

# Copy and clean package.json
if (Test-Path ".\backend\package.json") {
    $packageJson = Get-Content ".\backend\package.json" | ConvertFrom-Json
    $packageJson.PSObject.Properties.Remove('devDependencies')
    $packageJson.scripts = @{
        start = "node src/consumer.js"
        bridge = "node src/websocket-bridge.js"
    }
    $packageJson | ConvertTo-Json -Depth 10 | Set-Content "$BUILD_DIR\$PACKAGE_NAME\backend-obfuscated\package.json"
    Write-Host "  package.json" -ForegroundColor Green
}

# Copy ecosystem config
if (Test-Path ".\ecosystem.config.js") {
    Copy-Item -Path ".\ecosystem.config.js" -Destination "$BUILD_DIR\$PACKAGE_NAME\config\" -Force
    Write-Host "  ecosystem.config.js" -ForegroundColor Green
}

# Create .env template
$envTemplate = @"
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
"@

$envTemplate | Out-File -FilePath "$BUILD_DIR\$PACKAGE_NAME\config\.env.template" -Encoding UTF8
Write-Host "  .env.template" -ForegroundColor Green

# Step 4: Copy installation scripts
Write-Host ""
Write-Host "Step 4: Copying scripts..." -ForegroundColor Cyan

if (Test-Path ".\install.sh") {
    Copy-Item -Path ".\install.sh" -Destination "$BUILD_DIR\$PACKAGE_NAME\" -Force
    Write-Host "  install.sh" -ForegroundColor Green
}
# Copy network-enabled start script
if (Test-Path ".\start-all.bat") {
    Copy-Item -Path ".\start-all.bat" -Destination "$BUILD_DIR\$PACKAGE_NAME\" -Force
    Write-Host "  start-all.bat" -ForegroundColor Green
}

# Create management scripts
$updateScript = @"
#!/bin/bash
echo "Updating ICU Control Station..."
cd /opt/icu-control-station
sudo -u icu-user pm2 stop ecosystem.config.js
sudo tar -czf /opt/icu-backups/pre-update-`$(date +%Y%m%d-%H%M%S).tar.gz /opt/icu-control-station
sudo -u icu-user npm install --production
sudo -u icu-user pm2 restart ecosystem.config.js
echo "Update complete!"
"@

$updateScript | Out-File -FilePath "$BUILD_DIR\$PACKAGE_NAME\scripts\update.sh" -Encoding UTF8

$backupScript = @"
#!/bin/bash
BACKUP_DIR="/opt/icu-backups"
BACKUP_FILE="`$BACKUP_DIR/icu-backup-`$(date +%Y%m%d-%H%M%S).tar.gz"
mkdir -p `$BACKUP_DIR
echo "Creating backup: `$BACKUP_FILE"
tar -czf `$BACKUP_FILE --exclude=/opt/icu-control-station/node_modules --exclude=/opt/icu-control-station/logs /opt/icu-control-station
echo "Backup created: `$BACKUP_FILE"
ls -lh `$BACKUP_FILE
"@

$backupScript | Out-File -FilePath "$BUILD_DIR\$PACKAGE_NAME\scripts\backup.sh" -Encoding UTF8

$healthScript = @"
#!/bin/bash
echo "ICU Control Station - Health Check"
echo "======================================"
echo ""
echo "Process Status:"
pm2 status
echo ""
echo "WebSocket Bridge:"
if curl -f http://localhost:8081/health > /dev/null 2>&1; then
    echo "Bridge is healthy"
else
    echo "Bridge is not responding"
fi
echo ""
echo "Disk Space:"
df -h / | tail -1
echo ""
echo "Memory Usage:"
free -h | grep Mem
echo ""
"@

$healthScript | Out-File -FilePath "$BUILD_DIR\$PACKAGE_NAME\scripts\health-check.sh" -Encoding UTF8

Write-Host "  Management scripts created" -ForegroundColor Green

# Step 5: Copy documentation
Write-Host ""
Write-Host "Step 5: Copying documentation..." -ForegroundColor Cyan

if (Test-Path ".\README.md") {
    Copy-Item -Path ".\README.md" -Destination "$BUILD_DIR\$PACKAGE_NAME\docs\" -Force
    Write-Host "  README.md" -ForegroundColor Green
}

if (Test-Path ".\DEPLOYMENT_GUIDE.md") {
    Copy-Item -Path ".\DEPLOYMENT_GUIDE.md" -Destination "$BUILD_DIR\$PACKAGE_NAME\docs\" -Force
    Write-Host "  DEPLOYMENT_GUIDE.md" -ForegroundColor Green
}

# Create installation guide
$installGuide = @"
# ICU Control Station - Installation Instructions

## Quick Start

1. Extract the package:
   tar -xzf icu-control-station-v1.0.0.tar.gz
   cd icu-control-station-v1.0.0

2. Run the installer:
   sudo ./install.sh

3. Configure the system:
   sudo nano /opt/icu-control-station/.env

4. Add SSL certificates to /opt/icu-control-station/certs/

5. Start the services:
   icu-start

6. Check status:
   icu-status

## Management Commands

- icu-start   - Start all services
- icu-stop    - Stop all services
- icu-restart - Restart all services
- icu-status  - View service status
- icu-logs    - View real-time logs

(C) 2025 All Rights Reserved
"@

$installGuide | Out-File -FilePath "$BUILD_DIR\$PACKAGE_NAME\INSTALL.md" -Encoding UTF8
Write-Host "  INSTALL.md" -ForegroundColor Green

# Create certs README
$certsReadme = @"
SSL Certificate Directory

Place your Kafka SSL certificates here:

Required files:
- ca.crt (CA certificate)
- client.key (Client private key)
- client.pem (Client certificate)

These files must be provided by your Kafka administrator.
"@

$certsReadme | Out-File -FilePath "$BUILD_DIR\$PACKAGE_NAME\backend-obfuscated\certs\README.txt" -Encoding UTF8
Write-Host "  certs/README.txt" -ForegroundColor Green

# Create main README
$mainReadme = @"
# ICU Control Station - Production Package

Version 1.0.0

## Contents

- backend-obfuscated/ - Encrypted backend application
- frontend-build/ - Production frontend build
- config/ - Configuration templates
- scripts/ - Management scripts
- docs/ - Complete documentation
- install.sh - Automated installer

## Installation

Run the automated installer:

sudo ./install.sh

Follow the prompts and complete the configuration steps.

## Security Notice

This package contains obfuscated code to protect intellectual property.

(C) 2025 All Rights Reserved
"@

$mainReadme | Out-File -FilePath "$BUILD_DIR\$PACKAGE_NAME\README.md" -Encoding UTF8

# Step 6: Create archive
Write-Host ""
Write-Host "Step 6: Creating deployment archive..." -ForegroundColor Cyan

Push-Location $BUILD_DIR

# Try to use tar if available, otherwise use zip
$tarAvailable = $false
try {
    $null = Get-Command tar -ErrorAction Stop
    $tarAvailable = $true
} catch {
    $tarAvailable = $false
}

if ($tarAvailable) {
    try {
        tar -czf "$PACKAGE_NAME.tar.gz" $PACKAGE_NAME
        $archiveFile = "$PACKAGE_NAME.tar.gz"
        Write-Host "  Created tar.gz archive" -ForegroundColor Green
    } catch {
        Compress-Archive -Path $PACKAGE_NAME -DestinationPath "$PACKAGE_NAME.zip" -Force
        $archiveFile = "$PACKAGE_NAME.zip"
        Write-Host "  Created zip archive" -ForegroundColor Green
    }
} else {
    Compress-Archive -Path $PACKAGE_NAME -DestinationPath "$PACKAGE_NAME.zip" -Force
    $archiveFile = "$PACKAGE_NAME.zip"
    Write-Host "  Created zip archive" -ForegroundColor Green
}

Pop-Location

# Get file size
$size = (Get-Item "$BUILD_DIR\$archiveFile").Length / 1MB
$sizeFormatted = "{0:N2} MB" -f $size

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "       Package Build Complete!                  " -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Package: $BUILD_DIR\$archiveFile" -ForegroundColor Green
Write-Host "Size: $sizeFormatted" -ForegroundColor Green
Write-Host ""
Write-Host "Package Contents:" -ForegroundColor Cyan
Write-Host "  - Obfuscated backend code" -ForegroundColor Gray
Write-Host "  - Production frontend build" -ForegroundColor Gray
Write-Host "  - Automated installer" -ForegroundColor Gray
Write-Host "  - Management scripts" -ForegroundColor Gray
Write-Host "  - Complete documentation" -ForegroundColor Gray
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Transfer package to client server" -ForegroundColor Gray
Write-Host "  2. Extract and run installer" -ForegroundColor Gray
Write-Host ""
Write-Host "Build script completed successfully!" -ForegroundColor Green