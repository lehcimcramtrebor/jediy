const fs = require('fs');
const path = require('path');
const sharp = require('../node_modules/sharp');

async function main() {
    const svgPath = path.join(__dirname, '..', 'icon.svg');
    const pngPath = path.join(__dirname, 'icon-512.png');
    const icoPath = path.join(__dirname, 'icon.ico');

    console.log("Rendering SVG to 512x512 PNG using sharp...");
    await sharp(svgPath)
        .resize(512, 512)
        .png()
        .toFile(pngPath);

    console.log("Resizing icon to 256x256...");
    const pngBuffer = await sharp(pngPath)
        .resize(256, 256)
        .png()
        .toBuffer();

    console.log("Writing ICO file...");
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // Reserved
    header.writeUInt16LE(1, 2); // Type (1 for icon)
    header.writeUInt16LE(1, 4); // Number of images

    const entry = Buffer.alloc(16);
    entry.writeUInt8(0, 0); // Width (256 -> 0)
    entry.writeUInt8(0, 1); // Height (256 -> 0)
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(pngBuffer.length, 8); // Image size
    entry.writeUInt32LE(22, 12); // Offset (6 + 16 = 22)

    const icoBuffer = Buffer.concat([header, entry, pngBuffer]);
    fs.writeFileSync(icoPath, icoBuffer);
    console.log("ICO file created successfully at:", icoPath);
}

main().catch(console.error);
