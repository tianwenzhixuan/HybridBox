// PM2 process config. Usage:
//   npm run build
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2-startup install   (optional: start on boot)
module.exports = {
  apps: [
    {
      name: "hybridbox",
      script: "dist/cli.js",
      args: "start",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
