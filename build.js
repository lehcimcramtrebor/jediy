const fs = require('fs');
const path = require('path');

const filesToCopy = [
    'index.html',
    'app.js',
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
    'Audit_Liquide.md',
    'test_runner.html',
    'tests.js'
];

const dirsToCopy = [
    'assets'
];

const destDir = path.join(__dirname, 'www');

// Clean and create destDir
if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir);

// Copy files
filesToCopy.forEach(file => {
    const src = path.join(__dirname, file);
    const dest = path.join(destDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`Copied ${file}`);
    } else {
        console.warn(`Warning: file ${file} not found!`);
    }
});

// Helper function to copy folder recursively
function copyFolderRecursiveSync(source, target) {
    let files = [];
    const targetFolder = path.join(target, path.basename(source));
    if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
    }

    if (fs.lstatSync(source).isDirectory()) {
        files = fs.readdirSync(source);
        files.forEach(function (file) {
            const curSource = path.join(source, file);
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursiveSync(curSource, targetFolder);
            } else {
                fs.copyFileSync(curSource, path.join(targetFolder, file));
            }
        });
    }
}

// Copy directories
dirsToCopy.forEach(dir => {
    const src = path.join(__dirname, dir);
    if (fs.existsSync(src)) {
        copyFolderRecursiveSync(src, destDir);
        console.log(`Copied directory ${dir}`);
    } else {
        console.warn(`Warning: directory ${dir} not found!`);
    }
});

console.log('Build completed successfully.');
