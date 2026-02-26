# ClickTut - Video Tutorial Generator from Clicks

## Overview
A tool that allows SaaS companies to create video tutorials by simply clicking through their application. The system tracks clicks, captures screenshots, generates AI-powered scripts, converts to audio, and creates polished tutorial videos.

## System Architecture

### Components

1. **Chrome Extension** (Frontend - Click Tracking)
   - Records user clicks, mouse movements, and interactions
   - Captures screenshots at each step
   - Captures page context (DOM, element info, page title, URL)
   - Sends data to backend API

2. **Web Dashboard** (Frontend - Management UI)
   - View recorded sessions
   - Edit tutorial steps
   - Preview and export videos
   - Manage multiple tutorials

3. **Backend API** (Node.js/Express or Python/FastAPI)
   - Receives click data from extension
   - Processes and stores tutorial sessions
   - Integrates with AI services (Claude/ChatGPT, 11labs)
   - Manages video generation pipeline

4. **AI Processing Service**
   - Analyzes clicks + screenshots + page context
   - Generates step-by-step descriptions
   - Creates natural language script for narration

5. **Audio Generation** (11labs integration)
   - Converts script to audio narration

6. **Video Generation Service**
   - Combines screenshots with cursor overlays
   - Syncs audio with visual steps
   - Exports final video (MP4)

## Technology Stack

### Frontend
- **Chrome Extension**: 
  - Manifest V3
  - Content scripts for click tracking
  - Background service worker
  - React or Vanilla JS for popup UI

- **Web Dashboard**:
  - React/Next.js or Vue.js
  - Tailwind CSS for styling
  - Video player for previews

### Backend
- **API Server**: Node.js + Express OR Python + FastAPI
- **Database**: PostgreSQL or MongoDB (for tutorial sessions)
- **File Storage**: AWS S3 or local storage (for screenshots/videos)

### AI Services
- **Script Generation**: OpenAI GPT-4 or Anthropic Claude API
- **Audio Generation**: ElevenLabs API
- **Image Processing**: Sharp (Node.js) or PIL (Python)

### Video Generation
- **FFmpeg**: For video composition, cursor overlay, audio sync
- **Canvas API**: For cursor overlay rendering
- **Node.js**: `fluent-ffmpeg` wrapper OR Python: `moviepy`

## Data Flow

```
1. User clicks through application
   ↓
2. Extension captures:
   - Click coordinates
   - Timestamp
   - Screenshot
   - Page context (DOM, element info, URL)
   ↓
3. Data sent to Backend API
   ↓
4. Backend stores session data
   ↓
5. AI Processing:
   - Analyzes all steps
   - Generates step descriptions
   - Creates narration script
   ↓
6. Audio Generation (11labs):
   - Script → Audio file
   ↓
7. Video Generation:
   - Screenshots + cursor overlays + audio → MP4
   ↓
8. Video available in dashboard for preview/export
```

## Implementation Plan

### Phase 1: Chrome Extension - Click Tracking
- [ ] Set up Chrome extension manifest
- [ ] Content script to track clicks
- [ ] Capture click coordinates and timestamps
- [ ] Screenshot capture at each click
- [ ] Capture page context (element info, page title, URL)
- [ ] Store data locally (IndexedDB)
- [ ] UI for starting/stopping recording

### Phase 2: Backend API - Data Reception
- [ ] Set up API server
- [ ] Endpoint to receive click data
- [ ] Database schema for tutorials
- [ ] Store screenshots and metadata
- [ ] Session management

### Phase 3: AI Integration - Script Generation
- [ ] Integrate OpenAI/Claude API
- [ ] Prompt engineering for step analysis
- [ ] Generate step-by-step descriptions
- [ ] Create natural narration script
- [ ] Store generated scripts

### Phase 4: Audio Generation
- [ ] Integrate ElevenLabs API
- [ ] Convert script to audio
- [ ] Store audio files
- [ ] Handle different voice options

### Phase 5: Video Generation
- [ ] Set up FFmpeg pipeline
- [ ] Create cursor overlay graphics
- [ ] Combine screenshots into video sequence
- [ ] Overlay cursor at click positions
- [ ] Sync audio with video
- [ ] Export final MP4

### Phase 6: Web Dashboard
- [ ] Dashboard UI for viewing tutorials
- [ ] Step editor (edit descriptions, reorder)
- [ ] Video preview player
- [ ] Export/download functionality
- [ ] Tutorial management (list, delete, edit)

### Phase 7: Polish & Enhancement
- [ ] Add transitions between steps
- [ ] Highlight clicked elements
- [ ] Add text overlays (step numbers, descriptions)
- [ ] Customization options (cursor style, colors)
- [ ] Multiple export formats/resolutions

## File Structure

```
CLICKTUT/
├── extension/                 # Chrome Extension
│   ├── manifest.json
│   ├── background/
│   │   └── service-worker.js
│   ├── content/
│   │   └── click-tracker.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   └── utils/
│       └── screenshot.js
│
├── backend/                   # Backend API
│   ├── server.js (or app.py)
│   ├── routes/
│   │   ├── tutorials.js
│   │   ├── ai.js
│   │   └── video.js
│   ├── services/
│   │   ├── ai-service.js
│   │   ├── audio-service.js
│   │   └── video-service.js
│   ├── models/
│   │   └── tutorial.js
│   └── config/
│       └── database.js
│
├── dashboard/                 # Web Dashboard
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── App.js
│   └── package.json
│
├── shared/                    # Shared utilities
│   └── types.js
│
└── README.md
```

## Key Technical Challenges

1. **Screenshot Quality**: Ensure high-quality screenshots that work well in video
2. **Cursor Overlay**: Smooth cursor animation between click points
3. **Timing**: Proper audio-video synchronization
4. **Context Understanding**: AI needs to understand what action was performed
5. **Performance**: Video generation can be resource-intensive
6. **Storage**: Large files (screenshots, videos) need efficient storage

## API Endpoints (Proposed)

```
POST   /api/tutorials/start          - Start new recording session
POST   /api/tutorials/:id/click      - Record a click event
POST   /api/tutorials/:id/stop       - Stop recording
POST   /api/tutorials/:id/generate   - Generate script + audio + video
GET    /api/tutorials                 - List all tutorials
GET    /api/tutorials/:id            - Get tutorial details
PUT    /api/tutorials/:id            - Update tutorial
DELETE /api/tutorials/:id            - Delete tutorial
GET    /api/tutorials/:id/video      - Stream/download video
```

## Environment Variables Needed

```
# AI Services
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
ELEVENLABS_API_KEY=...

# Database
DATABASE_URL=...

# Storage
STORAGE_PATH=... (or AWS credentials)

# Server
PORT=3000
```

## Next Steps

1. Start with Chrome Extension for click tracking
2. Build basic backend to receive data
3. Implement AI script generation
4. Add audio generation
5. Build video generation pipeline
6. Create dashboard UI

