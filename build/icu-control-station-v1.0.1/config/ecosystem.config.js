module.exports = {
  apps: [
    {
      name: 'icu-bridge',
      script: './src/websocket-bridge.js',
      cwd: './backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 8081
      },
      error_file: './logs/bridge-error.log',
      out_file: './logs/bridge-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      // Auto-restart settings
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      // Kill timeout
      kill_timeout: 5000,
      // Listen timeout
      listen_timeout: 10000,
      // Graceful shutdown
      shutdown_with_message: true,
      wait_ready: true
    },
    {
      name: 'icu-consumer',
      script: './src/consumer.js',
      cwd: './backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/consumer-error.log',
      out_file: './logs/consumer-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      // Auto-restart settings
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      // Kill timeout
      kill_timeout: 5000,
      // Wait for bridge to be ready before starting
      wait_ready: true,
      listen_timeout: 10000
    }
  ],

  // Deployment configuration (optional - for future use)
  deploy: {
    production: {
      user: 'icu-user',
      host: 'production-server',
      ref: 'origin/main',
      repo: 'git@github.com:yourorg/icu-control-station.git',
      path: '/opt/icu-control-station',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};