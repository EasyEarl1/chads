# ClickTut 🎬

**Create professional video tutorials by simply clicking through your application.**

ClickTut is a comprehensive tool that allows SaaS companies to create video tutorials effortlessly. Just click through your application, and we'll automatically generate a polished tutorial video with narration, cursor overlays, and step-by-step guidance.

## 🎯 Core Concept

Instead of manually recording and editing tutorial videos, ClickTut lets you:

1. **Click** through your application naturally
2. **Track** all interactions automatically
3. **Generate** AI-powered narration scripts
4. **Create** professional videos with audio and visual effects

## ✨ Features

- 🖱️ **Automatic Click Tracking** - Chrome extension captures all interactions
- 📸 **Smart Screenshots** - Captures page state at each step
- 🤖 **AI-Powered Scripts** - Generates natural narration using Claude/GPT
- 🎙️ **Professional Audio** - Converts scripts to speech using ElevenLabs
- 🎬 **Video Generation** - Combines screenshots, cursor overlays, and audio
- 📊 **Dashboard** - Manage, edit, and export your tutorials

## 🏗️ Architecture

The system consists of three main components:

1. **Chrome Extension** - Tracks clicks and captures screenshots
2. **Backend API** - Processes data, integrates AI services, generates videos
3. **Web Dashboard** - Manages tutorials and provides preview/export

## 📚 Documentation

- **[Architecture Plan](./ARCHITECTURE_PLAN.md)** - System overview and implementation phases
- **[Technical Specification](./TECHNICAL_SPEC.md)** - Detailed technical implementation
- **[Quick Start Guide](./QUICK_START.md)** - Get up and running quickly
- **[Getting Started](./GETTING_STARTED.md)** - Step-by-step setup instructions
- **[Build Status](./BUILD_STATUS.md)** - Current implementation status

## 🚀 Getting Started

See [GETTING_STARTED.md](./GETTING_STARTED.md) for detailed setup instructions.

### Quick Setup

```bash
# 1. Backend
cd backend
npm install
npm run dev

# 2. Extension
# Load extension/ folder in Chrome (Developer mode)
# See extension/README.md for icon setup

# 3. Test
# In backend directory: npm run test
```

**Note:** Dashboard is not yet implemented. Core click tracking is fully functional!

## 🛠️ Technology Stack

- **Frontend**: React, Chrome Extension (Manifest V3)
- **Backend**: Node.js + Express (or Python + FastAPI)
- **Database**: PostgreSQL or MongoDB
- **AI**: OpenAI GPT-4 or Anthropic Claude
- **Audio**: ElevenLabs API
- **Video**: FFmpeg

## 📋 Implementation Phases

1. ✅ **Planning & Architecture** - Complete
2. ✅ **Chrome Extension - Click Tracking** - Complete
3. ✅ **Backend API - Data Reception** - Complete
4. ⏳ **AI Integration - Script Generation** - Next
5. ⏳ **Audio Generation** - Pending
6. ⏳ **Video Generation Pipeline** - Pending
7. ⏳ **Web Dashboard** - Pending
8. ⏳ **Polish & Enhancement** - Pending

## 💡 Use Cases

- **SaaS Onboarding** - Create product tutorials quickly
- **Feature Demos** - Showcase new features
- **Training Materials** - Internal team training
- **Documentation** - Visual guides for users
- **Marketing** - Product demonstration videos

## 🔐 Security

- API keys stored securely on backend
- User authentication for dashboard
- Secure storage of screenshots/videos
- CORS properly configured

## 📝 License

[To be determined]

## 🤝 Contributing

[To be added]

## 📧 Support

[To be added]

---

## 🎉 Current Status

**Phase 1 & 2 Complete!** Core click tracking functionality is fully implemented and ready to test.

✅ Chrome Extension with click tracking  
✅ Backend API with data storage  
✅ Screenshot capture  
✅ Full element context capture  

**Next:** AI script generation, audio, and video creation.

See [BUILD_STATUS.md](./BUILD_STATUS.md) for detailed progress.

