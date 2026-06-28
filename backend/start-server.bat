@echo off
cd /d "%~dp0"
echo ======================================================== >> server-log.txt
echo Starting MS Chellamuthu Trust Inventory Server at %date% %time% >> server-log.txt
node server.js >> server-log.txt 2>&1
