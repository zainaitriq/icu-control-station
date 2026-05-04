# 🚀 ICU Control Station - Quick Deployment Reference

## 📋 Pre-Deployment Checklist

### Before Building Package

- [ ] All code tested and working
- [ ] Frontend builds successfully (`cd frontend && npm run build`)
- [ ] Backend connects to Kafka successfully
- [ ] All dependencies installed
- [ ] Documentation updated
- [ ] Version number updated in scripts

### Required Files

- [ ] `backend/` directory with source code
- [ ] `frontend/` directory with source code
- [ ] `ecosystem.config.js` (PM2 configuration)
- [ ] `install.sh` (installation script)
- [ ] `scripts/obfuscate.js` (code encryption)
- [ ] SSL certificates from client (keep separate)

---

## 🔨 Build Deployment Package

### Step 1: Install Required Tools

```bash
# Install obfuscation tool
npm install -g javascript-obfuscator

# Verify installation
javascript-obfuscator --version
```

### Step 2: Build Package

```bash
# Run the build script
./build-deployment.sh
```

This will:
1. ✅ Obfuscate backend code (encryption)
2. ✅ Build frontend for production
3. ✅ Copy all necessary files
4. ✅ Create deployment archive

### Step 3: Verify Package

```bash
# Check the created package
ls -lh build/icu-control-station-v*.tar.gz

# Extract and verify (optional)
cd build
tar -xzf icu-control-station-v1.0.0.tar.gz
ls -la icu-control-station-v1.0.0/
```

---

## 📦 Transfer to Client

### Option A: USB Drive

```bash
# Copy to USB
cp build/icu-control-station-v1.0.0.tar.gz /media/usb/

# On client machine
cp /media/usb/icu-control-station-v1.0.0.tar.gz ~/
```

### Option B: SCP (Secure Copy)

```bash
scp build/icu-control-station-v1.0.0.tar.gz user@client-server:/tmp/
```

### Option C: SFTP

```bash
sftp user@client-server
put build/icu-control-station-v1.0.0.tar.gz
```

---

## 🏥 Client Installation (Run on Client Machine)

### Step 1: Extract Package

```bash
cd /tmp  # or wherever you transferred the file
tar -xzf icu-control-station-v1.0.0.tar.gz
cd icu-control-station-v1.0.0
```

### Step 2: Review Installation

```bash
# Read installation guide
cat INSTALL.md

# Check package contents
ls -la
```

### Step 3: Run Installer

```bash
# Run as root
sudo ./install.sh
```

The installer will:
- ✅ Install Node.js if needed
- ✅ Create system user (`icu-user`)
- ✅ Install application to `/opt/icu-control-station`
- ✅ Install PM2 (process manager)
- ✅ Set up log directories
- ✅ Configure auto-start on boot
- ✅ Create management commands

### Step 4: Configure Environment

```bash
# Edit configuration
sudo nano /opt/icu-control-station/.env
```

**Required Settings:**
```env
KAFKA_BROKER_HOST=10.168.103.168
KAFKA_BROKER_PORT=11091
CLIENT_ID=experia
CONSUMER_GROUP_ID=experia-icu-vitals-dashboard

SSL_CA_PATH=./certs/experia-ca1-signed.crt
SSL_KEY_PATH=./certs/experia.key
SSL_CERT_PATH=./certs/experia.certificate.pem

VITALSIGN_TOPIC=VITALSIGN_LIVE
WAVEFORM_TOPIC=WAVEFORM_LIVE
```

### Step 5: Add SSL Certificates

```bash
# Copy certificates to proper location
sudo cp /path/to/experia-ca1-signed.crt /opt/icu-control-station/certs/
sudo cp /path/to/experia.key /opt/icu-control-station/certs/
sudo cp /path/to/experia.certificate.pem /opt/icu-control-station/certs/

# Set proper permissions
sudo chmod 600 /opt/icu-control-station/certs/*
sudo chown icu-user:icu-user /opt/icu-control-station/certs/*
```

### Step 6: Start Services

```bash
# Start the system
icu-start

# Check status
icu-status
```

---

## 🎛️ Management Commands

### Basic Operations

```bash
# Start all services
icu-start

# Stop all services
icu-stop

# Restart all services
icu-restart

# Check status
icu-status

# View live logs
icu-logs
```

### Advanced PM2 Commands

```bash
# View detailed status
pm2 status

# Monitor resources
pm2 monit

# View logs for specific service
pm2 logs icu-bridge
pm2 logs icu-consumer

# Restart specific service
pm2 restart icu-bridge
pm2 restart icu-consumer

# View process info
pm2 info icu-bridge
```

---

## 🔍 Verification & Testing

### 1. Check Services Running

```bash
icu-status
# Should show:
# icu-bridge    │ online
# icu-consumer  │ online
```

### 2. Test WebSocket Bridge

```bash
curl http://localhost:8081/health
# Should return: {"status":"ok","timestamp":"..."}
```

### 3. Check Kafka Connection

```bash
# View consumer logs
pm2 logs icu-consumer --lines 50

# Look for:
# ✅ Connected to Kafka broker
# ✅ Subscribed to: VITALSIGN_LIVE
# ✅ Subscribed to: WAVEFORM_LIVE
```

### 4. Access Dashboard

```bash
# Get server IP
hostname -I

# Open browser to:
# http://<server-ip>
```

---

## 🐛 Troubleshooting

### Service Won't Start

```bash
# Check PM2 logs
pm2 logs --err

# Check configuration
sudo nano /opt/icu-control-station/.env

# Verify certificates exist
ls -la /opt/icu-control-station/certs/

# Check permissions
sudo ls -la /opt/icu-control-station/
```

### Cannot Connect to Kafka

```bash
# Test Kafka connectivity
telnet <kafka-host> <kafka-port>

# Check SSL certificates
openssl verify -CAfile /opt/icu-control-station/certs/ca.crt \
  /opt/icu-control-station/certs/client.pem

# View consumer logs for errors
pm2 logs icu-consumer --err --lines 100
```

### High Memory/CPU Usage

```bash
# Monitor resources
pm2 monit

# Restart services if needed
icu-restart

# Check system resources
htop
free -h
df -h
```

### Frontend Not Loading

```bash
# Check Nginx status (if installed)
sudo systemctl status nginx

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

---

## 🔐 Security Best Practices

### 1. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8081/tcp  # WebSocket
sudo ufw enable
```

### 2. SSL/TLS for HTTPS

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Test renewal
sudo certbot renew --dry-run
```

### 3. Regular Backups

```bash
# Manual backup
cd /opt/icu-control-station
./scripts/backup.sh

# Schedule automatic backups (daily at 2 AM)
sudo crontab -e
# Add: 0 2 * * * /opt/icu-control-station/scripts/backup.sh
```

---

## 📊 Monitoring

### System Health Check

```bash
# Run health check
/opt/icu-control-station/scripts/health-check.sh
```

### Set Up Monitoring (Optional)

```bash
# Schedule health checks every 5 minutes
sudo crontab -e
# Add:
*/5 * * * * /opt/icu-control-station/scripts/health-check.sh >> /var/log/icu/health-check.log 2>&1
```

### View Logs

```bash
# Application logs
tail -f /var/log/icu/bridge.log
tail -f /var/log/icu/consumer.log

# Error logs
tail -f /var/log/icu/bridge-error.log
tail -f /var/log/icu/consumer-error.log

# System logs
sudo journalctl -f
```

---

## 🔄 Updates & Maintenance

### Updating the Application

```bash
# 1. Stop services
icu-stop

# 2. Backup current installation
sudo tar -czf /opt/icu-backups/pre-update-$(date +%Y%m%d).tar.gz \
  /opt/icu-control-station

# 3. Extract new package
cd /tmp
tar -xzf icu-control-station-v1.1.0.tar.gz
cd icu-control-station-v1.1.0

# 4. Copy new files
sudo cp -r backend-obfuscated/* /opt/icu-control-station/
sudo cp -r frontend-build/dist/* /opt/icu-control-station/frontend/dist/

# 5. Update dependencies
cd /opt/icu-control-station
sudo -u icu-user npm install --production

# 6. Restart services
icu-start
```

### Log Rotation

```bash
# Configure log rotation
sudo nano /etc/logrotate.d/icu-control-station

# Add:
/var/log/icu/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

---

## 📞 Support Contacts

### Getting Help

1. Check logs: `icu-logs`
2. Run health check: `icu-status`
3. Review documentation in `/opt/icu-control-station/docs/`
4. Contact system administrator

### Important Files

- Configuration: `/opt/icu-control-station/.env`
- Logs: `/var/log/icu/`
- Backups: `/opt/icu-backups/`
- Application: `/opt/icu-control-station/`

---

## 🎯 Quick Reference Card

```bash
# DAILY OPERATIONS
icu-status          # Check system health
icu-logs            # View real-time logs

# IF ISSUES
icu-restart         # Restart all services
pm2 logs --err      # Check error logs

# MONITORING
pm2 monit           # Resource monitoring
pm2 status          # Process status

# MAINTENANCE
./scripts/backup.sh             # Create backup
./scripts/health-check.sh       # Run health check

# UPDATES
icu-stop                        # Before update
icu-start                       # After update
```

---

**Installation Directory:** `/opt/icu-control-station/`  
**Log Directory:** `/var/log/icu/`  
**Backup Directory:** `/opt/icu-backups/`  
**Service User:** `icu-user`

© 2025 - ICU Control Station v1.0.0