# ClickTut - System Flow Diagram

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER WORKFLOW                           │
└─────────────────────────────────────────────────────────────────┘

1. User opens Chrome Extension
   ↓
2. Clicks "Start Recording"
   ↓
3. Navigates and clicks through application
   ↓
4. Extension captures:
   - Click coordinates
   - Screenshots
   - Page context
   ↓
5. User clicks "Stop Recording"
   ↓
6. Data sent to Backend API
   ↓
7. User goes to Dashboard
   ↓
8. Clicks "Generate Tutorial"
   ↓
9. Backend processes:
   - AI generates script
   - ElevenLabs creates audio
   - FFmpeg generates video
   ↓
10. Tutorial ready in Dashboard
   ↓
11. User previews, edits, or exports video
```

## Detailed Component Flow

```
┌──────────────┐
│   Chrome     │
│  Extension   │
└──────┬───────┘
       │
       │ 1. User clicks
       │ 2. Capture screenshot
       │ 3. Record click data
       │
       ↓
┌─────────────────────────────────────┐
│      Extension Storage              │
│  (IndexedDB - local storage)        │
└──────┬──────────────────────────────┘
       │
       │ 4. Batch send on stop
       │
       ↓
┌─────────────────────────────────────┐
│      Backend API                    │
│  POST /api/tutorials/:id/click      │
└──────┬──────────────────────────────┘
       │
       │ 5. Store in database
       │
       ↓
┌─────────────────────────────────────┐
│      Database                       │
│  (Tutorials, Steps, Screenshots)    │
└──────┬──────────────────────────────┘
       │
       │ 6. User triggers generation
       │
       ↓
┌─────────────────────────────────────┐
│   AI Service (Claude/GPT)           │
│  - Analyze clicks + context         │
│  - Generate step descriptions       │
│  - Create narration script          │
└──────┬──────────────────────────────┘
       │
       │ 7. Script returned
       │
       ↓
┌─────────────────────────────────────┐
│   ElevenLabs API                    │
│  - Convert script to audio          │
│  - Return MP3 file                  │
└──────┬──────────────────────────────┘
       │
       │ 8. Audio file
       │
       ↓
┌─────────────────────────────────────┐
│   Video Generation Service          │
│  - Load screenshots                 │
│  - Add cursor overlays              │
│  - Combine with audio               │
│  - Export MP4                       │
└──────┬──────────────────────────────┘
       │
       │ 9. Video file
       │
       ↓
┌─────────────────────────────────────┐
│      Dashboard                      │
│  - Display tutorial                 │
│  - Preview video                    │
│  - Export/download                  │
└─────────────────────────────────────┘
```

## Data Flow Example

### Step 1: Click Event
```javascript
// User clicks "Add Product" button
{
  timestamp: 1699123456789,
  coordinates: { x: 450, y: 200 },
  element: {
    tag: "button",
    id: "add-product",
    text: "Add Product",
    selector: "#add-product"
  },
  page: {
    url: "https://shopify.com/admin/products",
    title: "Products"
  },
  screenshot: "base64_image_data..."
}
```

### Step 2: AI Processing
```
Input to AI:
- Click on "Add Product" button
- Page: Products page
- Context: User is in Shopify admin

AI Output:
{
  description: "Click the Add Product button to create a new product",
  script: "To add a new product to your store, simply click the Add Product button located in the top right corner of the products page."
}
```

### Step 3: Audio Generation
```
Input: Script text
Output: audio.mp3 (duration: ~5 seconds)
```

### Step 4: Video Generation
```
Inputs:
- screenshot.png (1920x1080)
- cursor.png (overlay at x:450, y:200)
- audio.mp3

Process:
1. Create video from screenshot (5 seconds)
2. Overlay cursor at click position
3. Sync audio
4. Export final.mp4
```

## State Transitions

### Tutorial Status
```
[recording] → [processing] → [completed]
     ↓             ↓              ↓
  [failed]     [failed]      [editing]
```

### Recording States
```
[inactive] → [recording] → [paused] → [recording] → [stopped]
```

## API Request/Response Flow

### Start Recording
```
POST /api/tutorials/start
Request: { title: "Adding a Product" }
Response: { tutorialId: "abc123", status: "recording" }
```

### Record Click
```
POST /api/tutorials/abc123/click
Request: { clickData: {...}, screenshot: "..." }
Response: { stepNumber: 1, success: true }
```

### Stop Recording
```
POST /api/tutorials/abc123/stop
Response: { status: "recording_complete", stepCount: 5 }
```

### Generate Tutorial
```
POST /api/tutorials/abc123/generate
Response: { 
  status: "processing",
  jobId: "job_xyz"
}

// Poll for completion
GET /api/tutorials/abc123/status
Response: {
  status: "completed",
  videoUrl: "/videos/abc123.mp4",
  audioUrl: "/audio/abc123.mp3"
}
```

## Error Handling Flow

```
┌─────────────┐
│   Error     │
└──────┬──────┘
       │
       ↓
┌──────────────────┐
│  Log Error        │
│  - Error type     │
│  - Context        │
│  - Timestamp      │
└──────┬────────────┘
       │
       ↓
┌──────────────────┐
│  Retry Logic?     │
│  - API failures   │
│  - Network issues │
└──────┬────────────┘
       │
       ↓
┌──────────────────┐
│  Notify User      │
│  - Dashboard      │
│  - Extension      │
└──────────────────┘
```

## Performance Considerations

### Optimization Points
1. **Screenshot Compression** - Compress before upload
2. **Batch Uploads** - Send multiple clicks at once
3. **Async Processing** - Generate video in background
4. **Caching** - Cache generated videos
5. **CDN** - Serve videos from CDN

### Queue System
```
Click Data → Queue → Worker → AI Processing → Audio → Video → Complete
```

## Security Flow

```
Extension → HTTPS → Backend API → Authentication → Database
                ↓
            Rate Limiting
                ↓
            API Key Validation
                ↓
            Process Request
```

