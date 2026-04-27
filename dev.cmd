@echo off
cd /d "%~dp0"
if not exist "package.json" (
  if exist "Brandmultiplier-gtm-main\package.json" (
    cd "Brandmultiplier-gtm-main"
  ) else (
    echo No package.json in this folder or in Brandmultiplier-gtm-main.
    echo Open this project in File Explorer and confirm files are present.
    exit /b 1
  )
)
npm run dev
