# Setup Replicate API

## Quick Setup

1. **Install the Replicate package:**
   ```bash
   cd backend
   npm install
   ```

2. **Create/Update `.env` file:**
   
   Create a file called `.env` in the `backend/` folder with:
   ```env
   PORT=3000
   NODE_ENV=development
   
   # Replicate API
   REPLICATE_API_TOKEN=your-replicate-api-token-here
   
   # Storage
   STORAGE_PATH=./uploads
   VIDEOS_PATH=./videos
   AUDIO_PATH=./audio
   SCREENSHOTS_PATH=./screenshots
   
   # CORS
   ALLOWED_ORIGINS=http://localhost:3001,http://localhost:5173
   ```

3. **Restart the backend server:**
   ```bash
   npm run dev
   ```

## What's Changed

- ✅ AI service now uses Replicate API
- ✅ No need to sign up for OpenAI/Anthropic separately
- ✅ Access to multiple AI models through one API
- ✅ Using `meta/llama-3.1-8b-instruct` model (fast and efficient)

## Testing

1. Record a tutorial with the extension
2. Open `view-tutorial.html`
3. Click "Generate Instructions"
4. Wait for AI to generate step-by-step instructions
5. View your tutorial with text + screenshots!

## Model Options

You can change the model in `backend/services/ai-service.js`:

- `meta/llama-3.1-8b-instruct` - Fast, good quality (current)
- `meta/llama-3.1-70b-instruct` - Better quality, slower
- `mistralai/mixtral-8x7b-instruct` - Alternative option

