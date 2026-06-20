#!/bin/bash

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/icu-control-station"
SERVICE_USER="icu-user"
LOG_DIR="/var/log/icu"
BACKUP_DIR="/opt/icu-backups"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════╗"
echo "║  ICU Control Station - Installation Script    ║"
echo "║  Version 1.0.0                                 ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Please run as root (sudo ./install.sh)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Running with root privileges${NC}\n"

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
else
    echo -e "${RED}❌ Cannot detect operating system${NC}"
    exit 1
fi

echo -e "${BLUE}📋 System Information:${NC}"
echo "   OS: $OS $VER"
echo "   Hostname: $(hostname)"
echo "   IP: $(hostname -I | awk '{print $1}')"
echo ""

# Create backup if existing installation
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⚠️  Existing installation found${NC}"
    read -p "Create backup before upgrading? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        BACKUP_FILE="$BACKUP_DIR/icu-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
        mkdir -p $BACKUP_DIR
        echo -e "${BLUE}💾 Creating backup: $BACKUP_FILE${NC}"
        tar -czf $BACKUP_FILE -C $(dirname $INSTALL_DIR) $(basename $INSTALL_DIR)
        echo -e "${GREEN}✅ Backup created${NC}"
    fi
fi

# Create directories
echo -e "\n${BLUE}📁 Creating directories...${NC}"
mkdir -p $INSTALL_DIR
mkdir -p $LOG_DIR
mkdir -p $BACKUP_DIR
echo -e "${GREEN}✅ Directories created${NC}"

# Create service user
if id "$SERVICE_USER" &>/dev/null; then
    echo -e "${GREEN}✅ User $SERVICE_USER already exists${NC}"
else
    echo -e "${BLUE}👤 Creating service user...${NC}"
    useradd -r -s /bin/false $SERVICE_USER
    echo -e "${GREEN}✅ User created${NC}"
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo -e "\n${BLUE}📦 Installing Node.js...${NC}"
    
    # Install Node.js 18.x
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    
    echo -e "${GREEN}✅ Node.js installed: $(node --version)${NC}"
else
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js already installed: $NODE_VERSION${NC}"
    
    # Check if version is acceptable (v16+)
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -lt 16 ]; then
        echo -e "${YELLOW}⚠️  Node.js version is old. Upgrading to v18...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    fi
fi

# Copy application files
echo -e "\n${BLUE}📋 Copying application files...${NC}"

if [ -d "./backend-obfuscated" ]; then
    cp -r ./backend-obfuscated/* $INSTALL_DIR/
    echo -e "${GREEN}✅ Backend files copied (obfuscated)${NC}"
elif [ -d "./backend" ]; then
    cp -r ./backend/* $INSTALL_DIR/
    echo -e "${GREEN}✅ Backend files copied${NC}"
else
    echo -e "${RED}❌ Backend source not found!${NC}"
    exit 1
fi

# Copy configuration files
if [ -f "./ecosystem.config.js" ]; then
    cp ./ecosystem.config.js $INSTALL_DIR/
    echo -e "${GREEN}✅ PM2 configuration copied${NC}"
fi

if [ -f "./config/.env.template" ]; then
    cp ./config/.env.template $INSTALL_DIR/.env.template
elif [ -f "./.env.example" ]; then
    cp ./.env.example $INSTALL_DIR/.env.template
fi

# Set permissions
echo -e "\n${BLUE}🔒 Setting permissions...${NC}"
chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR
chown -R $SERVICE_USER:$SERVICE_USER $LOG_DIR
chmod 755 $INSTALL_DIR
chmod 700 $INSTALL_DIR/certs 2>/dev/null || true
echo -e "${GREEN}✅ Permissions set${NC}"

# Install dependencies
echo -e "\n${BLUE}📦 Installing application dependencies...${NC}"
cd $INSTALL_DIR
sudo -u $SERVICE_USER npm install --production
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo -e "\n${BLUE}🔧 Installing PM2...${NC}"
    npm install -g pm2
    echo -e "${GREEN}✅ PM2 installed: $(pm2 --version)${NC}"
else
    echo -e "${GREEN}✅ PM2 already installed: $(pm2 --version)${NC}"
fi

# Configure environment
echo -e "\n${BLUE}⚙️  Configuring environment...${NC}"

if [ -f "$INSTALL_DIR/.env" ]; then
    echo -e "${GREEN}✅ .env file already exists${NC}"
else
    if [ -f "$INSTALL_DIR/.env.template" ]; then
        cp $INSTALL_DIR/.env.template $INSTALL_DIR/.env
        chmod 600 $INSTALL_DIR/.env
        chown $SERVICE_USER:$SERVICE_USER $INSTALL_DIR/.env
        echo -e "${YELLOW}⚠️  Created .env from template${NC}"
        echo -e "${YELLOW}⚠️  You MUST configure $INSTALL_DIR/.env before starting!${NC}"
        CONFIG_NEEDED=true
    else
        echo -e "${YELLOW}⚠️  No .env template found${NC}"
    fi
fi

# Check for SSL certificates
echo -e "\n${BLUE}🔐 Checking SSL certificates...${NC}"
CERT_DIR="$INSTALL_DIR/certs"
if [ ! -d "$CERT_DIR" ]; then
    mkdir -p $CERT_DIR
    chown $SERVICE_USER:$SERVICE_USER $CERT_DIR
    chmod 700 $CERT_DIR
fi

MISSING_CERTS=false
if [ ! -f "$CERT_DIR/ca.crt" ] && [ ! -f "$CERT_DIR/experia-ca1-signed.crt" ]; then
    echo -e "${YELLOW}⚠️  CA certificate not found${NC}"
    MISSING_CERTS=true
fi

if [ ! -f "$CERT_DIR/client.key" ] && [ ! -f "$CERT_DIR/experia.key" ]; then
    echo -e "${YELLOW}⚠️  Client key not found${NC}"
    MISSING_CERTS=true
fi

if [ ! -f "$CERT_DIR/client.pem" ] && [ ! -f "$CERT_DIR/experia.certificate.pem" ]; then
    echo -e "${YELLOW}⚠️  Client certificate not found${NC}"
    MISSING_CERTS=true
fi

if [ "$MISSING_CERTS" = true ]; then
    echo -e "${YELLOW}⚠️  Please copy SSL certificates to: $CERT_DIR${NC}"
    CONFIG_NEEDED=true
else
    echo -e "${GREEN}✅ SSL certificates found${NC}"
fi

# Install Nginx (optional)
echo -e "\n${BLUE}🌐 Frontend Web Server Setup${NC}"
read -p "Install Nginx for serving frontend? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}📦 Installing Nginx...${NC}"
    apt-get update
    apt-get install -y nginx
    
    # Create Nginx configuration
    cat > /etc/nginx/sites-available/icu-dashboard << 'EOF'
server {
    listen 80;
    server_name _;
    
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
    }
    
    # API proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF
    
    ln -sf /etc/nginx/sites-available/icu-dashboard /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    nginx -t && systemctl restart nginx
    systemctl enable nginx
    
    echo -e "${GREEN}✅ Nginx installed and configured${NC}"
    NGINX_INSTALLED=true
fi

# Setup PM2 startup
echo -e "\n${BLUE}🚀 Configuring PM2 for auto-start...${NC}"

# Stop any existing PM2 processes
sudo -u $SERVICE_USER pm2 kill 2>/dev/null || true

# Configure PM2 startup
env PATH=$PATH:/usr/bin pm2 startup systemd -u $SERVICE_USER --hp /home/$SERVICE_USER

echo -e "${GREEN}✅ PM2 startup configured${NC}"

# Create management scripts
echo -e "\n${BLUE}📜 Creating management scripts...${NC}"

cat > /usr/local/bin/icu-start << 'EOF'
#!/bin/bash
cd /opt/icu-control-station
sudo -u icu-user pm2 start ecosystem.config.js
echo "✅ ICU Control Station started"
pm2 status
EOF

cat > /usr/local/bin/icu-stop << 'EOF'
#!/bin/bash
sudo -u icu-user pm2 stop ecosystem.config.js
echo "🛑 ICU Control Station stopped"
EOF

cat > /usr/local/bin/icu-restart << 'EOF'
#!/bin/bash
sudo -u icu-user pm2 restart ecosystem.config.js
echo "🔄 ICU Control Station restarted"
pm2 status
EOF

cat > /usr/local/bin/icu-status << 'EOF'
#!/bin/bash
echo "📊 ICU Control Station Status"
echo "=============================="
sudo -u icu-user pm2 status
echo ""
echo "📝 Recent Logs:"
sudo -u icu-user pm2 logs --lines 10 --nostream
EOF

cat > /usr/local/bin/icu-logs << 'EOF'
#!/bin/bash
sudo -u icu-user pm2 logs
EOF

chmod +x /usr/local/bin/icu-*
echo -e "${GREEN}✅ Management scripts created${NC}"
echo "   • icu-start   - Start services"
echo "   • icu-stop    - Stop services"
echo "   • icu-restart - Restart services"
echo "   • icu-status  - Check status"
echo "   • icu-logs    - View logs"

# Summary
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════╗"
echo -e "║           Installation Complete!                ║"
echo -e "╚════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$CONFIG_NEEDED" = true ]; then
    echo -e "${YELLOW}⚠️  IMPORTANT: Complete these steps before starting:${NC}"
    echo ""
    echo -e "${YELLOW}1. Configure Kafka settings:${NC}"
    echo "   sudo nano $INSTALL_DIR/.env"
    echo ""
    echo -e "${YELLOW}2. Add SSL certificates to:${NC}"
    echo "   $CERT_DIR/"
    echo "   - ca.crt (CA certificate)"
    echo "   - client.key (Client private key)"
    echo "   - client.pem (Client certificate)"
    echo ""
    echo -e "${YELLOW}3. Set proper permissions:${NC}"
    echo "   sudo chmod 600 $INSTALL_DIR/.env"
    echo "   sudo chmod 600 $CERT_DIR/*"
    echo ""
    echo -e "${YELLOW}4. Start the services:${NC}"
    echo "   icu-start"
    echo ""
else
    echo -e "${GREEN}✅ System is ready to start!${NC}"
    echo ""
    read -p "Start ICU Control Station now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        icu-start
    else
        echo "Start later with: icu-start"
    fi
fi

echo ""
echo -e "${BLUE}📖 Quick Reference:${NC}"
echo "   Installation: $INSTALL_DIR"
echo "   Logs:         $LOG_DIR"
echo "   Config:       $INSTALL_DIR/.env"
echo "   Backups:      $BACKUP_DIR"

if [ "$NGINX_INSTALLED" = true ]; then
    IP=$(hostname -I | awk '{print $1}')
    echo ""
    echo -e "${GREEN}🌐 Access the dashboard:${NC}"
    echo "   http://$IP"
    echo "   WebSocket: ws://$IP:8081"
fi

echo ""
echo -e "${BLUE}📚 Documentation:${NC}"
echo "   README: $INSTALL_DIR/README.md"
echo "   Support: Check logs with 'icu-logs'"
echo ""
echo -e "${GREEN}Installation script completed successfully!${NC}"