# ICU Control Station - Installation Instructions

## Quick Start

1. Extract the package:
   tar -xzf icu-control-station-v1.0.2.tar.gz
   cd icu-control-station-v1.0.2

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
