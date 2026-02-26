# ClickTut - Implementation Roadmap

## Phase 1: Chrome Extension - Click Tracking ⏳

### Tasks
- [ ] Create manifest.json (✅ Done - placeholder created)
- [ ] Implement content script for click tracking
- [ ] Capture click coordinates and element info
- [ ] Implement screenshot capture
- [ ] Store data locally (IndexedDB)
- [ ] Create popup UI (start/stop recording)
- [ ] Background service worker for data management
- [ ] Send data to backend API

### Files to Create
- `extension/content/click-tracker.js` - Main click tracking logic
- `extension/background/service-worker.js` - Background processing
- `extension/popup/popup.html` - UI for extension
- `extension/popup/popup.js` - Popup logic
- `extension/popup/popup.css` - Styling
- `extension/utils/screenshot.js` - Screenshot utilities

### Estimated Time: 1-2 weeks

---

## Phase 2: Backend API - Data Reception ⏳

### Tasks
- [ ] Set up Express server
- [ ] Configure database connection
- [ ] Create database schema/models
- [ ] Implement POST /api/tutorials/start endpoint
- [ ] Implement POST /api/tutorials/:id/click endpoint
- [ ] Implement POST /api/tutorials/:id/stop endpoint
- [ ] Handle screenshot uploads
- [ ] Store data in database
- [ ] Add error handling and validation

### Files to Create
- `backend/server.js` - Main server file
- `backend/config/database.js` - Database configuration
- `backend/models/tutorial.js` - Tutorial model
- `backend/routes/tutorials.js` - Tutorial routes
- `backend/middleware/upload.js` - File upload handling

### Estimated Time: 1 week

---

## Phase 3: AI Integration - Script Generation ⏳

### Tasks
- [ ] Set up OpenAI/Anthropic SDK
- [ ] Create prompt templates
- [ ] Implement script generation service
- [ ] Process click data into context
- [ ] Generate step descriptions
- [ ] Create narration scripts
- [ ] Store generated scripts
- [ ] Add retry logic for API failures

### Files to Create
- `backend/services/ai-service.js` - AI integration
- `backend/services/script-generator.js` - Script generation logic
- `backend/prompts/` - Prompt templates

### Estimated Time: 1 week

---

## Phase 4: Audio Generation ⏳

### Tasks
- [ ] Integrate ElevenLabs API
- [ ] Create audio generation service
- [ ] Convert scripts to audio
- [ ] Handle different voice options
- [ ] Store audio files
- [ ] Add progress tracking

### Files to Create
- `backend/services/audio-service.js` - ElevenLabs integration

### Estimated Time: 3-5 days

---

## Phase 5: Video Generation Pipeline ⏳

### Tasks
- [ ] Set up FFmpeg wrapper
- [ ] Create video generation service
- [ ] Implement screenshot to video conversion
- [ ] Add cursor overlay functionality
- [ ] Sync audio with video
- [ ] Add transitions between steps
- [ ] Export final MP4
- [ ] Optimize video quality and file size

### Files to Create
- `backend/services/video-service.js` - Video generation
- `backend/utils/cursor-overlay.js` - Cursor overlay logic
- `backend/utils/video-utils.js` - Video utilities

### Estimated Time: 2 weeks

---

## Phase 6: Web Dashboard ⏳

### Tasks
- [ ] Set up React/Vite project
- [ ] Create routing structure
- [ ] Build tutorial list page
- [ ] Build tutorial editor page
- [ ] Implement video preview player
- [ ] Add step editing functionality
- [ ] Create export/download functionality
- [ ] Add authentication (optional)
- [ ] Style with Tailwind CSS

### Files to Create
- `dashboard/src/App.jsx` - Main app component
- `dashboard/src/pages/TutorialList.jsx` - List view
- `dashboard/src/pages/TutorialEditor.jsx` - Editor view
- `dashboard/src/components/VideoPlayer.jsx` - Video player
- `dashboard/src/components/StepEditor.jsx` - Step editor
- `dashboard/src/services/api.js` - API client

### Estimated Time: 2 weeks

---

## Phase 7: Polish & Enhancement ⏳

### Tasks
- [ ] Add cursor animation between clicks
- [ ] Implement element highlighting
- [ ] Add text overlays (step numbers, descriptions)
- [ ] Improve video transitions
- [ ] Add customization options
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] User testing and feedback
- [ ] Documentation

### Estimated Time: 1-2 weeks

---

## Total Estimated Time: 8-10 weeks

## Priority Order

1. **Phase 1** - Extension (Foundation)
2. **Phase 2** - Backend API (Data flow)
3. **Phase 3** - AI Integration (Core feature)
4. **Phase 4** - Audio (Quick win)
5. **Phase 5** - Video Generation (Core feature)
6. **Phase 6** - Dashboard (User interface)
7. **Phase 7** - Polish (Enhancement)

## Milestones

- **Milestone 1**: Extension can record clicks and send to backend
- **Milestone 2**: Backend can receive and store click data
- **Milestone 3**: AI can generate scripts from clicks
- **Milestone 4**: Audio generation working
- **Milestone 5**: Video generation working end-to-end
- **Milestone 6**: Dashboard allows viewing and exporting tutorials
- **Milestone 7**: Production-ready with polish

## Next Steps

1. Start with Phase 1 - Chrome Extension
2. Test click tracking on a simple website
3. Build incrementally, testing each phase
4. Get feedback early and often

