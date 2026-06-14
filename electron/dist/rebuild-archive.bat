@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

set "EXE_NAME=Je-DIY_portable.exe"
set "ARCHIVE_NAME=Je-DIY_portable.7z"

echo =======================================================
echo    RECONSTRUCTION DE L'EXECUTABLE PORTABLE JE-DIY      
echo =======================================================
echo.

:: 1. Verification de la presence du premier segment
if not exist "%ARCHIVE_NAME%.001" (
    echo [ERREUR] Le premier segment de l'archive "%ARCHIVE_NAME%.001" est introuvable.
    echo Impossible de reconstituer l'executable.
    echo.
    pause
    exit /b 1
)

:: 2. Recherche de 7-Zip
set "SEVENZIP=7z"
where 7z >nul 2>nul
if errorlevel 1 (
    if exist "C:\Program Files\7-Zip\7z.exe" (
        set "SEVENZIP=C:\Program Files\7-Zip\7z.exe"
    ) else (
        echo [ERREUR] 7-Zip est introuvable. Veuillez installer 7-Zip ou l'ajouter au PATH.
        echo.
        pause
        exit /b 1
    )
)

:: 3. Extraction de l'executable depuis les segments
echo Reconstitution et extraction de l'executable portable...
"%SEVENZIP%" x -y "%ARCHIVE_NAME%.001"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =======================================================
    echo         RECONSTRUCTION TERMINEE AVEC SUCCES
    echo =======================================================
    echo L'executable "%EXE_NAME%" a ete reconstitue avec succes.
    echo.
) else (
    echo.
    echo [ERREUR] Une erreur est survenue lors de l'extraction.
    echo.
)

pause
