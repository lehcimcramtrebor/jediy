@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

set "EXE_NAME=Je-DIY_portable.exe"
set "ARCHIVE_NAME=Je-DIY_portable.7z"

echo =======================================================
echo     ARCHIVAGE ET DECOUPAGE DE L'EXECUTABLE PORTABLE    
echo =======================================================
echo.

:: 1. Verification de la presence de l'executable
if not exist "%EXE_NAME%" (
    echo [ERREUR] L'executable portable "%EXE_NAME%" est introuvable.
    echo Veuillez d'abord compiler l'application desktop.
    echo.
    pause
    exit /b 1
)

:: 2. Recherche de 7-Zip (PATH ou chemin standard)
set "SEVENZIP=7z"
where 7z >nul 2>nul
if errorlevel 1 (
    if exist "C:\Program Files\7-Zip\7z.exe" (
        set "SEVENZIP=C:\Program Files\7-Zip\7z.exe"
    ) else (
        echo [ERREUR] 7-Zip [7z.exe] est introuvable sur votre systeme.
        echo Veuillez installer 7-Zip ou l'ajouter a votre variable d'environnement PATH.
        echo.
        pause
        exit /b 1
    )
)

:: 3. Nettoyage des anciennes archives decoupees
echo Nettoyage des anciennes archives segmentees...
del /q "%ARCHIVE_NAME%.*" 2>nul
echo OK.
echo.

:: 4. Creation des nouvelles archives segmentees (volumes de 10 Mo)
echo Creation de la nouvelle archive segmentee (volumes de 10 Mo)...
"%SEVENZIP%" a -v10m -y "%ARCHIVE_NAME%" "%EXE_NAME%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =======================================================
    echo           ARCHIVAGE TERMINE AVEC SUCCES
    echo =======================================================
    echo Les segments de 10 Mo ont ete crees avec succes.
    echo Vous pouvez maintenant commit et push les segments sur GitHub.
    echo.
) else (
    echo.
    echo [ERREUR] Une erreur est survenue lors du decoupage avec 7-Zip.
    echo.
)

pause
