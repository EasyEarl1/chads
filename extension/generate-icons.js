// Script to generate placeholder icons for Chrome extension
// Run with: node generate-icons.js
// Requires: sharp (npm install sharp)

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const iconSizes = [16, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

// Gradient colors matching the extension theme
const gradientColors = {
  start: { r: 102, g: 126, b: 234 }, // #667eea
  end: { r: 118, g: 75, b: 162 }     // #764ba2
};

async function createGradientImage(size) {
  // Create SVG with gradient
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:rgb(${gradientColors.start.r},${gradientColors.start.g},${gradientColors.start.b});stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgb(${gradientColors.end.r},${gradientColors.end.g},${gradientColors.end.b});stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#grad)" rx="${size * 0.2}"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.4}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">CT</text>
    </svg>
  `;

  // Convert SVG to PNG
  return await sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}

async function generateIcons() {
  try {
    // Ensure icons directory exists
    await fs.mkdir(iconsDir, { recursive: true });

    console.log('🎨 Generating Chrome extension icons...\n');

    for (const size of iconSizes) {
      const filename = `icon${size}.png`;
      const filepath = path.join(iconsDir, filename);

      const imageBuffer = await createGradientImage(size);
      await fs.writeFile(filepath, imageBuffer);

      console.log(`✅ Created ${filename} (${size}x${size})`);
    }

    console.log('\n✨ All icons generated successfully!');
    console.log(`📁 Icons saved to: ${iconsDir}`);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.error('❌ Error: sharp module not found');
      console.log('\n💡 Install sharp first:');
      console.log('   cd extension');
      console.log('   npm install sharp');
      console.log('\nOr run from project root:');
      console.log('   npm install sharp --prefix extension');
    } else {
      console.error('❌ Error generating icons:', error.message);
    }
    process.exit(1);
  }
}

generateIcons();

