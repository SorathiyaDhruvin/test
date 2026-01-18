const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, 'assets');
const OPTIMIZED_DIR = path.join(__dirname, 'assets', 'optimized');

// Ensure optimized directory exists
if (!fs.existsSync(OPTIMIZED_DIR)) {
    fs.mkdirSync(OPTIMIZED_DIR, { recursive: true });
}

async function optimizeImages() {
    console.log(`Scanning ${ASSETS_DIR} for images...`);
    
    const files = fs.readdirSync(ASSETS_DIR);
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));

    console.log(`Found ${imageFiles.length} images.`);

    for (const file of imageFiles) {
        const inputPath = path.join(ASSETS_DIR, file);
        const outputPath = path.join(OPTIMIZED_DIR, file);
        
        // Skip if already exists to avoid re-processing (optional, but good for retries)
        // if (fs.existsSync(outputPath)) continue;

        try {
            console.log(`Processing: ${file}`);
            
            await sharp(inputPath)
                .resize({ width: 4096, withoutEnlargement: true }) // 4K max width is usually good for 360
                .jpeg({ quality: 80, mozjpeg: true })
                .toFile(outputPath);

            const originalStats = fs.statSync(inputPath);
            const newStats = fs.statSync(outputPath);
            const reduction = ((originalStats.size - newStats.size) / originalStats.size * 100).toFixed(2);

            console.log(`✅ Saved to assets/optimized/${file}`);
            console.log(`   Size: ${(originalStats.size / 1024 / 1024).toFixed(2)}MB -> ${(newStats.size / 1024 / 1024).toFixed(2)}MB (-${reduction}%)`);
            
        } catch (err) {
            console.error(`❌ Error processing ${file}:`, err);
        }
    }
    
    console.log('\nDone! Optimized images are in "assets/optimized/".');
    console.log('To use them, you can backup your originals and move these files to "assets/".');
}

optimizeImages();
