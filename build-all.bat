@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo =======================================================
echo          COMPILATION COMPLETE DE JE-DIY                
echo =======================================================
echo.

:: 1. Generation des dossiers Web / Android
echo [1/2] Mise a jour des dossiers de production (www et docs)...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERREUR] Le build web/android a echoue.
    echo.
    pause
    exit /b 1
)
echo.

:: 2. Generation de l'application Desktop Windows
echo [2/2] Compilation de l'executable portable Windows...
cd electron
call npm run package
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERREUR] La compilation d'Electron a echoue.
    echo.
    cd ..
    pause
    exit /b 1
)

echo.
echo =======================================================
echo         TOUTES LES COMPILATIONS ONT REUSSI
echo =======================================================
echo Les dossiers /www et /docs ont ete mis a jour.
echo L'executable portable a ete cree dans electron/dist/.
echo.

:: 3. Question pour le split-archive de l'executable Windows
set /p choice="Voulez-vous decouper l'executable en segments de 10 Mo pour GitHub ? [O/N] : "
if /i "!choice!"=="O" (
    echo.
    cd dist
    call split-archive.bat
    cd ..
)
echo.

cd ..

:: 4. Question pour Android Studio (apres le split et a la racine du projet)
set /p openAndroid="Voulez-vous ouvrir Android Studio pour compiler l'APK Android ? [O/N] : "
if /i "!openAndroid!"=="O" (
    echo.
    echo Synchronisation de Capacitor et ouverture d'Android Studio...
    call npx cap sync
    call npx cap open android
)

echo.
echo Operation terminee.
pause
