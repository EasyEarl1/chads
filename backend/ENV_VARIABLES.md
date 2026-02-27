# Environment Variables Reference

Create a `.env` file in the `backend/` directory with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# API Keys
# Replicate API (required for instruction generation)
REPLICATE_API_TOKEN=your-replicate-api-token-here

# Gemini API (optional - for AI image analysis of screenshots to improve instruction accuracy)
# Get a free key at https://aistudio.google.com/apikey
GEMINI_API_KEY=your-google-ai-studio-key-here

# Alternative: Direct API keys (if not using Replicate)
# OPENAI_API_KEY=sk-your-openai-key-here
# ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here

# ElevenLabs API
ELEVENLABS_API_KEY=your-elevenlabs-key-here

# Database
DATABASE_URL=mongodb://localhost:27017/clicktut
# OR for PostgreSQL:
# DATABASE_URL=postgresql://user:password@localhost:5432/clicktut

# Storage
STORAGE_PATH=./uploads
VIDEOS_PATH=./videos
AUDIO_PATH=./audio
SCREENSHOTS_PATH=./screenshots

# CORS
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:5173
```

## Getting API Keys

### OpenAI
1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new secret key

### Anthropic (Claude)
1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key

### Gemini (Google AI Studio) – optional, for screenshot vision
1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Create an API key
4. Add `GEMINI_API_KEY=...` to your `.env`. If unset, instruction generation still works without image analysis.

### ElevenLabs
1. Go to https://elevenlabs.io/
2. Sign up or log in
3. Navigate to your profile/API section
4. Copy your API key

## Security Notes

- Never commit `.env` file to git
- Keep API keys secret
- Use different keys for development and production
- Rotate keys if compromised

