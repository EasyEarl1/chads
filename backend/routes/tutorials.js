// ClickTut - Tutorial Routes
// Handles all tutorial-related API endpoints

const express = require('express');
const router = express.Router();
const Tutorial = require('../models/tutorial');
const fs = require('fs').promises;
const path = require('path');

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
