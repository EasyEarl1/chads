# Environment Variables Reference

Create a `.env` file in the `backend/` directory with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# API Keys
# Replicate API (recommended - access to multiple models)
REPLICATE_API_TOKEN=your-replicate-api-token-here

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

