const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function main() {
    const electronDir = __dirname;
    const projectDir = path.dirname(electronDir);
    const zipPath = "C:\\Users\\miche\\AppData\\Local\\electron\\Cache\\electron-v31.7.7-win32-x64.zip";
    const distDir = path.join(electronDir, 'dist');
    const appOutDir = path.join(distDir, 'Je-DIY-win32-x64-' + Date.now());
    const resourcesAppDir = path.join(appOutDir, 'resources', 'app');

    console.log("=== DEBUT DU PACKAGING PERSONNALISE DE JDIY ===");
    
    // 1. Clean old output directory
    if (fs.existsSync(appOutDir)) {
        console.log("Nettoyage de l'ancien dossier d'exportation...");
        try {
            fs.rmSync(appOutDir, { recursive: true, force: true });
        } catch (rmErr) {
            console.warn("Avertissement: Impossible de supprimer complètement l'ancien dossier d'exportation (fichiers potentiellement verrouillés). Le build va tenter de continuer :", rmErr.message);
        }
    }
    fs.mkdirSync(distDir, { recursive: true });

    // 2. Extract Electron template using PowerShell native Expand-Archive
    console.log("Extraction du template Electron en cours (via PowerShell)...");
    const psCommand = `Expand-Archive -Path '${zipPath}' -DestinationPath '${appOutDir}' -Force`;
    execSync(`powershell -Command "${psCommand}"`, { stdio: 'inherit' });
    console.log("Template Electron extrait avec succès !");

    // 3. Create resources/app folder
    fs.mkdirSync(resourcesAppDir, { recursive: true });

    // 4. Copy application files to resources/app
    console.log("Copie des fichiers de l'application JDIY...");
    
    const filesToCopy = [
        'index.html',
        'app.js',
        'test_runner.html',
        'tests.js',
        'manifest.json',
        'robots.txt',
        'sitemap.xml',
        'sw.js',
        'icon.svg',
        'jediy.png',
        'yoda.png',
        'flyer.png',
        'tailwind.config.js',
        'google8ff5eebdaef4d9d9.html',
        'Audit_Electric.md',
        'Audit_Liquide.md'
    ];

    for (const file of filesToCopy) {
        const srcPath = path.join(projectDir, 'src', file);
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, path.join(resourcesAppDir, file));
        } else {
            console.warn(`Attention : fichier source introuvable : ${srcPath}`);
        }
    }

    // Copy Electron main.js and icon-512.png to resources/app
    fs.copyFileSync(path.join(electronDir, 'main.js'), path.join(resourcesAppDir, 'main.js'));
    if (fs.existsSync(path.join(electronDir, 'icon-512.png'))) {
        fs.copyFileSync(path.join(electronDir, 'icon-512.png'), path.join(resourcesAppDir, 'icon-512.png'));
    }

    // Copy assets recursively
    const srcAssets = path.join(projectDir, 'src', 'assets');
    const destAssets = path.join(resourcesAppDir, 'assets');
    
    function copyDirSync(src, dest) {
        fs.mkdirSync(dest, { recursive: true });
        let entries = fs.readdirSync(src, { withFileTypes: true });
        for (let entry of entries) {
            let srcPath = path.join(src, entry.name);
            let destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                copyDirSync(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
    if (fs.existsSync(srcAssets)) {
        copyDirSync(srcAssets, destAssets);
    }

    // Create a minimized package.json for the app inside electron package
    const appPackageJson = {
        name: "jediy",
        version: "1.18.0",
        main: "main.js"
    };
    fs.writeFileSync(
        path.join(resourcesAppDir, 'package.json'),
        JSON.stringify(appPackageJson, null, 2)
    );

    // 5. Rename electron.exe to app name
    console.log("Configuration de l'exécutable...");
    const oldExe = path.join(appOutDir, 'electron.exe');
    const newExe = path.join(appOutDir, 'Je-DIY.exe');
    if (fs.existsSync(oldExe)) {
        fs.renameSync(oldExe, newExe);
    }

    // 6. Set the executable icon using rcedit
    try {
        const rceditPath = path.join(electronDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
        const iconPath = path.join(electronDir, 'icon.ico');
        
        if (fs.existsSync(rceditPath) && fs.existsSync(iconPath)) {
            console.log("Modification de l'icône de l'exécutable...");
            execSync(`"${rceditPath}" "${newExe}" --set-icon "${iconPath}"`, { stdio: 'ignore' });
            console.log("Icône de l'exécutable configurée avec succès !");
        } else {
            console.log("Note: rcedit ou icon.ico introuvable, l'icône de l'exécutable sera l'icône par défaut.");
        }
    } catch (iconErr) {
        console.warn("Avertissement: Impossible de modifier l'icône de l'exécutable :", iconErr.message);
    }

    console.log("=== PACKAGING TERMINE ET REUSSI ===");
    console.log(`Dossier de sortie : ${appOutDir}`);
    console.log(`Fichier exécutable : ${newExe}`);

    // 7. Compile the portable single-file executable at project root
    const cscPath = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
    if (fs.existsSync(cscPath)) {
        console.log("\n=== COMPILATION DE LA VERSION AUTONOME ET PORTABLE ===");
        try {
            const zipDest = path.join(distDir, 'app_temp.zip');
            const portableExe = path.join(projectDir, 'Je-DIY_portable.exe');
            const iconPath = path.join(electronDir, 'icon.ico');
            const launcherCs = path.join(electronDir, 'launcher.cs');
            
            // Compression
            console.log("Compression des fichiers en cours...");
            if (fs.existsSync(zipDest)) {
                fs.unlinkSync(zipDest);
            }
            execSync(`powershell -Command "Compress-Archive -Path '${appOutDir}/*' -DestinationPath '${zipDest}' -Force"`, { stdio: 'inherit' });
            
            // Compilation
            console.log("Compilation du launcher portable (EXE unique)...");
            execSync(`"${cscPath}" /target:winexe /win32icon:"${iconPath}" /out:"${portableExe}" /resource:"${zipDest}",app.zip /r:System.Windows.Forms.dll,System.dll,System.IO.Compression.FileSystem.dll "${launcherCs}"`, { stdio: 'inherit' });
            
            // Clean temp zip & build dir
            console.log("Nettoyage des fichiers temporaires...");
            if (fs.existsSync(zipDest)) {
                fs.unlinkSync(zipDest);
            }
            try {
                if (fs.existsSync(appOutDir)) {
                    fs.rmSync(appOutDir, { recursive: true, force: true });
                }
            } catch (err) {
                console.warn("Avertissement: Impossible de supprimer le dossier de build temporaire :", err.message);
            }
            
            console.log("=== VERSION PORTABLE CREEE AVEC SUCCES ===");
            console.log(`Fichier portable disponible ici : ${portableExe}`);
        } catch (portableErr) {
            console.error("Erreur lors de la création de la version portable :", portableErr);
        }
    } else {
        console.log("\nNote: Le compilateur csc.exe est introuvable. La version portable (EXE unique) n'a pas été générée.");
    }
}

main().catch(err => {
    console.error("Erreur lors du packaging de l'application :", err);
});
