@echo off
set "HTML_PATH=%~dp0index.html"
echo Launching CSMP III Studio...

:: Try to launch with Microsoft Edge in App Mode (Built into Windows 10/11)
start msedge.exe --app="%HTML_PATH%" 2>nul
if %errorlevel% equ 0 exit

:: Fallback to Google Chrome in App Mode
start chrome.exe --app="%HTML_PATH%" 2>nul
if %errorlevel% equ 0 exit

:: Final Fallback: Just open it normally if neither are found
start "" "%HTML_PATH%"
exit
