Linux portable package
=======================

This directory is intended to be copied as a whole to a Linux machine.

Start:
  chmod +x start.sh bin/yt-dlp bin/ffmpeg
  ./start.sh

Open:
  http://127.0.0.1:2570/

Required runtime:
  - Linux x86_64 (or matching binaries in bin/)
  - Node.js 18 or newer, either installed as `node` or copied to bin/node
  - yt-dlp, either copied to bin/yt-dlp or installed in PATH
  - ffmpeg, either copied to bin/ffmpeg or installed in PATH
  - node_modules/express preinstalled for offline use

For a fully self-contained package, include the Linux executables and
node_modules/ in this directory before copying it:
  bin/node
  bin/yt-dlp
  bin/ffmpeg
  node_modules/

If node_modules/ is missing, start.sh tries `npm ci --offline`. It will only
work when npm's cache already contains every required package.

The Windows ffmpeg.exe files are not compatible with Linux and are intentionally
not included in this package. Linux executables must match the target CPU and
runtime libraries. No single native package can run on every CPU architecture.

Optional environment variables:
  PORT=3000
  HOST=0.0.0.0
  YT_DLP_COOKIES=/path/to/cookies.txt
  YT_DLP_PROXY=http://127.0.0.1:7890
  PARSE_TIMEOUT_MS=60000
