# Extension Icons

This directory should contain the following icon files:

- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

## Quick Solution: Generate Icons

### Option 1: Using the HTML Generator (Easiest)

1. Open `create-icons-simple.html` in your browser
2. Click "Generate Icons"
3. Right-click each icon and "Save image as..."
4. Save them to this `icons/` folder with the correct names

### Option 2: Using Node.js Script

```bash
# From the extension directory
npm install
npm run generate-icons
```

This will automatically generate all three icon sizes with a gradient design.

### Option 3: Manual Creation

You can create icons using any image editor or online tool:

1. **Online Tools:**
   - https://www.favicon-generator.org/
   - https://favicon.io/
   - Create a simple colored square with "CT" text

2. **Using Image Editor:**
   - Create a 16x16, 48x48, and 128x128 pixel image
   - Use a solid color background (e.g., #667eea purple)
   - Add "CT" text or a simple icon
   - Save as PNG

## Recommended Design

- Use the purple gradient theme (#667eea to #764ba2)
- Simple "CT" monogram
- Clean, modern design
- Rounded corners (20% border radius)

