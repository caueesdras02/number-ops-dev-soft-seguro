@echo off
rem Inicia o Number Ops no Windows (duplo clique). Repassa argumentos: iniciar.bat --seed-demo
cd /d "%~dp0"
set "PYEXE="
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PYEXE (
  where py >nul 2>nul && set "PYEXE=py -3"
)
if not defined PYEXE (
  echo Python 3.10+ nao encontrado. Instale em https://www.python.org/downloads/ ou: winget install Python.Python.3.12
  pause
  exit /b 1
)
%PYEXE% server.py --open %*
pause
