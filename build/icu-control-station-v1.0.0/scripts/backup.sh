#!/bin/bash
BACKUP_DIR="/opt/icu-backups"
BACKUP_FILE="$BACKUP_DIR/icu-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
mkdir -p $BACKUP_DIR
echo "Creating backup: $BACKUP_FILE"
tar -czf $BACKUP_FILE --exclude=/opt/icu-control-station/node_modules --exclude=/opt/icu-control-station/logs /opt/icu-control-station
echo "Backup created: $BACKUP_FILE"
ls -lh $BACKUP_FILE
