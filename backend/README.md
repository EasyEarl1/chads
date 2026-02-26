# ClickTut Backend

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   - Copy `ENV_VARIABLES.md` as reference
   - Create a `.env` file in the backend directory
   - Add your API keys (optional for basic click tracking)

3. **Start the Server:**
   ```bash
   npm run dev
   ```
   Or for production:
   ```bash
   npm start
   ```

4. **Verify Server is Running:**
   - Visit `http://localhost:3000/api/health`
   - Should return: `{ "status": "ok", ... }`

## API Endpoints

- `POST /api/tutorials/start` - Start new recording session
- `POST /api/tutorials/:id/click` - Record a click event
- `POST /api/tutorials/:id/stop` - Stop recording
- `GET /api/tutorials` - List all tutorials
- `GET /api/tutorials/:id` - Get tutorial details
- `DELETE /api/tutorials/:id` - Delete tutorial
- `GET /api/health` - Health check

## Current Implementation

- Uses in-memory storage (tutorials array)
- Screenshots saved to `./screenshots/` directory
- Ready to integrate with database (MongoDB/PostgreSQL)
- Ready to add AI, audio, and video generation services

## Next Steps

- [ ] Add database integration (MongoDB or PostgreSQL)
- [ ] Implement AI script generation
- [ ] Add ElevenLabs audio generation
- [ ] Implement video generation with FFmpeg

