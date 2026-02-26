# ClickTut Extension

## Setup Instructions

1. **Load the Extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension` folder from this project

2. **Create Icons:**
   - The extension needs icon files in the `icons/` folder:
     - `icon16.png` (16x16 pixels)
     - `icon48.png` (48x48 pixels)
     - `icon128.png` (128x128 pixels)
   - You can create simple placeholder icons or use any 16x16, 48x48, and 128x128 PNG images

3. **Start Backend Server:**
   - Make sure the backend server is running (see backend/README.md)
   - Default API URL: `http://localhost:3000`

4. **Use the Extension:**
   - Click the extension icon in Chrome toolbar
   - Enter a tutorial title (optional)
   - Click "Start Recording"
   - Navigate and click through your application
   - Click "Stop Recording" when done

## Troubleshooting

- **Extension not loading:** Check manifest.json syntax and ensure all files exist
- **Clicks not recording:** Make sure backend server is running and accessible
- **Screenshots not working:** Check browser permissions for tabs API
- **CORS errors:** Ensure backend CORS is configured correctly

## File Structure

```
extension/
├── manifest.json          # Extension configuration
├── background/
│   └── service-worker.js  # Background script
├── content/
│   └── click-tracker.js   # Content script (runs on pages)
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic
└── icons/                 # Extension icons (create these)
```

