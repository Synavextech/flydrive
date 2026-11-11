module.exports = {
  apps: [
    {
      name: 'driveflyelectric-server',
      script: 'server/dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: process.env.PORT || process.env.BACKEND_PORT || 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || process.env.BACKEND_PORT || 5000
      },
      error_file: './logs/server-err.log',
      out_file: './logs/server-out.log',
      log_file: './logs/server-combined.log',
      time: true
    }
  ]
};