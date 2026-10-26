module.exports = {
  apps: [{ name: 'p2p-file-room', script: './server.js', instances: 1, autorestart: true, watch: false, env: { NODE_ENV: 'production', PORT: 1240, ADMIN_PORT: 1244, ADMIN_TOKEN: '17799YGFygf' } }]
};
