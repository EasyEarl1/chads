// ClickTut - Backend Server
// Express server for handling tutorial data and API requests

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Large limit for screenshots
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create necessary directories
const ensureDirectories = async () => {
  const dirs = [
    process.env.SCREENSHOTS_PATH || './screenshots',
    process.env.VIDEOS_PATH || './videos',
    process.env.AUDIO_PATH || './audio',
    process.env.STORAGE_PATH || './uploads'
  ];

  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`Error creating directory ${dir}:`, error);
    }
  }
};

// Routes
const tutorialsRouter = require('./routes/tutorials');
app.use('/api/tutorials', tutorialsRouter);

// Serve static files (for tutorial viewer)
app.use(express.static(path.join(__dirname, '..')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'ClickTut API Server',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      tutorials: '/api/tutorials'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const startServer = async () => {
  await ensureDirectories();
  
  app.listen(PORT, () => {
    console.log(`🚀 ClickTut API Server running on http://localhost:${PORT}`);
    console.log(`📁 Storage paths configured`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
};

startServer().catch(console.error);

module.exports = app;

