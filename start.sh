#!/usr/bin/env bash
# 設備管理系統（warehouse）中台啟動腳本
# 開發期綁定 127.0.0.1:8088，未來改伺服器 IP（編輯 .env）
set -e
cd "$(dirname "$0")"

# 載入 .env（若存在）
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

HOST="${WAREHOUSE_HOST:-127.0.0.1}"
PORT="${WAREHOUSE_PORT:-8088}"

# 確保依賴
if [ ! -d node_modules ]; then
  echo "安裝依賴中..."
  npm install
fi

mkdir -p data photos

echo "啟動設備管理系統中台：http://${HOST}:${PORT}"
HOST="$HOST" PORT="$PORT" exec node src/server.js
