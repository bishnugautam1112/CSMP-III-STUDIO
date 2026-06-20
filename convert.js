const Jimp = require('jimp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');
const fs = require('fs');

async function fixIcon() {
    try {
        console.log("Reading the JPEG that was disguised as PNG...");
        const img = await Jimp.read('build/icon.png');
        console.log("Saving it as a true PNG file...");
        img.resize(256, 256);
        await img.writeAsync('build/icon-true.png');
        
        console.log("Converting to true ICO format...");
        const buf = await pngToIco('build/icon-true.png');
        fs.writeFileSync('build/icon.ico', buf);
        
        // Overwrite the assets/icon.png with the true PNG so BrowserWindow doesn't break
        fs.copyFileSync('build/icon-true.png', 'assets/icon.png');
        
        console.log("Done! icon.ico and assets/icon.png are ready.");
    } catch (err) {
        console.error("Conversion failed:", err);
    }
}

fixIcon();
