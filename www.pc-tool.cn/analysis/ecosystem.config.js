module.exports = {
  apps: [{
    name: 'media-parser-site',
    cwd: __dirname,
    script: './server.js',
    interpreter: 'node',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: 2570,
      YT_DLP_PATH: './bin/yt-dlp',
      FFMPEG_PATH: './bin/ffmpeg'
    }
  }]
};
