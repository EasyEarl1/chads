// ClickTut - Tutorial Routes
// Handles all tutorial-related API endpoints

const express = require('express');
const router = express.Router();
const Tutorial = require('../models/tutorial');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

// File-based storage for persistence
const STORAGE_FILE = path.join(__dirname, '..', 'data', 'tutorials.json');

// Load tutorials from file
async function loadTutorials() {
  try {
    const dataDir = path.dirname(STORAGE_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    
    if (await fs.access(STORAGE_FILE).then(() => true).catch(() => false)) {
      const data = await fs.readFile(STORAGE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading tutorials:', error);
  }
  return { tutorials: [], counter: 0 };
}

// Save tutorials to file
async function saveTutorials(tutorials, counter) {
  try {
    const dataDir = path.dirname(STORAGE_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(STORAGE_FILE, JSON.stringify({ tutorials, counter }, null, 2));
  } catch (error) {
    console.error('Error saving tutorials:', error);
  }
}

// Initialize storage
let tutorials = [];
let tutorialCounter = 0;

// Load on startup
loadTutorials().then(data => {
  tutorials = data.tutorials || [];
  tutorialCounter = data.counter || 0;
  console.log(`📂 Loaded ${tutorials.length} tutorials from storage`);
}).catch(err => {
  console.error('Failed to load tutorials:', err);
});

// Start a new tutorial recording session
router.post('/start', async (req, res) => {
  try {
    const { title, description } = req.body;
    
    const tutorialId = `tut_${Date.now()}_${++tutorialCounter}`;
    
    const tutorial = {
      _id: tutorialId,
      title: title || 'Untitled Tutorial',
      description: description || '',
      status: 'recording',
      steps: [],
      createdAt: new Date().toISOString(),
      metadata: {
        totalDuration: 0,
        clickCount: 0
      }
    };

    tutorials.push(tutorial);
    await saveTutorials(tutorials, tutorialCounter);

    console.log(`📹 Started tutorial: ${tutorialId}`);

    res.json({
      success: true,
      tutorialId: tutorial._id,
      tutorial: tutorial
    });
  } catch (error) {
    console.error('Error starting tutorial:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Record a click event
router.post('/:id/click', async (req, res) => {
  try {
    const { id } = req.params;
    const clickData = req.body;

    console.log(`🖱️  Received click for tutorial ${id}, step ${clickData.stepNumber || 'unknown'}`);

    const tutorial = tutorials.find(t => t._id === id);
    
    if (!tutorial) {
      console.error(`❌ Tutorial ${id} not found`);
      return res.status(404).json({
        success: false,
        error: 'Tutorial not found'
      });
    }

    if (tutorial.status !== 'recording') {
      console.warn(`⚠️  Tutorial ${id} is not in recording state (status: ${tutorial.status})`);
      // Allow it anyway - might be a race condition
      // return res.status(400).json({
      //   success: false,
      //   error: 'Tutorial is not in recording state'
      // });
    }

    // Create step object - use stepNumber from clickData (assigned by background script)
    let stepNumber = clickData.stepNumber;
    
    // If no stepNumber provided, use next available (fallback)
    if (!stepNumber) {
      const maxStep = Math.max(...tutorial.steps.map(s => s.stepNumber || 0), 0);
      stepNumber = maxStep + 1;
      console.warn(`⚠️  No stepNumber in clickData, assigned ${stepNumber}`);
    }
    
    // Check for duplicate step numbers
    const existingStep = tutorial.steps.find(s => s.stepNumber === stepNumber);
    if (existingStep) {
      console.warn(`⚠️  Duplicate step number ${stepNumber} detected, using next available`);
      const maxStep = Math.max(...tutorial.steps.map(s => s.stepNumber || 0), 0);
      stepNumber = maxStep + 1;
    }
    
    // Save screenshot if provided (use the final stepNumber)
    let screenshotPath = null;
    if (clickData.screenshot) {
      screenshotPath = await saveScreenshot(id, stepNumber, clickData.screenshot);
    } else {
      console.warn(`ClickTut backend: Step ${stepNumber} recorded without screenshot (extension may have hit rate limit or permission)`);
    }
    
    const step = {
      stepNumber: stepNumber,
      timestamp: clickData.timestamp || Date.now(),
      clickData: {
        coordinates: clickData.coordinates,
        element: clickData.element,
        page: clickData.page
      },
      screenshot: screenshotPath,
      instruction: null, // Will be filled during generation
      aiDescription: null, // Will be filled during generation
      script: null // Will be filled during generation
    };

    tutorial.steps.push(step);
    tutorial.metadata.clickCount = tutorial.steps.length;
    
    // Save after each click (could be optimized to batch)
    await saveTutorials(tutorials, tutorialCounter);

    console.log(`✅ Recorded click ${step.stepNumber} for tutorial ${id} (total: ${tutorial.steps.length} steps)`);

    res.json({
      success: true,
      stepNumber: step.stepNumber,
      step: step,
      totalSteps: tutorial.steps.length
    });
  } catch (error) {
    console.error('Error recording click:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop recording
router.post('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;

    const tutorial = tutorials.find(t => t._id === id);
    
    if (!tutorial) {
      return res.status(404).json({
        success: false,
        error: 'Tutorial not found'
      });
    }

    tutorial.status = 'recording_complete';
    tutorial.completedAt = new Date().toISOString();
    const createdAt = new Date(tutorial.createdAt);
    const completedAt = new Date(tutorial.completedAt);
    tutorial.metadata.totalDuration = completedAt - createdAt;
    
    await saveTutorials(tutorials, tutorialCounter);

    console.log(`⏹️  Stopped tutorial: ${id} (${tutorial.steps.length} clicks)`);

    res.json({
      success: true,
      tutorial: tutorial,
      clickCount: tutorial.steps.length,
      tutorialId: tutorial._id
    });
  } catch (error) {
    console.error('Error stopping tutorial:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all tutorials
router.get('/', async (req, res) => {
  try {
    // Reload from file to ensure we have latest
    const data = await loadTutorials();
    tutorials = data.tutorials || [];
    
    // Return simplified list
    const tutorialList = tutorials.map(t => ({
      _id: t._id,
      title: t.title,
      status: t.status,
      clickCount: t.steps ? t.steps.length : 0,
      createdAt: t.createdAt,
      completedAt: t.completedAt
    }));

    res.json({
      success: true,
      tutorials: tutorialList,
      count: tutorialList.length
    });
  } catch (error) {
    console.error('Error getting tutorials:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Sort steps by timestamp so display order is chronological (fixes input-after-submit)
function sortStepsByTimestamp(steps) {
  if (!steps || steps.length === 0) return steps;
  const actionOrder = { input: 0, click: 1, submit: 2 }; // tie-breaker: input before submit
  return [...steps].sort((a, b) => {
    const tsA = a.timestamp || 0;
    const tsB = b.timestamp || 0;
    if (Math.abs(tsA - tsB) < 100) {
      const typeA = (a.clickData?.element?.actionType || a.clickData?.actionType) || 'click';
      const typeB = (b.clickData?.element?.actionType || b.clickData?.actionType) || 'click';
      return (actionOrder[typeA] ?? 1) - (actionOrder[typeB] ?? 1);
    }
    return tsA - tsB;
  });
}

// Get a specific tutorial (steps returned in chronological order)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Reload from file
    const data = await loadTutorials();
    tutorials = data.tutorials || [];
    
    const tutorial = tutorials.find(t => t._id === id);
    
    if (!tutorial) {
      return res.status(404).json({
        success: false,
        error: 'Tutorial not found'
      });
    }

    // Return steps sorted by timestamp so editor shows correct order (e.g. input before submit)
    const tutorialWithSortedSteps = {
      ...tutorial,
      steps: sortStepsByTimestamp(tutorial.steps || [])
    };

    res.json({
      success: true,
      tutorial: tutorialWithSortedSteps
    });
  } catch (error) {
    console.error('Error getting tutorial:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate instructions for tutorial steps
router.post('/:id/generate-instructions', async (req, res) => {
  try {
    const { id } = req.params;
    const { regenerate = false } = req.body;

    // Reload from file
    const data = await loadTutorials();
    tutorials = data.tutorials || [];
    
    const tutorial = tutorials.find(t => t._id === id);
    
    if (!tutorial) {
      return res.status(404).json({
        success: false,
        error: 'Tutorial not found'
      });
    }

    if (!tutorial.steps || tutorial.steps.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tutorial has no steps'
      });
    }

    // Check if instructions already exist
    const hasInstructions = tutorial.steps.some(s => s.instruction);
    if (hasInstructions && !regenerate) {
      return res.json({
        success: true,
        message: 'Instructions already exist. Use regenerate=true to regenerate.',
        tutorial: tutorial
      });
    }

    console.log(`🤖 Generating AI instructions for tutorial ${id}...`);

    // Import AI service
    const aiService = require('../services/ai-service');

    // Store original indices before sorting
    tutorial.steps.forEach((step, index) => {
      step._originalIndex = index; // Store original position
    });

    // Sort steps by timestamp (same logic as GET so order matches editor)
    const sortedSteps = tutorial.steps.map((step, index) => ({
      ...step,
      _originalIndex: index,
      _sortedIndex: -1
    }));
    sortedSteps.sort((a, b) => {
      const tsA = a.timestamp || 0;
      const tsB = b.timestamp || 0;
      if (Math.abs(tsA - tsB) < 100) {
        const actionOrder = { input: 0, click: 1, submit: 2 };
        const typeA = (a.clickData?.element?.actionType || a.clickData?.actionType) || 'click';
        const typeB = (b.clickData?.element?.actionType || b.clickData?.actionType) || 'click';
        return (actionOrder[typeA] ?? 1) - (actionOrder[typeB] ?? 1);
      }
      return tsA - tsB;
    });

    // Set sorted indices
    sortedSteps.forEach((step, index) => {
      step._sortedIndex = index;
      step.stepNumber = index + 1; // Reassign for AI generation
    });

    console.log(`📋 Sorted ${sortedSteps.length} steps. Original order:`, tutorial.steps.map(s => s._originalIndex));
    console.log(`📋 Sorted order:`, sortedSteps.map(s => s._originalIndex));

    // Generate instructions for all steps with tutorial title for context
    const instructions = await aiService.generateTutorialInstructions(sortedSteps, tutorial.title);

    console.log(`📊 Received ${instructions.length} instructions for ${tutorial.steps.length} steps`);

    // Apply instructions back to original steps using the stored original indices
    instructions.forEach((inst, instIndex) => {
      // Find the sorted step that matches this instruction
      const sortedStep = sortedSteps[instIndex] || sortedSteps.find(s => s.stepNumber === inst.stepNumber);
      
      if (sortedStep && sortedStep._originalIndex !== undefined) {
        const originalIndex = sortedStep._originalIndex;
        if (tutorial.steps[originalIndex]) {
          tutorial.steps[originalIndex].instruction = inst.instruction;
          console.log(`✅ Mapped instruction ${inst.stepNumber} (sorted) to original step ${originalIndex + 1}`);
        } else {
          console.warn(`⚠️  Original index ${originalIndex} out of bounds`);
        }
      } else {
        // Fallback: use index-based mapping
        if (tutorial.steps[instIndex]) {
          tutorial.steps[instIndex].instruction = inst.instruction;
          console.log(`⚠️  Fallback: mapped instruction ${inst.stepNumber} to step ${instIndex + 1} by index`);
        }
      }
    });

    // Ensure all steps have instructions - fill any missing ones
    tutorial.steps.forEach((step, index) => {
      if (!step.instruction || step.instruction.trim() === '') {
        console.warn(`⚠️  Step ${index + 1} missing instruction, adding placeholder`);
        step.instruction = `Complete step ${index + 1}`;
      }
    });

    // Clean up temporary indices
    tutorial.steps.forEach(step => {
      delete step._originalIndex;
      delete step._sortedIndex;
    });

    tutorial.status = tutorial.status === 'recording_complete' ? 'instructions_generated' : tutorial.status;
    
    await saveTutorials(tutorials, tutorialCounter);

    console.log(`✅ Generated instructions for ${instructions.length} steps`);

    res.json({
      success: true,
      message: `Generated instructions for ${instructions.length} steps`,
      tutorial: tutorial
    });
  } catch (error) {
    console.error('Error generating instructions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update a tutorial (for editing)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Reload from file
    const data = await loadTutorials();
    tutorials = data.tutorials || [];
    
    const tutorial = tutorials.find(t => t._id === id);
    
    if (!tutorial) {
      return res.status(404).json({
        success: false,
        error: 'Tutorial not found'
      });
    }

    // Update tutorial fields
    if (updates.title !== undefined) tutorial.title = updates.title;
    if (updates.description !== undefined) tutorial.description = updates.description;
    if (updates.steps !== undefined) {
      tutorial.steps = updates.steps;
      tutorial.metadata.clickCount = updates.steps.length;
    }
    if (updates.status !== undefined) tutorial.status = updates.status;

    await saveTutorials(tutorials, tutorialCounter);

    console.log(`✏️  Updated tutorial: ${id}`);

    res.json({
      success: true,
      tutorial: tutorial
    });
  } catch (error) {
    console.error('Error updating tutorial:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete a tutorial
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const index = tutorials.findIndex(t => t._id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Tutorial not found'
      });
    }

    // Delete associated files
    await deleteTutorialFiles(id);

    tutorials.splice(index, 1);
    await saveTutorials(tutorials, tutorialCounter);

    console.log(`🗑️  Deleted tutorial: ${id}`);

    res.json({
      success: true,
      message: 'Tutorial deleted'
    });
  } catch (error) {
    console.error('Error deleting tutorial:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to save screenshot
async function saveScreenshot(tutorialId, stepNumber, base64Data) {
  try {
    const screenshotsDir = process.env.SCREENSHOTS_PATH || './screenshots';
    const tutorialDir = path.join(screenshotsDir, tutorialId);
    
    await fs.mkdir(tutorialDir, { recursive: true });

    // Remove data URL prefix if present
    const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Image, 'base64');
    
    const filename = `step_${stepNumber}_${Date.now()}.png`;
    const filepath = path.join(tutorialDir, filename);

    await fs.writeFile(filepath, buffer);

    return filepath;
  } catch (error) {
    console.error('Error saving screenshot:', error);
    return null;
  }
}

/**
 * Create a smart zoom crop around the element: 16:9, centered on element, with context buffer.
 * Returns { zoomPath, crop } so the published page can recalc the red box for the cropped image.
 */
async function createSmartZoom(fullImagePath, elementRect, viewport, tutorialDir, stepNum) {
  try {
    const resolved = path.isAbsolute(fullImagePath) ? fullImagePath : path.resolve(process.cwd(), fullImagePath);
    const buf = await fs.readFile(resolved);
    const meta = await sharp(buf).metadata();
    const imgW = meta.width || viewport.width;
    const imgH = meta.height || viewport.height;
    const scaleX = imgW / (viewport.width || 1);
    const scaleY = imgH / (viewport.height || 1);
    const elLeft = elementRect.left * scaleX;
    const elTop = elementRect.top * scaleY;
    const elW = elementRect.width * scaleX;
    const elH = elementRect.height * scaleY;
    const cx = elLeft + elW / 2;
    const cy = elTop + elH / 2;
    const buffer = 200;
    let cropW = Math.max(elW + buffer * 2, elW * 2.5);
    let cropH = Math.max(elH + buffer * 2, elH * 2.5);
    if (cropW / cropH > 16 / 9) cropH = cropW * (9 / 16);
    else cropW = cropH * (16 / 9);
    let left = Math.round(cx - cropW / 2);
    let top = Math.round(cy - cropH / 2);
    left = Math.max(0, Math.min(imgW - cropW, left));
    top = Math.max(0, Math.min(imgH - cropH, top));
    const width = Math.round(Math.min(cropW, imgW - left));
    const height = Math.round(Math.min(cropH, imgH - top));
    if (width < 20 || height < 20) return null;
    const zoomFilename = `step_${stepNum}_zoom.png`;
    const zoomPath = path.join(tutorialDir, zoomFilename);
    await sharp(buf)
      .extract({ left, top, width, height })
      .png()
      .toFile(zoomPath);
    return { zoomPath, crop: { left, top, width, height }, imgW, imgH };
  } catch (err) {
    console.warn('ClickTut: createSmartZoom failed', err.message);
    return null;
  }
}

// Publish tutorial as Brevo-style help article (HTML page)
router.post('/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await loadTutorials();
    tutorials = data.tutorials || [];
    const tutorial = tutorials.find(t => t._id === id);
    if (!tutorial) {
      return res.status(404).json({ success: false, error: 'Tutorial not found' });
    }
    const steps = sortStepsByTimestamp(tutorial.steps || []);
    if (steps.length === 0) {
      return res.status(400).json({ success: false, error: 'Tutorial has no steps' });
    }

    const aiService = require('../services/ai-service');
    const narrative = await aiService.generatePublishNarrative(tutorial);

    const baseUrl = req.protocol + '://' + req.get('host');
    const apiBase = baseUrl + '/api/tutorials/' + encodeURIComponent(id);

    const tocItems = steps.map((s, i) => ({
      num: i + 1,
      text: (s.instruction || `Step ${i + 1}`).replace(/<[^>]+>/g, '').substring(0, 80)
    }));

    const isLandingInstruction = (text) => /^(Start on|Ensure you'?re on|Open the|Open your|Navigate to the)/i.test((text || '').trim());

    const tutorialDir = steps[0]?.screenshot ? path.dirname(path.resolve(steps[0].screenshot)) : null;
    const zooms = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepNum = step.stepNumber || i + 1;
      const dims = step.clickData?.element?.dimensions;
      const viewport = step.clickData?.page?.viewport || {};
      if (tutorialDir && step.screenshot && dims && viewport.width && viewport.height) {
        const z = await createSmartZoom(step.screenshot, dims, viewport, tutorialDir, stepNum);
        zooms.push(z);
      } else {
        zooms.push(null);
      }
    }

    const stepSections = steps.map((step, index) => {
      const stepNum = step.stepNumber || index + 1;
      const rawInstruction = step.instruction || `Step ${stepNum}`;
      const instruction = rawInstruction.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const page = step.clickData?.page || {};
      const coords = step.clickData?.coordinates || {};
      const element = step.clickData?.element || {};
      const dims = element.dimensions || null;
      const viewport = page.viewport || { width: 1, height: 1 };
      const zoom = zooms[index];

      let boxLeft = 10;
      let boxTop = 10;
      let boxW = 14;
      let boxH = 8;
      let showHighlight = true;

      if (index === 0 && isLandingInstruction(rawInstruction)) {
        showHighlight = false;
      } else if (element.isInteractive === false && index === 0) {
        showHighlight = false;
      }

      if (zoom && dims && viewport.width && viewport.height) {
        const scaleX = zoom.imgW / viewport.width;
        const scaleY = zoom.imgH / viewport.height;
        const elLeft = dims.left * scaleX;
        const elTop = dims.top * scaleY;
        const elW = dims.width * scaleX;
        const elH = dims.height * scaleY;
        const pad = 8;
        const padX = pad * scaleX;
        const padY = pad * scaleY;
        boxLeft = Math.max(0, ((elLeft - zoom.crop.left - padX) / zoom.crop.width) * 100);
        boxTop = Math.max(0, ((elTop - zoom.crop.top - padY) / zoom.crop.height) * 100);
        boxW = Math.min(100 - boxLeft, ((elW + padX * 2) / zoom.crop.width) * 100);
        boxH = Math.min(100 - boxTop, ((elH + padY * 2) / zoom.crop.height) * 100);
        if (boxW > 55 || boxH > 55) showHighlight = false;
      } else if (dims && viewport.width && viewport.height) {
        const leftPct = (dims.left / viewport.width) * 100;
        const topPct = (dims.top / viewport.height) * 100;
        const widthPct = (dims.width / viewport.width) * 100;
        const heightPct = (dims.height / viewport.height) * 100;
        const padPx = 8;
        const padXPct = (padPx / viewport.width) * 100;
        const padYPct = (padPx / viewport.height) * 100;
        boxLeft = Math.max(0, leftPct - padXPct);
        boxTop = Math.max(0, topPct - padYPct);
        boxW = Math.min(100 - boxLeft, widthPct + padXPct * 2);
        boxH = Math.min(100 - boxTop, heightPct + padYPct * 2);
        if (boxW > 55 || boxH > 55) showHighlight = false;
      } else {
        const x = coords.x != null ? coords.x : 0;
        const y = coords.y != null ? coords.y : 0;
        const leftPct = viewport.width ? (x / viewport.width) * 100 : 0;
        const topPct = viewport.height ? (y / viewport.height) * 100 : 0;
        boxW = 14;
        boxH = 8;
        boxLeft = Math.max(0, Math.min(100 - boxW, leftPct - boxW / 2));
        boxTop = Math.max(0, Math.min(100 - boxH, topPct - boxH / 2));
      }

      const fullScreenshotUrl = step.screenshot ? `${apiBase}/screenshots/${stepNum}` : '';
      const screenshotUrl = zoom ? `${apiBase}/screenshots/${stepNum}/zoom` : fullScreenshotUrl;
      const pageTitle = page.title ? `<p class="step-page-title">${String(page.title).replace(/<[^>]+>/g, '')}</p>` : '';
      const highlightHtml = showHighlight
        ? `<div class="highlight-box" style="left:${boxLeft}%;top:${boxTop}%;width:${boxW}%;height:${boxH}%;"></div>`
        : '';

      const imgBlock = step.screenshot
        ? `
                <img src="${screenshotUrl}" alt="Step ${index + 1}" class="step-screenshot" loading="lazy" data-full-url="${fullScreenshotUrl}" />
                ${highlightHtml}
                ${zoom ? `<button type="button" class="view-full-btn" title="View full screenshot" data-full-url="${fullScreenshotUrl}">↗ Full screen</button>` : ''}
              `
        : '<div class="no-screenshot">Screenshot not available</div>';

      return `
        <section class="step-section" id="step-${index + 1}">
          <h2 class="step-heading"><span class="step-badge">${index + 1}</span> ${instruction}</h2>
          ${pageTitle}
          <div class="screenshot-wrap">
            <div class="screenshot-container">
              ${imgBlock}
            </div>
          </div>
        </section>`;
    }).join('\n');

    const prereqsHtml = narrative.prerequisites.length
      ? `<div class="prerequisites"><h3>Before you start</h3><ul>${narrative.prerequisites.map(p => `<li>${String(p).replace(/</g, '&lt;')}</li>`).join('')}</ul></div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${String(narrative.title).replace(/<[^>]+>/g, '')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter', -apple-system, sans-serif; color: #1a1a1a; line-height: 1.6; background: #f8f9fa; }
    .layout { display: flex; max-width: 1200px; margin: 0 auto; min-height: 100vh; }
    .sidebar { width: 260px; flex-shrink: 0; padding: 24px 16px; position: sticky; top: 0; height: 100vh; overflow-y: auto; background: #fff; border-right: 1px solid #e5e7eb; }
    .sidebar h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 0 0 12px 0; }
    .toc a { display: block; padding: 8px 12px; border-radius: 6px; color: #374151; text-decoration: none; font-size: 0.9rem; }
    .toc a:hover { background: #f3f4f6; }
    .toc a.active { background: #eef2ff; color: #4338ca; font-weight: 600; }
    .main { flex: 1; padding: 40px 48px 80px; }
    .article { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); padding: 48px 56px; }
    h1 { font-size: 1.75rem; font-weight: 700; margin: 0 0 16px 0; }
    .intro { font-size: 1.05rem; color: #4b5563; margin: 0 0 24px 0; }
    .prerequisites { margin: 0 0 32px 0; padding: 20px 24px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #0ea5e9; }
    .prerequisites h3 { font-size: 0.95rem; margin: 0 0 8px 0; color: #0c4a6e; }
    .prerequisites ul { margin: 0; padding-left: 20px; color: #374151; }
    .step-section { margin: 0 0 40px 0; }
    .step-section:last-child { margin-bottom: 0; }
    .step-heading { font-size: 1.15rem; font-weight: 600; margin: 0 0 8px 0; display: flex; align-items: center; gap: 12px; }
    .step-badge { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #4338ca; color: #fff; font-size: 0.85rem; font-weight: 700; flex-shrink: 0; }
    .step-page-title { font-size: 0.85rem; color: #6b7280; margin: 0 0 12px 0; }
    .screenshot-wrap { margin-top: 12px; }
    .screenshot-container { position: relative; display: inline-block; max-width: 100%; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .step-screenshot { display: block; max-width: 100%; height: auto; border-radius: 12px; }
    .highlight-box { position: absolute; border: 2px solid #dc2626; border-radius: 4px; pointer-events: none; box-shadow: 0 0 0 2px rgba(220,38,38,0.3); }
    .view-full-btn { position: absolute; top: 10px; right: 10px; padding: 6px 12px; background: rgba(0,0,0,0.6); color: #fff; font-size: 0.8rem; border: none; cursor: pointer; border-radius: 8px; z-index: 2; }
    .view-full-btn:hover { background: rgba(0,0,0,0.8); color: #fff; }
    .screenshot-modal { display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.85); align-items: center; justify-content: center; padding: 20px; }
    .screenshot-modal.open { display: flex; }
    .screenshot-modal img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; }
    .screenshot-modal-close { position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; background: rgba(255,255,255,0.2); border: none; border-radius: 50%; color: #fff; font-size: 1.5rem; cursor: pointer; line-height: 1; }
    .screenshot-modal-close:hover { background: rgba(255,255,255,0.3); }
    .no-screenshot { padding: 40px; background: #f3f4f6; color: #6b7280; text-align: center; border-radius: 8px; }
    @media (max-width: 768px) { .layout { flex-direction: column; } .sidebar { position: relative; height: auto; width: 100%; } }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <h3>On this page</h3>
      <nav class="toc">
        ${tocItems.map((item, i) => `<a href="#step-${i + 1}" class="toc-link" data-step="${i + 1}">${item.num}. ${item.text}</a>`).join('')}
      </nav>
    </aside>
    <main class="main">
      <article class="article">
        <h1>${String(narrative.title).replace(/<[^>]+>/g, '')}</h1>
        <p class="intro">${String(narrative.intro).replace(/<[^>]+>/g, '') || 'Follow the steps below.'}</p>
        ${prereqsHtml}
        ${stepSections}
      </article>
    </main>
  </div>
  <div id="screenshot-modal" class="screenshot-modal" aria-hidden="true">
    <button type="button" class="screenshot-modal-close" aria-label="Close">&times;</button>
    <img src="" alt="Full screenshot" />
  </div>
  <script>
    (function() {
      var links = document.querySelectorAll('.toc-link');
      function updateActive() {
        var sections = document.querySelectorAll('.step-section');
        var scrollY = window.scrollY;
        for (var i = sections.length - 1; i >= 0; i--) {
          if (sections[i].offsetTop - 100 <= scrollY) {
            links.forEach(function(l) { l.classList.remove('active'); });
            var a = document.querySelector('.toc-link[data-step="' + (i + 1) + '"]');
            if (a) a.classList.add('active');
            break;
          }
        }
      }
      window.addEventListener('scroll', updateActive);
      updateActive();

      var modal = document.getElementById('screenshot-modal');
      var modalImg = modal && modal.querySelector('img');
      var modalClose = modal && modal.querySelector('.screenshot-modal-close');
      document.querySelectorAll('.view-full-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var url = this.getAttribute('data-full-url');
          if (modal && modalImg && url) {
            modalImg.src = url;
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
          }
        });
      });
      function closeModal() {
        if (modal) {
          modal.classList.remove('open');
          modal.setAttribute('aria-hidden', 'true');
          if (modalImg) modalImg.src = '';
        }
      }
      if (modalClose) modalClose.addEventListener('click', closeModal);
      if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
    })();
  </script>
</body>
</html>`;

    const publishedDir = path.join(__dirname, '..', '..', 'published');
    await fs.mkdir(publishedDir, { recursive: true });
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(publishedDir, safeId + '.html');
    await fs.writeFile(filePath, html, 'utf8');

    const publicUrl = baseUrl + '/published/' + safeId + '.html';
    console.log('ClickTut: Published', id, '->', publicUrl);
    res.json({ success: true, url: publicUrl });
  } catch (error) {
    console.error('Error publishing tutorial:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve screenshots
router.get('/:id/screenshots/:stepNumber', async (req, res) => {
  try {
    const { id, stepNumber } = req.params;
    
    const data = await loadTutorials();
    tutorials = data.tutorials || [];
    
    const tutorial = tutorials.find(t => t._id === id);
    if (!tutorial) {
      return res.status(404).send('Tutorial not found');
    }

    const step = tutorial.steps.find(s => 
      (s.stepNumber || 0) === parseInt(stepNumber)
    );
    
    if (!step || !step.screenshot) {
      return res.status(404).send('Screenshot not found');
    }

    const fs = require('fs');
    const screenshotPath = path.resolve(step.screenshot);
    
    if (!fs.existsSync(screenshotPath)) {
      return res.status(404).send('Screenshot file not found');
    }

    res.sendFile(screenshotPath);
  } catch (error) {
    console.error('Error serving screenshot:', error);
    res.status(500).send('Error serving screenshot');
  }
});

// Serve zoomed screenshot (cropped around element) if available
router.get('/:id/screenshots/:stepNumber/zoom', async (req, res) => {
  try {
    const { id, stepNumber } = req.params;
    const data = await loadTutorials();
    tutorials = data.tutorials || [];
    const tutorial = tutorials.find(t => t._id === id);
    if (!tutorial) return res.status(404).send('Tutorial not found');
    const step = tutorial.steps.find(s => (s.stepNumber || 0) === parseInt(stepNumber));
    if (!step || !step.screenshot) return res.status(404).send('Screenshot not found');
    const tutorialDir = path.dirname(path.resolve(step.screenshot));
    const zoomPath = path.resolve(path.join(tutorialDir, `step_${stepNumber}_zoom.png`));
    try {
      await fs.access(zoomPath);
      return res.sendFile(zoomPath);
    } catch (_) {
      const fullUrl = `${req.protocol}://${req.get('host')}/api/tutorials/${encodeURIComponent(id)}/screenshots/${stepNumber}`;
      return res.redirect(302, fullUrl);
    }
  } catch (error) {
    console.error('Error serving zoom screenshot:', error);
    res.status(500).send('Error serving screenshot');
  }
});

// Helper function to delete tutorial files
async function deleteTutorialFiles(tutorialId) {
  try {
    const screenshotsDir = process.env.SCREENSHOTS_PATH || './screenshots';
    const tutorialDir = path.join(screenshotsDir, tutorialId);
    
    try {
      await fs.rm(tutorialDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, ignore
    }
  } catch (error) {
    console.error('Error deleting tutorial files:', error);
  }
}

module.exports = router;
