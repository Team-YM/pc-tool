#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export PATH="$APP_DIR/bin:$PATH"
export NODE_ENV="${NODE_ENV:-production}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"

if [[ -x "$APP_DIR/bin/node" ]]; then
  NODE="$APP_DIR/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
else
  echo "错误：未找到 Node.js。请安装 Node.js 18 或更高版本，或将 node 放入 bin/。" >&2
  exit 1
fi

if [[ ! -d "$APP_DIR/node_modules/express" ]]; then
  if command -v npm >/dev/null 2>&1; then
    npm ci --offline --prefix "$APP_DIR" || {
      echo "错误：项目依赖未预装且 npm 离线缓存不完整。请在可联网的 Linux 主机运行 npm ci 后重新打包。" >&2
      exit 1
    }
  else
    echo "错误：缺少 node_modules，且未找到 npm。请预装项目依赖。" >&2
    exit 1
  fi
fi

if [[ -x "$APP_DIR/bin/yt-dlp" ]]; then
  export YT_DLP_PATH="$APP_DIR/bin/yt-dlp"
elif ! command -v yt-dlp >/dev/null 2>&1; then
  echo "错误：未找到 yt-dlp。请将 Linux 版 yt-dlp 放入 bin/，或安装到系统 PATH。" >&2
  exit 1
fi

if [[ -x "$APP_DIR/bin/ffmpeg" ]]; then
  export FFMPEG_PATH="$APP_DIR/bin/ffmpeg"
elif ! command -v ffmpeg >/dev/null 2>&1; then
  echo "错误：未找到 ffmpeg。请将 Linux 版 ffmpeg 放入 bin/，或安装到系统 PATH。" >&2
  exit 1
fi

cd "$APP_DIR"
exec "$NODE" server.js
