# ClickTut - Technical Specification

## 1. Chrome Extension Architecture

### Manifest Configuration
```json
{
  "manifest_version": 3,
  "name": "ClickTut - Tutorial Recorder",
  "version": "1.0.0",
  "permissions": [
    "activeTab",
    "storage",
    "tabs",
    "scripting"
  ],
  "host_permissions": [
    "http://localhost:3000/*",
    "https://your-api-domain.com/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content/click-tracker.js"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup/popup.html"
  }
}
```

### Click Tracking Implementation

**Content Script (`click-tracker.js`)**:
- Intercepts all click events on the page
- Captures:
  - Click coordinates (x, y)
  - Timestamp
  - Target element info (tag, id, class, text content)
  - Page URL and title
  - Viewport dimensions
- Takes screenshot using `chrome.tabs.captureVisibleTab()`
- Sends data to background service worker

**Data Structure per Click**:
```javascript
{
  timestamp: 1234567890,
  coordinates: { x: 150, y: 300 },
  element: {
    tag: "button",
    id: "add-product-btn",
    classes: ["btn", "btn-primary"],
    text: "Add Product",
    selector: "#add-product-btn"
  },
  page: {
    url: "https://shopify.com/admin/products",
    title: "Products - Shopify Admin"
  },
  screenshot: "data:image/png;base64,...",
  viewport: { width: 1920, height: 1080 }
}
```

### Screenshot Strategy
- Use `chrome.tabs.captureVisibleTab()` for full page screenshots
- Store as base64 initially, then upload to backend
- Alternative: Use HTML2Canvas library for more control
- Consider capturing before AND after click for better context

## 2. Backend API Design

### Database Schema

**Tutorials Collection**:
```javascript
{
  _id: ObjectId,
  userId: String,
  title: String,
  description: String,
  createdAt: Date,
  status: "recording" | "processing" | "completed" | "failed",
  steps: [{
    stepNumber: Number,
    timestamp: Number,
    clickData: {
      coordinates: { x, y },
      element: {...},
      page: {...}
    },
    screenshot: String, // URL or path
    aiDescription: String,
    script: String
  }],
  generatedScript: String,
  audioUrl: String,
  videoUrl: String,
  metadata: {
    totalDuration: Number,
    clickCount: Number
  }
}
```

### AI Script Generation

**Prompt Template**:
```
You are analyzing a user's interaction with a web application to create a tutorial script.

The user performed the following steps:
{step_descriptions}

For each step, provide:
1. A clear, concise description of what happened
2. A natural-sounding narration script (2-3 sentences)

Context from the page:
- Page: {page_title}
- URL: {page_url}
- Element clicked: {element_info}

Generate a friendly, instructional script suitable for a video tutorial.
```

**Processing Flow**:
1. Collect all click events for a session
2. Group by page/context
3. Send to AI with context
4. Parse response into structured steps
5. Store in database

## 3. Audio Generation (ElevenLabs)

### Integration
```javascript
// Example API call
const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/{voice_id}', {
  method: 'POST',
  headers: {
    'Accept': 'audio/mpeg',
    'Content-Type': 'application/json',
    'xi-api-key': process.env.ELEVENLABS_API_KEY
  },
  body: JSON.stringify({
    text: script,
    model_id: "eleven_monolingual_v1",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.5
    }
  })
});
```

### Voice Selection
- Allow user to choose voice in dashboard
- Store voice preference per tutorial
- Support multiple languages

## 4. Video Generation Pipeline

### FFmpeg Workflow

**Step 1: Prepare Screenshots**
- Resize all screenshots to consistent dimensions (1920x1080 recommended)
- Ensure aspect ratio consistency

**Step 2: Create Cursor Overlay**
- Generate cursor image (PNG with transparency)
- Position cursor at click coordinates
- Animate cursor movement between clicks (optional)

**Step 3: Combine Images into Video**
```bash
# Create video from screenshots (2 seconds per image)
ffmpeg -framerate 0.5 -i screenshot_%d.png -c:v libx264 -pix_fmt yuv420p video.mp4
```

**Step 4: Add Cursor Overlay**
```bash
# Overlay cursor at specific coordinates
ffmpeg -i video.mp4 -i cursor.png -filter_complex \
  "[0:v][1:v]overlay=x=150:y=300:enable='between(t,0,2)'" \
  output.mp4
```

**Step 5: Add Audio**
```bash
# Combine video with audio narration
ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac -shortest final.mp4
```

### Advanced Features

**Cursor Animation**:
- Smooth cursor movement between click points
- Click animation (cursor press effect)
- Highlight clicked element with subtle glow

**Text Overlays**:
- Step numbers (e.g., "Step 1 of 5")
- Brief descriptions
- Highlight boxes around clicked elements

**Transitions**:
- Fade between screenshots
- Smooth page transitions
- Zoom effects on important elements

## 5. Web Dashboard Features

### Main Views

1. **Tutorial List**
   - Grid/list view of all tutorials
   - Filter by status, date
   - Search functionality

2. **Tutorial Editor**
   - Timeline view of steps
   - Edit step descriptions
   - Reorder steps
   - Delete steps
   - Preview individual steps

3. **Video Preview**
   - Video player with controls
   - Step-by-step navigation
   - Export options (MP4, different resolutions)

4. **Settings**
   - Voice selection
   - Cursor style preferences
   - Export quality settings

## 6. Implementation Details

### Cursor Overlay Generation

**Option 1: FFmpeg Overlay Filter**
- Static cursor image
- Position at each click coordinate
- Show for duration of that step

**Option 2: Canvas-based Pre-rendering**
- Use Node.js Canvas library
- Draw cursor on each screenshot
- Then convert to video

**Option 3: HTML5 Canvas + Record**
- Render in browser
- Record canvas as video
- More flexible but complex

### Performance Optimization

1. **Screenshot Compression**: Use WebP or optimized PNG
2. **Lazy Loading**: Only generate video when requested
3. **Queue System**: Process videos in background queue
4. **Caching**: Cache generated videos
5. **CDN**: Serve videos from CDN

### Error Handling

- Handle API failures gracefully
- Retry logic for AI/audio generation
- Progress tracking for long operations
- User notifications for completion/failure

## 7. Security Considerations

1. **API Keys**: Store securely, never expose to frontend
2. **CORS**: Configure properly for extension
3. **Authentication**: User authentication for dashboard
4. **Rate Limiting**: Prevent abuse of AI/audio APIs
5. **Data Privacy**: Secure storage of screenshots/videos

## 8. Testing Strategy

1. **Extension Testing**: Test on various websites
2. **API Testing**: Unit tests for endpoints
3. **AI Integration**: Test with various click patterns
4. **Video Generation**: Test with different numbers of steps
5. **End-to-End**: Full workflow testing

## 9. Deployment

### Extension
- Chrome Web Store submission
- Manifest V3 compliance
- Privacy policy required

### Backend
- Deploy to cloud (AWS, Heroku, Railway)
- Set up database (MongoDB Atlas, PostgreSQL)
- Configure environment variables

### Dashboard
- Deploy to Vercel, Netlify, or similar
- Connect to backend API
- Set up domain and SSL

