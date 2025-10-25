@echo off
setlocal enabledelayedexpansion

REM ArtTic-LAB Launcher for Windows
title ArtTic-LAB

ECHO [INFO] Preparing to launch ArtTic-LAB...

REM =======================================================
REM 1. FIND CONDA INSTALLATION
REM    Searches for Conda in PATH first, then in common default locations.
REM =======================================================
SET "CONDA_BASE_PATH="
where conda.exe >nul 2>nul && (FOR /F "delims=" %%i IN ('where conda.exe') DO SET "CONDA_EXE_PATH=%%i" & GOTO FoundConda)

REM --- Check User Paths ---
IF EXIST "%USERPROFILE%\miniconda3\condabin\conda.bat" SET "CONDA_BASE_PATH=%USERPROFILE%\miniconda3" & GOTO FoundConda
IF EXIST "%USERPROFILE%\anaconda3\condabin\conda.bat" SET "CONDA_BASE_PATH=%USERPROFILE%\anaconda3" & GOTO FoundConda
REM -- Added Miniforge User Path --
IF EXIST "%USERPROFILE%\AppData\Local\miniforge3\condabin\conda.bat" SET "CONDA_BASE_PATH=%USERPROFILE%\AppData\Local\miniforge3" & GOTO FoundConda

REM --- Check System Paths ---
IF EXIST "%ProgramData%\Miniconda3\condabin\conda.bat" SET "CONDA_BASE_PATH=%ProgramData%\Miniconda3" & GOTO FoundConda
IF EXIST "%ProgramData%\Anaconda3\condabin\conda.bat" SET "CONDA_BASE_PATH=%ProgramData%\Anaconda3" & GOTO FoundConda
REM -- Added Miniforge System Path --
IF EXIST "%ProgramData%\Miniforge3\condabin\conda.bat" SET "CONDA_BASE_PATH=%ProgramData%\Miniforge3" & GOTO FoundConda

GOTO NoConda

:FoundConda
IF NOT DEFINED CONDA_BASE_PATH ( FOR %%i IN ("%CONDA_EXE_PATH%") DO SET "CONDA_SCRIPTS_DIR=%%~dpi" & FOR %%j IN ("!CONDA_SCRIPTS_DIR!..") DO SET "CONDA_BASE_PATH=%%~fj" )
ECHO [INFO] Conda found at: %CONDA_BASE_PATH%

REM =======================================================
REM 2. INITIALIZE CONDA & VERIFY ENVIRONMENT
REM =======================================================
call "%CONDA_BASE_PATH%\Scripts\activate.bat"
IF %ERRORLEVEL% NEQ 0 GOTO InitFail

ECHO [INFO] Checking for 'ArtTic-LAB' environment...
conda env list | findstr /I /B "ArtTic-LAB " >nul
IF %ERRORLEVEL% NEQ 0 GOTO EnvNotFound

ECHO [INFO] Activating environment...
call conda activate ArtTic-LAB
IF %ERRORLEVEL% NEQ 0 GOTO ActivateFail

ECHO [SUCCESS] Environment activated. Launching application...
ECHO.
ECHO =======================================================
ECHO             Launching ArtTic-LAB
ECHO =======================================================
ECHO.

REM =======================================================
REM 3. LAUNCH THE APPLICATION
REM =======================================================
python app.py %*

ECHO.
ECHO =======================================================
ECHO ArtTic-LAB has closed.
ECHO =======================================================
GOTO End

:NoConda
ECHO.
ECHO [ERROR] Conda installation not found.
ECHO Please ensure Miniconda, Anaconda, or Miniforge is installed and run install.bat.
GOTO End

:InitFail
ECHO.
ECHO [ERROR] Failed to initialize the Conda command environment.
ECHO Your Conda installation might be corrupted.
GOTO End

:EnvNotFound
ECHO.
ECHO [ERROR] The 'ArtTic-LAB' environment was not found.
ECHO Please run the 'install.bat' script first to set it up.
GOTO End

:ActivateFail
ECHO.
ECHO [ERROR] Failed to activate the 'ArtTic-LAB' environment.
ECHO The environment may be corrupted. Please try running 'install.bat' again.
GOTO End

:End
echo.
echo Press any key to exit this window.
pause >nul
endlocal