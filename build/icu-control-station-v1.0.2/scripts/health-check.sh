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
