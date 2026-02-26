# Troubleshooting Guide

## Problem: No Tutorials Showing Up

### Issue 1: Backend Server Not Running

**Symptoms:**
- Tutorial viewer shows "Unable to connect"
- API calls fail
- Extension shows errors when starting recording

**Solution:**
1. Open a terminal/command prompt
2. Navigate to the backend folder:
   ```bash
   cd backend
   ```
3. Start the server:
   ```bash
   npm run dev
   ```
   Or if you don't have nodemon:
   ```bash
   npm start
   ```

4. You should see:
   ```
   🚀 ClickTut API Server running on http://localhost:3000
   📂 Loaded X tutorials from storage
   ```

5. **Important:** The server must be running BEFORE you start recording!

### Issue 2: Recorded Before Server Started

**Symptoms:**
- You clicked "Start Recording" but server wasn't running
- No data was saved

**Solution:**
- Start the backend server first (see Issue 1)
- Record again - your clicks will be saved this time

### Issue 3: Server Restarted (Old Issue - Now Fixed!)

**Previous Problem:**
- Tutorials were stored in-memory
- Restarting server = lost data

**Fixed:**
- Tutorials now save to `backend/data/tutorials.json`
- Data persists across server restarts
- Your recordings are safe! ✅

### Issue 4: Can't Find Tutorial ID

**Solution:**
1. Check backend console when you stop recording
2. Look for: `⏹️  Stopped tutorial: tut_1234567890_1`
3. Or use the viewer's "List All" button
4. Or check: `http://localhost:3000/api/tutorials`

## Quick Checklist

Before recording:
- [ ] Backend server is running (`npm run dev` in backend folder)
- [ ] Server shows: "🚀 ClickTut API Server running"
- [ ] Extension is loaded in Chrome
- [ ] No errors in browser console (F12)

After recording:
- [ ] Check backend console for Tutorial ID
- [ ] Use viewer to see your tutorial
- [ ] Verify data in `backend/data/tutorials.json`

## Testing the Server

```bash
# Test if server is running
curl http://localhost:3000/api/health

# Should return: {"status":"ok",...}

# List tutorials
curl http://localhost:3000/api/tutorials

# Should return: {"success":true,"tutorials":[...]}
```

## Common Errors

### "Unable to connect to remote server"
- **Cause:** Backend not running
- **Fix:** Start backend server

### "Failed to start recording"
- **Cause:** Backend not running or CORS issue
- **Fix:** Start backend, check CORS settings

### "Tutorial not found"
- **Cause:** Server restarted before file persistence was added, or wrong ID
- **Fix:** Record again, or check correct Tutorial ID

### Screenshots not showing
- **Cause:** File path issues or screenshots not captured
- **Fix:** Check `backend/screenshots/` folder exists, verify screenshot capture in extension

## Getting Help

1. Check backend console for error messages
2. Check browser console (F12) for extension errors
3. Verify server is running: `http://localhost:3000/api/health`
4. Check tutorial data file: `backend/data/tutorials.json`

