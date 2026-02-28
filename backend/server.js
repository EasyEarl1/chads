// ClickTut - Backend Server
// Express server for handling tutorial data and API requests

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
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

// Position presets for title: { x%, y%, textAnchor, dominantBaseline }
const TITLE_POSITIONS = {
  'top-left': { x: 10, y: 18, textAnchor: 'start', dominantBaseline: 'hanging' },
  'top-center': { x: 50, y: 18, textAnchor: 'middle', dominantBaseline: 'hanging' },
  'top-right': { x: 90, y: 18, textAnchor: 'end', dominantBaseline: 'hanging' },
  'middle-left': { x: 10, y: 50, textAnchor: 'start', dominantBaseline: 'middle' },
  'center': { x: 50, y: 50, textAnchor: 'middle', dominantBaseline: 'middle' },
  'middle-right': { x: 90, y: 50, textAnchor: 'end', dominantBaseline: 'middle' },
  'bottom-left': { x: 10, y: 82, textAnchor: 'start', dominantBaseline: 'auto' },
  'bottom-center': { x: 50, y: 82, textAnchor: 'middle', dominantBaseline: 'auto' },
  'bottom-right': { x: 90, y: 82, textAnchor: 'end', dominantBaseline: 'auto' }
};

// ── Smart multi-line text engine ──────────────────────────────────────
// Measures a single line of text at a reference size by rendering SVG and trimming.
const REF_SIZE = 200;
const LINE_SPACING = 1.15;

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SAFETY_MARGIN = 0.92;

async function measureLine(line, font) {
  const safe = esc(line);
  const sw = Math.max(1, Math.floor(REF_SIZE / 16));
  const pad = sw * 2 + 20;
  const canvasW = Math.max(4000, safe.length * REF_SIZE + pad * 2);
  const canvasH = REF_SIZE * 2 + pad * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">
  <text x="${pad}" y="${pad + REF_SIZE}" text-anchor="start" dominant-baseline="alphabetic"
    font-family="${font}" font-size="${REF_SIZE}" font-weight="900"
    fill="white" stroke="white" stroke-width="${sw}" paint-order="stroke">${safe}</text></svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const trimmed = await sharp(buf).trim({ threshold: 5 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  return { width: meta.width || 1, height: meta.height || 1 };
}

// Generate all ways to split words into N lines (combinations of break positions).
function generateLineSplits(words) {
  const results = [];
  const n = words.length;
  if (n === 0) return [['']];
  if (n === 1) return [[words[0]]];

  // 1-line
  results.push([words.join(' ')]);

  // 2-line splits
  for (let i = 1; i < n; i++) {
    results.push([words.slice(0, i).join(' '), words.slice(i).join(' ')]);
  }

  // 3-line splits (only if 3+ words)
  if (n >= 3) {
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        results.push([
          words.slice(0, i).join(' '),
          words.slice(i, j).join(' '),
          words.slice(j).join(' ')
        ]);
      }
    }
  }

  return results;
}

// For a given line split, compute the max font size that fits in boxW × boxH.
// Each line is scaled independently to boxW, then the total height must fit boxH.
// Returns { fontSize, lines: [{ text, fontSize }] } where each line can have its own size.
async function scoreSplit(lines, font, boxW, boxH) {
  const measurements = [];
  for (const line of lines) {
    const m = await measureLine(line, font);
    measurements.push(m);
  }

  // Per-line font sizes if each line fills boxW independently (with safety margin)
  const perLineSize = measurements.map((m) => {
    return (boxW / m.width) * REF_SIZE * SAFETY_MARGIN;
  });

  // Uniform mode: all lines same size (limited by widest line)
  const uniformSize = Math.min(...perLineSize);
  const uniformLineH = (measurements[0].height / REF_SIZE) * uniformSize;
  const uniformTotalH = uniformLineH * lines.length * LINE_SPACING;
  const uniformFinal = uniformTotalH > boxH
    ? uniformSize * (boxH / uniformTotalH)
    : uniformSize;

  // Actual pixel area for uniform mode
  const uniformArea = measurements.reduce((a, m) => {
    const scale = uniformFinal / REF_SIZE;
    return a + (m.width * scale) * (m.height * scale);
  }, 0);

  // Dynamic mode: each line fills boxW independently, then scale total height to fit.
  // Cap the ratio between largest and smallest line to MAX_SIZE_RATIO.
  const MAX_SIZE_RATIO = 1.6;
  const rawMax = Math.max(...perLineSize);
  const rawMin = Math.min(...perLineSize);
  const cappedPerLine = (rawMax / rawMin > MAX_SIZE_RATIO)
    ? perLineSize.map(s => {
        const floor = rawMax / MAX_SIZE_RATIO;
        return Math.max(s, floor);
      })
    : [...perLineSize];

  const dynLineHeights = measurements.map((m, i) => {
    return (m.height / REF_SIZE) * cappedPerLine[i];
  });
  const dynTotalH = dynLineHeights.reduce((a, h) => a + h * LINE_SPACING, 0);
  const dynScale = dynTotalH > boxH ? boxH / dynTotalH : 1;
  const dynSizes = cappedPerLine.map(s => s * dynScale);

  const dynArea = measurements.reduce((a, m, i) => {
    const scale = dynSizes[i] / REF_SIZE;
    return a + (m.width * scale) * (m.height * scale);
  }, 0);

  // Pick whichever mode fills more actual pixel area
  if (dynArea > uniformArea && lines.length > 1) {
    return {
      mode: 'dynamic',
      score: dynArea,
      lines: lines.map((text, i) => ({ text, fontSize: Math.floor(Math.max(12, dynSizes[i])) })),
      measurements,
    };
  }
  return {
    mode: 'uniform',
    score: uniformArea,
    lines: lines.map((text) => ({ text, fontSize: Math.floor(Math.max(12, uniformFinal)) })),
    measurements,
  };
}

// Try all line splits and return the best layout.
async function bestTextLayout(inputText, font, boxW, boxH) {
  const words = inputText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [{ text: inputText, fontSize: 60 }] };

  const splits = generateLineSplits(words);
  let best = null;

  for (const split of splits) {
    const result = await scoreSplit(split, font, boxW, boxH);
    if (!best || result.score > best.score) {
      best = result;
    }
  }

  return best;
}

function buildTextSvg(layout, boxX, boxY, boxW, boxH, font, align, opts = {}) {
  const fillColor = opts.textColor || '#ffffff';
  const strokeCol = opts.strokeColor || '#000000';
  const userStrokeW = typeof opts.strokeWidth === 'number' ? opts.strokeWidth : -1;

  const totalH = layout.lines.reduce((a, l) => a + l.fontSize * LINE_SPACING, 0);
  let cursorY = boxY + (boxH - totalH) / 2;

  const anchorMap = { left: 'start', center: 'middle', right: 'end' };
  const textAnchor = anchorMap[align] || 'start';
  let xPos;
  if (align === 'right') xPos = boxX + boxW;
  else if (align === 'center') xPos = boxX + boxW / 2;
  else xPos = boxX;

  const textEls = layout.lines.map((l) => {
    const lineH = l.fontSize * LINE_SPACING;
    const y = cursorY + lineH * 0.8;
    cursorY += lineH;
    const sw = userStrokeW >= 0 ? userStrokeW : Math.max(1, Math.floor(l.fontSize / 16));
    const strokeAttr = sw > 0 ? `stroke="${esc(strokeCol)}" stroke-width="${sw}" paint-order="stroke"` : '';
    const filterId = opts.shadowFilterId || 'shadow';
    return `<text x="${xPos}" y="${y}" text-anchor="${textAnchor}"
      font-family="${font}" font-size="${l.fontSize}" font-weight="900"
      fill="${esc(fillColor)}" ${strokeAttr}
      filter="url(#${filterId})">${esc(l.text)}</text>`;
  }).join('\n    ');

  return textEls;
}

// ── Thumbnail designer endpoint ──────────────────────────────────────
app.post('/api/thumbnail-designer', async (req, res) => {
  const {
    text, fontFamily, textBox, textAlign: reqAlign,
    bgColor1, bgColor2, bgAngle, bgImage,
    textColor, strokeColor, strokeWidth,
    layers
  } = req.body || {};

  const rawText = (typeof text === 'string' && text.trim()) ? text.trim() : 'Sample Thumbnail';
  const safeText = rawText.toUpperCase();
  const font = (typeof fontFamily === 'string' && fontFamily.trim()) ? fontFamily.trim() : 'Impact, Arial Black, sans-serif';
  const align = ['left', 'center', 'right'].includes(reqAlign) ? reqAlign : 'left';
  const bg1 = (typeof bgColor1 === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(bgColor1)) ? bgColor1 : '#0f172a';
  const bg2 = (typeof bgColor2 === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(bgColor2)) ? bgColor2 : '#1d2a5b';
  const angle = typeof bgAngle === 'number' ? bgAngle : 135;

  try {
    const WIDTH = 1920;
    const HEIGHT = 1080;

    // Compute gradient direction from angle
    const rad = (angle - 90) * Math.PI / 180;
    const gx1 = 0.5 - Math.cos(rad) * 0.5, gy1 = 0.5 - Math.sin(rad) * 0.5;
    const gx2 = 0.5 + Math.cos(rad) * 0.5, gy2 = 0.5 + Math.sin(rad) * 0.5;

    // Per-layer shadow filters
    const defs = [];
    const layerList = Array.isArray(layers) ? layers : [];
    let filterIdx = 0;

    defs.push(`<linearGradient id="bg" x1="${gx1}" y1="${gy1}" x2="${gx2}" y2="${gy2}">
      <stop offset="0%" stop-color="${esc(bg1)}" />
      <stop offset="100%" stop-color="${esc(bg2)}" />
    </linearGradient>`);

    // Text shadow filter (used by buildTextSvg)
    defs.push(`<filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="12" stdDeviation="8" flood-color="#000" flood-opacity="0.7" />
    </filter>`);

    const layerSvgParts = [];

    for (const layer of layerList) {
      const lx = ((layer.l || 0) / 100) * WIDTH;
      const ly = ((layer.t || 0) / 100) * HEIGHT;
      const lw = ((layer.w || 10) / 100) * WIDTH;
      const lh = ((layer.h || 10) / 100) * HEIGHT;
      const rotation = layer.rotation || 0;
      const radius = layer.borderRadius || 0;
      const opacity = layer.opacity ?? 1;
      const sx = layer.shadowX ?? 0, sy = layer.shadowY ?? 0;
      const sblur = layer.shadowBlur ?? 0;
      const scolor = layer.shadowColor || 'rgba(0,0,0,0)';

      // Create per-layer shadow filter if needed
      let layerFilterId = null;
      if (sblur > 0 || sx !== 0 || sy !== 0) {
        layerFilterId = 'lshadow' + (filterIdx++);
        // Parse shadow color for flood-color/flood-opacity
        let floodColor = '#000', floodOpacity = '0.5';
        const rgbaMatch = scolor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch) {
          const r = parseInt(rgbaMatch[1]), g = parseInt(rgbaMatch[2]), b = parseInt(rgbaMatch[3]);
          floodColor = `rgb(${r},${g},${b})`;
          floodOpacity = rgbaMatch[4] !== undefined ? rgbaMatch[4] : '1';
        } else if (scolor.startsWith('#')) {
          floodColor = scolor; floodOpacity = '0.6';
        }
        defs.push(`<filter id="${layerFilterId}" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="${sx}" dy="${sy}" stdDeviation="${Math.round(sblur / 2)}" flood-color="${floodColor}" flood-opacity="${floodOpacity}" />
        </filter>`);
      }

      // Transform string
      const transforms = [];
      if (rotation) {
        const cx = lx + lw / 2, cy = ly + lh / 2;
        transforms.push(`rotate(${rotation}, ${cx}, ${cy})`);
      }
      const transformAttr = transforms.length ? `transform="${transforms.join(' ')}"` : '';
      const filterAttr = layerFilterId ? `filter="url(#${layerFilterId})"` : '';
      const opacityAttr = opacity < 1 ? `opacity="${opacity}"` : '';

      if (layer.type === 'text') {
        const boxX = textBox ? (textBox.left / 100) * WIDTH : lx;
        const boxY = textBox ? (textBox.top / 100) * HEIGHT : ly;
        const boxW = textBox ? (textBox.width / 100) * WIDTH : lw;
        const boxH = textBox ? (textBox.height / 100) * HEIGHT : lh;
        const layout = await bestTextLayout(safeText, font, boxW, boxH);

        // For text: override the text shadow filter with the per-layer one
        const textOpts = {
          textColor: textColor || '#ffffff',
          strokeColor: strokeColor || '#000000',
          strokeWidth: typeof strokeWidth === 'number' ? strokeWidth : -1,
          shadowFilterId: layerFilterId || 'shadow',
        };
        const svgText = buildTextSvg(layout, boxX, boxY, boxW, boxH, font, align, textOpts);
        const groupAttrs = [transformAttr, opacityAttr].filter(Boolean).join(' ');
        layerSvgParts.push(groupAttrs ? `<g ${groupAttrs}>${svgText}</g>` : svgText);

      } else if (layer.type === 'image' && layer.dataUrl) {
        // Clip for border radius
        let clipId = null;
        if (radius > 0) {
          clipId = 'clip' + filterIdx++;
          defs.push(`<clipPath id="${clipId}"><rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="${radius}" ry="${radius}" /></clipPath>`);
        }
        const clipAttr = clipId ? `clip-path="url(#${clipId})"` : '';
        const attrs = [filterAttr, transformAttr, opacityAttr, clipAttr].filter(Boolean).join(' ');
        layerSvgParts.push(
          `<image href="${layer.dataUrl}" x="${lx}" y="${ly}" width="${lw}" height="${lh}" preserveAspectRatio="xMidYMid meet" ${attrs} />`
        );

      } else if (layer.type === 'sticker' && layer.emoji) {
        const fontSize = Math.round(lh * 0.8);
        const tx = lx + lw / 2, ty = ly + lh / 2;
        const attrs = [filterAttr, transformAttr, opacityAttr].filter(Boolean).join(' ');
        layerSvgParts.push(
          `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" ${attrs}>${layer.emoji}</text>`
        );
      }
    }

    // Fallback if no layers
    if (layerSvgParts.length === 0) {
      const layout = await bestTextLayout(safeText, font, WIDTH * 0.85, HEIGHT * 0.6);
      layerSvgParts.push(buildTextSvg(layout, WIDTH * 0.075, HEIGHT * 0.2, WIDTH * 0.85, HEIGHT * 0.6, font, align, { textColor, strokeColor, strokeWidth }));
    }

    // Background: either image or gradient
    let bgEl = `<rect width="100%" height="100%" fill="url(#bg)" />`;
    if (bgImage && typeof bgImage === 'string' && bgImage.startsWith('data:image/')) {
      bgEl = `<image href="${bgImage}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid slice" />`;
    }

    const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>${defs.join('\n')}</defs>
  ${bgEl}
  ${layerSvgParts.join('\n  ')}
</svg>`;

    const pngBuffer = await sharp(Buffer.from(svg), { density: 72 })
      .resize(WIDTH, HEIGHT, { fit: 'fill' })
      .png()
      .toBuffer();

    const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    res.json({ success: true, dataUrl });
  } catch (error) {
    console.error('Error generating test thumbnail:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate thumbnail' });
  }
});

// ── Template presets (with variations) ──
const PRESETS_FILE = path.join(__dirname, 'data', 'thumbnail-presets.json');

async function loadPresets() {
  try {
    await fs.mkdir(path.dirname(PRESETS_FILE), { recursive: true });
    const data = await fs.readFile(PRESETS_FILE, 'utf8');
    const presets = JSON.parse(data);
    // Migrate old format: if a preset has .template instead of .variations, convert it
    for (const p of presets) {
      if (p.template && !p.variations) {
        p.variations = [{ id: 'var_' + Date.now(), name: 'Default', template: p.template, createdAt: p.createdAt }];
        delete p.template;
      }
    }
    return presets;
  } catch { return []; }
}
async function savePresets(presets) {
  await fs.mkdir(path.dirname(PRESETS_FILE), { recursive: true });
  await fs.writeFile(PRESETS_FILE, JSON.stringify(presets, null, 2));
}

// List all presets (with their variations)
app.get('/api/templates/presets', async (req, res) => {
  const presets = await loadPresets();
  res.json({ success: true, presets });
});

// Create a new preset (with first variation)
app.post('/api/templates/presets', async (req, res) => {
  const { name, template } = req.body || {};
  if (!name || !template) return res.status(400).json({ success: false, error: 'name and template required' });
  const presets = await loadPresets();
  const id = 'preset_' + Date.now();
  const varId = 'var_' + Date.now();
  const now = new Date().toISOString();
  presets.push({ id, name, variations: [{ id: varId, name: 'Variation 1', template, createdAt: now }], createdAt: now });
  await savePresets(presets);
  res.json({ success: true, preset: presets[presets.length - 1] });
});

// Delete a preset
app.delete('/api/templates/presets/:id', async (req, res) => {
  const presets = await loadPresets();
  const idx = presets.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' });
  presets.splice(idx, 1);
  await savePresets(presets);
  res.json({ success: true });
});

// Rename a preset
app.patch('/api/templates/presets/:id', async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ success: false, error: 'name required' });
  const presets = await loadPresets();
  const preset = presets.find(p => p.id === req.params.id);
  if (!preset) return res.status(404).json({ success: false, error: 'Not found' });
  preset.name = name;
  await savePresets(presets);
  res.json({ success: true, preset });
});

// Add a variation to a preset
app.post('/api/templates/presets/:id/variations', async (req, res) => {
  const { name, template } = req.body || {};
  if (!template) return res.status(400).json({ success: false, error: 'template required' });
  const presets = await loadPresets();
  const preset = presets.find(p => p.id === req.params.id);
  if (!preset) return res.status(404).json({ success: false, error: 'Preset not found' });
  const varId = 'var_' + Date.now();
  const variation = { id: varId, name: name || `Variation ${preset.variations.length + 1}`, template, createdAt: new Date().toISOString() };
  preset.variations.push(variation);
  await savePresets(presets);
  res.json({ success: true, variation });
});

// Update a variation (rename or update template)
app.patch('/api/templates/presets/:id/variations/:varId', async (req, res) => {
  const { name, template } = req.body || {};
  const presets = await loadPresets();
  const preset = presets.find(p => p.id === req.params.id);
  if (!preset) return res.status(404).json({ success: false, error: 'Preset not found' });
  const variation = preset.variations.find(v => v.id === req.params.varId);
  if (!variation) return res.status(404).json({ success: false, error: 'Variation not found' });
  if (name) variation.name = name;
  if (template) variation.template = template;
  await savePresets(presets);
  res.json({ success: true, variation });
});

// Delete a variation
app.delete('/api/templates/presets/:id/variations/:varId', async (req, res) => {
  const presets = await loadPresets();
  const preset = presets.find(p => p.id === req.params.id);
  if (!preset) return res.status(404).json({ success: false, error: 'Preset not found' });
  const idx = preset.variations.findIndex(v => v.id === req.params.varId);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Variation not found' });
  preset.variations.splice(idx, 1);
  await savePresets(presets);
  res.json({ success: true });
});

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

