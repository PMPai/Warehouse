@echo off
cd /d "%~dp0"
title Warehouse Middle Platform (127.0.0.1:8088)
node src/server.js
pause
