@echo off
echo Starting ICU Control Station...
echo.

cd /d "C:\ICU-Control-Station"

echo [1/3] Starting WebSocket Bridge...
pm2 delete icu-bridge 2>nul
pm2 start src\websocket-bridge.js --name icu-bridge
timeout /t 2 /nobreak >nul

echo [2/3] Starting Kafka Consumer...
pm2 delete icu-consumer 2>nul
pm2 start src\consumer.js --name icu-consumer
timeout /t 2 /nobreak >nul

echo [3/3] Starting Frontend Server (Network Accessible)...
start /B http-server frontend -p 3000 -a 0.0.0.0

pm2 save

echo.
echo ===============================================
echo ICU Control Station Started!
echo ===============================================
echo.

REM Get IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do set IP=%%a
set IP=%IP:~1%

echo Dashboard (Local):   http://localhost:3000
echo Dashboard (Network): http://%IP%:3000
echo WebSocket (Network): ws://%IP%:8081
echo.
echo Status:
pm2 status
echo.
echo Opening dashboard...
timeout /t 2 /nobreak >nul
start http://localhost:3000
echo.
pause