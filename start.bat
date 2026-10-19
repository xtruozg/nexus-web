@echo off
REM Chay server tinh de fetch() doc duoc data/*.json
cd /d "%~dp0"
echo Nexus Exchange: http://localhost:5500
start "" http://localhost:5500
where python >nul 2>nul && (python -m http.server 5500) || (npx --yes serve -l 5500 .)
