# Getting Started with ClickTut

## Quick Start Guide

### Step 1: Install Backend Dependencies

```bash
cd backend
npm install
```

### Step 2: Create Environment File

Create `backend/.env` file:

```env
PORT=3000
NODE_ENV=development
SCREENSHOTS_PATH=./screenshots
VIDEOS_PATH=./videos
AUDIO_PATH=./audio
STORAGE_PATH=./uploads
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:5173
```

(API keys are optional for basic click tracking - add them later for AI/audio features)

### Step 3: Start Backend Server

```bash
cd backend
npm run dev
```

You should see:
```
🚀 ClickTut API Server running on http://localhost:3000
```

### Step 4: Load Chrome Extension

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Navigate to and select the `extension` folder

**Note:** You'll need to create icon files:
- `extension/icons/icon16.png` (16x16)
- `extension/icons/icon48.png` (48x48)
- `extension/icons/icon128.png` (128x128)

You can use any PNG images or create simple colored squares as placeholders.

### Step 5: Test the Extension

1. Click the ClickTut extension icon in Chrome
2. Enter a tutorial title (e.g., "Test Tutorial")
3. Click "Start Recording"
4. Navigate to any website and click around
5. Click "Stop Recording" in the extension popup

### Step 6: Verify Data

Check that clicks were recorded:

```bash
# In a new terminal
curl http://localhost:3000/api/tutorials
```

Or visit `http://localhost:3000/api/tutorials` in your browser.

## Troubleshooting

### Extension shows error when starting recording
- Make sure backend server is running on port 3000
- Check browser console for errors (F12)
- Verify CORS is configured in backend

### Clicks not being recorded
- Check that content script is loaded (Chrome DevTools → Sources → Content scripts)
- Verify backend is receiving requests (check server logs)
- Make sure you clicked "Start Recording" first

### Screenshots not working
- Check browser permissions
- Verify `chrome.tabs.captureVisibleTab` permission in manifest
- Check backend `screenshots/` directory is being created

## Next Steps

Once basic click tracking works:

1. **Add Database** - Replace in-memory storage with MongoDB/PostgreSQL
2. **AI Integration** - Add script generation (Phase 3)
3. **Audio Generation** - Add ElevenLabs integration (Phase 4)
4. **Video Generation** - Add FFmpeg video creation (Phase 5)
5. **Dashboard** - Build web UI for managing tutorials (Phase 6)

## File Structure Created

```
CLICKTUT/
├── extension/
│   ├── manifest.json ✅
│   ├── background/service-worker.js ✅
│   ├── content/click-tracker.js ✅
│   ├── popup/ (HTML, CSS, JS) ✅
│   └── icons/ (create these)
│
├── backend/
│   ├── server.js ✅
│   ├── routes/tutorials.js ✅
│   ├── models/tutorial.js ✅
│   └── package.json ✅
│
└── [documentation files] ✅
```

## Testing Checklist

- [ ] Backend server starts without errors
- [ ] Extension loads in Chrome
- [ ] Can start recording from popup
- [ ] Clicks are captured on web pages
- [ ] Screenshots are taken
- [ ] Data is sent to backend
- [ ] Can stop recording
- [ ] Tutorial data is stored
- [ ] Can retrieve tutorial via API

