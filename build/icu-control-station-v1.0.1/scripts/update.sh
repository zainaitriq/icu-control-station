#!/bin/bash
echo "Updating ICU Control Station..."
cd /opt/icu-control-station
sudo -u icu-user pm2 stop ecosystem.config.js
sudo tar -czf /opt/icu-backups/pre-update-$(date +%Y%m%d-%H%M%S).tar.gz /opt/icu-control-station
sudo -u icu-user npm install --production
sudo -u icu-user pm2 restart ecosystem.config.js
echo "Update complete!"
