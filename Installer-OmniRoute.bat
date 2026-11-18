@echo off
title Installation OmniRoute
echo === Installation de OmniRoute ===
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [1/3] Installation de Node.js LTS...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
) else (
  echo [1/3] Node.js deja installe.
)
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"

echo.
echo [2/3] Installation de OmniRoute...
call npm install -g omniroute
if %errorlevel% neq 0 (
  echo Echec avec "omniroute", essai avec "@diegosouzapw/omniroute"...
  call npm install -g @diegosouzapw/omniroute
)

echo.
echo [3/3] Creation du raccourci sur le Bureau...
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESK=%%D"
(
  echo @echo off
  echo title OmniRoute
  echo start "" http://localhost:20128
  echo call "%APPDATA%\npm\omniroute.cmd"
) > "%DESK%\Lancer OmniRoute.bat"

echo.
echo === Termine ! Lancement de OmniRoute... ===
start "" http://localhost:20128
call "%APPDATA%\npm\omniroute.cmd"
pause
