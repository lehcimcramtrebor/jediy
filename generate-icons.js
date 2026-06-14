const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const svgPath = path.join(__dirname, 'src', 'icon.svg');

if (!fs.existsSync(resDir)) {
    console.error('Android resource directory not found. Make sure to run "npx cap add android" first.');
    process.exit(1);
}

const densities = [
    { name: 'mipmap-mdpi', size: 48, adaptiveSize: 108 },
    { name: 'mipmap-hdpi', size: 72, adaptiveSize: 162 },
    { name: 'mipmap-xhdpi', size: 96, adaptiveSize: 216 },
    { name: 'mipmap-xxhdpi', size: 144, adaptiveSize: 324 },
    { name: 'mipmap-xxxhdpi', size: 192, adaptiveSize: 432 }
];

async function generate() {
    console.log('Generating Android launcher icons from icon.svg...');

    for (const density of densities) {
        const dir = path.join(resDir, density.name);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // 1. Generate standard ic_launcher.png (Legacy square)
        const launcherPath = path.join(dir, 'ic_launcher.png');
        await sharp(svgPath)
            .resize(density.size, density.size)
            .toFile(launcherPath);
        console.log(`Generated: ${launcherPath} (${density.size}x${density.size})`);

        // 2. Generate standard ic_launcher_round.png (Legacy round)
        const launcherRoundPath = path.join(dir, 'ic_launcher_round.png');
        await sharp(svgPath)
            .resize(density.size, density.size)
            .toFile(launcherRoundPath);
        console.log(`Generated: ${launcherRoundPath} (${density.size}x${density.size})`);

        // 3. Generate adaptive ic_launcher_foreground.png
        // Scale the SVG logo down to ~60% of the adaptive size and place it centered on a transparent canvas.
        const adaptiveForegroundPath = path.join(dir, 'ic_launcher_foreground.png');
        const foregroundSize = Math.round(density.adaptiveSize * 0.60); // 60% size for safe margin
        
        const scaledSvgBuffer = await sharp(svgPath)
            .resize(foregroundSize, foregroundSize)
            .toBuffer();

        // Create transparent background of size adaptiveSize x adaptiveSize
        // Composite the scaled SVG in the center
        await sharp({
            create: {
                width: density.adaptiveSize,
                height: density.adaptiveSize,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        })
        .composite([{
            input: scaledSvgBuffer,
            gravity: 'center'
        }])
        .png()
        .toFile(adaptiveForegroundPath);

        console.log(`Generated Adaptive Foreground: ${adaptiveForegroundPath} (${density.adaptiveSize}x${density.adaptiveSize})`);
    }

    // 4. Update ic_launcher_background.xml to set background to dark stone #1c1917
    const colorsXmlPath = path.join(resDir, 'values', 'ic_launcher_background.xml');
    if (fs.existsSync(colorsXmlPath)) {
        let colorsXml = fs.readFileSync(colorsXmlPath, 'utf8');
        // Replace ic_launcher_background color
        if (colorsXml.includes('<color name="ic_launcher_background">')) {
            colorsXml = colorsXml.replace(
                /<color name="ic_launcher_background">.*?<\/color>/,
                '<color name="ic_launcher_background">#1c1917</color>'
            );
            fs.writeFileSync(colorsXmlPath, colorsXml, 'utf8');
            console.log('Updated ic_launcher_background.xml for adaptive background: #1c1917');
        } else {
            console.warn('Warning: ic_launcher_background not found in ic_launcher_background.xml');
        }
    } else {
        console.warn('Warning: ic_launcher_background.xml not found!');
    }

    console.log('Icon generation completed successfully!');
}

generate().catch(err => {
    console.error('Error generating icons:', err);
    process.exit(1);
});
