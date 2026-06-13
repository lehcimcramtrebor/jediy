const { app, BrowserWindow, Menu, protocol, net } = require('electron');
const path = require('path');
const url = require('url');

let mainWindow = null;

// Register the custom app scheme as privileged
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: {
            standard: true,
            secure: true,
            bypassCSP: true,
            supportFetchAPI: true
        }
    }
]);

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'icon-512.png'),
        title: "Je-DIY - Calculateur Expert",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Disable default menu bar to make the application look premium & clean
    Menu.setApplicationMenu(null);

    // Load local HTML file via custom app protocol
    mainWindow.loadURL('app://jediy/index.html');

    // Toggle Developer Tools with F12 key
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' && input.type === 'keyDown') {
            mainWindow.webContents.toggleDevTools();
        }
    });

    // Intercept window close event to show confirmation dialog
    let isQuitting = false;
    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            const { dialog } = require('electron');
            const choice = dialog.showMessageBoxSync(mainWindow, {
                type: 'question',
                buttons: ['Oui, quitter', 'Annuler'],
                defaultId: 0,
                cancelId: 1,
                title: 'Confirmation de fermeture',
                message: 'Voulez-vous vraiment quitter Je-DIY ? Tout changement non sauvegardé sous forme de fichier JSON sera conservé dans le stockage local de l\'application.'
            });
            if (choice === 0) {
                isQuitting = true;
                mainWindow.close();
            }
        }
    });

    // Intercept navigation to external links and open them in the system's default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url === 'about:blank' || url === '' || url.startsWith('blob:') || url.startsWith('app:')) {
            return { action: 'allow' };
        }
        try {
            require('electron').shell.openExternal(url);
        } catch (err) {
            console.error("Failed to open external link:", err);
        }
        return { action: 'deny' };
    });

    // Also intercept standard navigations within the window to prevent breaking the application state
    mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
        if (!navigationUrl.startsWith('app://')) {
            event.preventDefault();
            try {
                require('electron').shell.openExternal(navigationUrl);
            } catch (err) {
                console.error("Failed to open external link via will-navigate:", err);
            }
        }
    });
}

// Request single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        // Register the protocol handler to serve local assets securely
        protocol.handle('app', (request) => {
            try {
                const urlObj = new URL(request.url);
                const relativePath = decodeURIComponent(urlObj.pathname).substring(1) || 'index.html';
                const filePath = path.join(__dirname, relativePath);
                return net.fetch(url.pathToFileURL(filePath).toString());
            } catch (err) {
                console.error("Protocol app handler error:", err);
                return new Response("Internal Server Error", { status: 500 });
            }
        });

        createWindow();

        app.on('activate', function() {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

app.on('window-all-closed', function() {
    if (process.platform !== 'darwin') app.quit();
});
