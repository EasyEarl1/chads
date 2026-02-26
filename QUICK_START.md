# ClickTut - Quick Start Guide

## Prerequisites

- Node.js 18+ installed
- Chrome browser for extension development
- FFmpeg installed (for video generation)
- API keys for:
  - OpenAI or Anthropic (Claude)
  - ElevenLabs

## Getting Started

### 1. Install FFmpeg

**Windows:**
- Download from https://ffmpeg.org/download.html
- Add to PATH

**Mac:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt-get install ffmpeg
```

### 2. Set Up Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your API keys
npm run dev
```

### 3. Set Up Chrome Extension

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `extension` folder

### 4. Set Up Dashboard

```bash
cd dashboard
npm install
npm run dev
```

## Development Workflow

1. **Start Backend**: `cd backend && npm run dev`
2. **Load Extension**: Load unpacked extension in Chrome
3. **Start Dashboard**: `cd dashboard && npm run dev`
4. **Record Tutorial**: Click extension icon → Start Recording → Click through your app
5. **Generate Tutorial**: Stop recording → Go to dashboard → Generate video

## Project Structure Overview

```
CLICKTUT/
├── extension/          # Chrome extension (click tracking)
├── backend/            # API server (Node.js/Express)
├── dashboard/          # Web dashboard (React)
└── docs/              # Documentation
```

## Next Steps

1. Review `ARCHITECTURE_PLAN.md` for system overview
2. Review `TECHNICAL_SPEC.md` for implementation details
3. Start with Phase 1: Chrome Extension click tracking
4. Build incrementally, testing each phase

## API Keys Setup

Create `.env` in backend folder:

```
OPENAI_API_KEY=sk-...
# OR
ANTHROPIC_API_KEY=sk-ant-...

ELEVENLABS_API_KEY=...

DATABASE_URL=mongodb://... or postgresql://...

PORT=3000
```

## Common Issues

**Extension not loading:**
- Check manifest.json syntax
- Ensure all files exist
- Check Chrome console for errors

**FFmpeg not found:**
- Verify FFmpeg is in PATH
- Test with: `ffmpeg -version`

**API errors:**
- Verify API keys are correct
- Check rate limits
- Review API documentation

