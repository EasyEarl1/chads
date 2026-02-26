# What to Do After Recording

## ✅ You've Recorded Your Tutorial!

Great! Your clicks have been captured. Here's what you can do now:

## 1. View Your Recorded Tutorial

### Option A: Use the Tutorial Viewer (Easiest)

1. **Get your Tutorial ID:**
   - When you stopped recording, the extension should have shown you a Tutorial ID
   - Or check the backend console logs for the ID

2. **Open the viewer:**
   - Open `view-tutorial.html` in your browser
   - Or visit: `http://localhost:3000/view-tutorial.html`
   - Enter your Tutorial ID and click "Load Tutorial"
   - Or click "List All" to see all your tutorials

### Option B: Use the API Directly

```bash
# List all tutorials
curl http://localhost:3000/api/tutorials

# View a specific tutorial (replace TUTORIAL_ID)
curl http://localhost:3000/api/tutorials/TUTORIAL_ID
```

### Option C: Check Backend Logs

Look at your backend server console - it shows:
- Tutorial ID when recording starts
- Each click as it's recorded
- Summary when recording stops

## 2. What You'll See

The tutorial viewer shows:
- ✅ All steps with click details
- ✅ Element information (what was clicked)
- ✅ Page context (URL, title)
- ✅ Click coordinates
- ✅ Screenshots (if captured)

## 3. Next Steps (Coming Soon)

Currently implemented:
- ✅ Click tracking
- ✅ Data storage
- ✅ Tutorial viewing

**Next to build:**
- ⏳ AI script generation (Phase 3)
- ⏳ Audio generation with ElevenLabs (Phase 4)
- ⏳ Video generation with FFmpeg (Phase 5)
- ⏳ Web dashboard (Phase 6)

## Quick Commands

```bash
# View all tutorials
curl http://localhost:3000/api/tutorials | json_pp

# View specific tutorial (replace ID)
curl http://localhost:3000/api/tutorials/tut_1234567890_1 | json_pp

# Delete a tutorial (replace ID)
curl -X DELETE http://localhost:3000/api/tutorials/tut_1234567890_1
```

## Finding Your Tutorial ID

1. **From Extension Popup:**
   - After stopping, the Tutorial ID is shown
   - It looks like: `tut_1234567890_1`

2. **From Backend Console:**
   - Look for: `📹 Started tutorial: tut_...`
   - Or: `⏹️  Stopped tutorial: tut_...`

3. **List All Tutorials:**
   - Use the viewer's "List All" button
   - Or: `curl http://localhost:3000/api/tutorials`

## Troubleshooting

**Can't see tutorials?**
- Make sure backend server is running
- Check that you stopped recording properly
- Verify the API is accessible: `http://localhost:3000/api/health`

**Screenshots not showing?**
- Screenshots are saved to `backend/screenshots/` folder
- The viewer tries to load them from the file path
- If they don't display, check the file path in the tutorial data

**Want to test again?**
- Just start a new recording from the extension
- Each recording gets a unique ID

