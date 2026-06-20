# ICU Control Station — Windows Installation Guide

This guide covers installing the ICU Control Station on a **Windows** client device.

> **Why this guide exists:** The deployment package ships with `install.sh`, which is a
> Linux-only installer (it uses `sudo`, `useradd`, `systemd`, and paths like `/opt` and
> `/var/log`). It will **not** run on Windows. The `build-deployment.ps1` file in the
> package is a *build* script for creating the package, **not** a client installer. The
> included `start-all.bat` was written for an older layout and points at paths that don't
> exist in this package, so it should not be used as-is. The steps below are the working
> Windows install.

If the client device can run **WSL2** or a **Linux VM**, the original `install.sh` path is
simpler and is what the package was designed and tested for. Use this guide only when the
target genuinely must be native Windows.

---

## 1. Package layout (as installed)

After extracting the package to `C:\icu-control-station-v1.0.0`, the relevant folders are:

```
C:\icu-control-station-v1.0.0\
├── backend-obfuscated\
│   └── src\
│       ├── websocket-bridge.js   # icu-bridge service (WebSocket, port 8081)
│       ├── consumer.js           # icu-consumer service (Kafka consumer)
│       ├── server.js             # REST API (optional, see §8)
│       └── test-producer.js      # test data generator (not for production)
├── frontend-build\               # dashboard production build (served as static files)
├── config\
│   ├── .env.template             # environment template
│   └── ecosystem.config.js       # PM2 config (Linux paths — replaced below)
├── docs\
├── scripts\
├── install.sh                    # Linux installer (ignore on Windows)
└── start-all.bat                 # stale, do not use
```

---

## 2. Prerequisites

Install these once on the client machine. Run PowerShell **as Administrator**.

1. **Node.js 18+** — install the LTS build from nodejs.org, then verify:
   ```powershell
   node -v
   ```
2. **PM2** (process manager — keeps services running and restarts on crash):
   ```powershell
   npm install -g pm2
   ```
3. **http-server** (serves the dashboard frontend):
   ```powershell
   npm install -g http-server
   ```

---

## 3. Install backend dependencies

```powershell
cd C:\icu-control-station-v1.0.0\backend-obfuscated
npm install --production
cd ..
```

---

## 4. Configure the environment

Copy the template into the backend folder and edit it:

```powershell
copy config\.env.template backend-obfuscated\.env
notepad backend-obfuscated\.env
```

Fill in the client-specific values:

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

> The cert paths are relative to the backend working directory
> (`backend-obfuscated\`), so the `certs` folder in the next step must live there.

---

## 5. Add SSL certificates

The client provides these three files. Place them where `.env` points:

```powershell
mkdir backend-obfuscated\certs
copy C:\path\to\experia-ca1-signed.crt    backend-obfuscated\certs\
copy C:\path\to\experia.key               backend-obfuscated\certs\
copy C:\path\to\experia.certificate.pem   backend-obfuscated\certs\
```

> If the backend can't find these, both services crash-loop on startup. The `pm2 logs`
> output in §7 will show this clearly.

---

## 6. Create the Windows PM2 config

The bundled `config\ecosystem.config.js` uses a Linux layout (`cwd: './backend'` with
relative paths) that doesn't match this package. Create a Windows version with absolute
paths instead. The original file is left untouched.

Paste this entire block into PowerShell from the package root
(`C:\icu-control-station-v1.0.0`):

```powershell
@'
const ROOT = 'C:/icu-control-station-v1.0.0';

module.exports = {
  apps: [
    {
      name: 'icu-bridge',
      script: 'src/websocket-bridge.js',
      cwd: ROOT + '/backend-obfuscated',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production', PORT: 8081 },
      error_file: ROOT + '/logs/bridge-error.log',
      out_file: ROOT + '/logs/bridge-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    },
    {
      name: 'icu-consumer',
      script: 'src/consumer.js',
      cwd: ROOT + '/backend-obfuscated',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
      error_file: ROOT + '/logs/consumer-error.log',
      out_file: ROOT + '/logs/consumer-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    }
  ]
};
'@ | Set-Content -Path ecosystem.windows.config.js -Encoding UTF8
```

> **Note on `wait_ready`:** the original Linux config set `wait_ready: true`, which makes
> PM2 wait for the app to emit a `ready` signal before marking it started. It is
> deliberately omitted here so the services don't appear to hang during first bring-up. It
> can be added back later once everything is confirmed healthy.

> If you previously tried editing the file in Notepad and it "wasn't found," Notepad likely
> saved it as `ecosystem.windows.config.js.txt`. Delete the stray file:
> `del ecosystem.windows.config.js.txt`

---

## 7. Start the backend services

```powershell
mkdir logs
pm2 start ecosystem.windows.config.js
pm2 status
pm2 logs --lines 30
```

The `pm2 logs` output is the health check. A clean start shows both `icu-bridge` and
`icu-consumer` **online** and stable. If either is **restarting** repeatedly, the logs name
the cause — usually a missing `.env`, missing certs, or an unreachable Kafka broker.

---

## 8. Run the frontend dashboard

Find where `index.html` lives (it's either directly in `frontend-build` or under a `dist`
subfolder):

```powershell
dir frontend-build\index.html
dir frontend-build\dist\index.html
```

Serve whichever folder contains it, on port 3000, network-accessible:

```powershell
# if index.html is directly in frontend-build:
http-server frontend-build -p 3000 -a 0.0.0.0

# OR if it's under dist:
http-server frontend-build\dist -p 3000 -a 0.0.0.0
```

This command holds the terminal open while serving — that is expected. Open the dashboard:

- **Local:** `http://localhost:3000`
- **Network:** `http://<this-PC-IPv4>:3000` (run `ipconfig` to find the IPv4 address)

> **REST API (`server.js`):** The dashboard connects to live data over the WebSocket bridge
> (port 8081). If the dashboard loads but shows no data and the browser console references
> a failed `/api` call, the REST API may also be required. The Linux Nginx config proxied
> `/api` to port 3001. To run it as a third PM2 service, add a block for
> `src/server.js` to `ecosystem.windows.config.js`.

---

## 9. Verifying it works

The deployment is healthy when:

- `pm2 status` shows `icu-bridge` and `icu-consumer` **online** and not restarting.
- The dashboard loads at `http://localhost:3000`.
- Patient vitals and waveforms appear (this requires Kafka connectivity + valid certs).
- The browser shows a connected WebSocket, not a connection error.

---

## 10. Updating to a new code version

When the source code changes, you rebuild the package on your **dev device**, then push the
updated code to the client. You do **not** have to reinstall from scratch — an in-place
update keeps the client's existing `.env`, certificates, and PM2 config.

### 10.1 Rebuild the package (on your dev device)

The build script runs from your **source project** (the folder containing `backend\` and
`frontend\` subfolders and `build-deployment.ps1`) — *not* from an extracted package.

1. **Bump the version** so the new package is distinct from the old one. Edit
   `build-deployment.ps1`:
   ```powershell
   $VERSION = "1.0.1"
   ```
2. **Ensure the obfuscator is installed:**
   ```powershell
   npm install -g javascript-obfuscator
   ```
3. **Run the build from the source project root:**
   ```powershell
   cd C:\path\to\your\source-project
   powershell -ExecutionPolicy Bypass -File build-deployment.ps1
   ```
   This obfuscates the backend, runs `npm run build` on the frontend, assembles the
   package, and prints the output path — e.g. `.\build\icu-control-station-v1.0.1.tar.gz`.

> **Frontend changes & WebSocket host:** `npm run build` re-bakes the WebSocket target into
> the frontend. If network clients need access, set the correct server IP/host in the
> build's env var **before** building, or it will bake in `localhost` again (see §12).

### 10.2 Apply the update in place (on the client device)

Transfer the new archive to the client and extract it to a temp location. Then, from the
existing install folder (`C:\icu-control-station-v1.0.0`):

1. **Stop and fully kill PM2** so no `node` process holds the code files (a plain
   `pm2 stop` leaves handles open and the next step fails with "Access is denied"):
   ```powershell
   pm2 stop all
   pm2 kill
   ```
   If a rename still gets denied afterward, a stray `node` is holding the folder — clear it
   with `Stop-Process -Name node -Force` (kills *all* Node on the machine; fine on a
   dedicated box), or reboot.

2. **Back up the old code** (reversible — keep until the new build is verified):
   ```powershell
   ren backend-obfuscated backend-obfuscated.bak
   ren frontend-build frontend-build.bak
   ```

3. **Copy the new code folders in** from the extracted v1.0.1 package:
   ```powershell
   robocopy <temp>\icu-control-station-v1.0.1\backend-obfuscated backend-obfuscated /E
   robocopy <temp>\icu-control-station-v1.0.1\frontend-build     frontend-build     /E
   ```

4. **Restore config, certs, and dependencies into the new folder.** This is the critical
   step: the build **deliberately strips** `.env`, `certs\`, and `node_modules`, so the
   fresh `backend-obfuscated` is missing all three. Bring them back from the backup:
   ```powershell
   copy backend-obfuscated.bak\.env backend-obfuscated\
   robocopy backend-obfuscated.bak\certs        backend-obfuscated\certs        /E
   robocopy backend-obfuscated.bak\node_modules backend-obfuscated\node_modules /E
   ```
   > If your update **changed `package.json`** (added/updated dependencies), skip the
   > `node_modules` copy and install fresh instead:
   > `cd backend-obfuscated; npm install --production; cd ..`

5. **Verify the new folder is complete** before launching:
   ```powershell
   dir backend-obfuscated
   ```
   You should see all of: `src`, `.env`, `certs`, `node_modules`, `package.json`.

6. **Start the services.** Because PM2 was killed, the process list is empty — use `start`,
   not `restart`:
   ```powershell
   pm2 start ecosystem.windows.config.js
   pm2 status
   pm2 logs --lines 30
   ```

7. **Re-serve the frontend** and confirm the dashboard at `http://localhost:3000`:
   ```powershell
   http-server frontend-build -p 3000 -a 0.0.0.0
   ```

### 10.3 Rollback

Keep the `.bak` folders until the new build is confirmed healthy. To revert:

```powershell
pm2 stop all
pm2 kill
ren backend-obfuscated backend-obfuscated.failed
ren backend-obfuscated.bak backend-obfuscated
ren frontend-build frontend-build.failed
ren frontend-build.bak frontend-build
pm2 start ecosystem.windows.config.js
```

Once the update is confirmed good, the `.bak` (and any `.failed`) folders can be deleted.

---

## 11. Auto-start on boot (optional)

PM2's `pm2 startup` does **not** work on Windows. To make the services start automatically
after a reboot, use one of:

- **pm2-installer** — sets PM2 up as a proper Windows service.
- **NSSM** (Non-Sucking Service Manager) — wraps `pm2 resurrect` as a Windows service.

After choosing one, save the current PM2 process list so it's restored on boot:

```powershell
pm2 save
```

---

## 12. Day-to-day management

```powershell
pm2 status                 # service status
pm2 logs                   # live logs (all services)
pm2 logs icu-bridge        # logs for one service
pm2 restart all            # restart everything
pm2 stop all               # stop everything
pm2 monit                  # live resource monitor
```

---

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `'sudo' is not recognized` | Tried the Linux installer on Windows | Use this guide; ignore `install.sh` |
| `File ecosystem...js not found` | File saved as `.txt` by Notepad, or wrong folder | Recreate via §6 here-string; `del` the `.txt` |
| `Access to the path ... is denied` on rename | A `node` process still holds the folder | `pm2 kill`, then `Stop-Process -Name node -Force`, or reboot (§10.2) |
| `No process found` on `pm2 restart` | PM2 was killed; process list is empty | Use `pm2 start ecosystem.windows.config.js`, not `restart` |
| Service stuck **restarting** in `pm2 status` | Missing `.env`, certs, or `node_modules`; or Kafka unreachable | Read `pm2 logs`; recheck §4, §5, and §10.2 step 4 |
| Dashboard loads but no data | Backend down, or wrong WebSocket host | Confirm `icu-bridge` online; see note below |
| Network clients can't connect | WebSocket URL baked into the build points at `localhost` | Rebuild frontend with the server's IP/hostname |

> **WebSocket host note:** Because the frontend is a production build, its WebSocket target
> was fixed at build time (commonly `ws://localhost:8081`). That works when viewing on the
> same PC, but a browser on another machine will resolve `localhost` to *itself* and fail.
> For multi-machine access, the frontend must be rebuilt pointing at the server's IP or
> hostname.

---

*ICU Control Station — Windows deployment notes. Companion to the Linux `DEPLOYMENT_GUIDE.md`.*
