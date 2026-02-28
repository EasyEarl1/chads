// ClickTut - AI Service
// Generates step-by-step instructions using Replicate API + optional Gemini vision for screenshot context

const Replicate = require('replicate');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

// Mask sensitive information (usernames, emails, tokens)
function maskSensitiveData(text) {
  if (!text || typeof text !== 'string') return text;
  
  let masked = text;
  
  // Mask email addresses
  masked = masked.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
  
  // Mask API tokens (long alphanumeric strings, typically 20+ chars)
  masked = masked.replace(/\b[A-Za-z0-9_-]{20,}\b/g, '[API_TOKEN]');
  
  // Mask usernames - be VERY conservative, only mask actual usernames
  // Usernames are typically: lowercase, 3-20 chars, alphanumeric, often in specific contexts
  // We should NOT mask common words, UI elements, or technical terms
  
  // Extensive list of words to NEVER mask
  const neverMask = [
    // Technical terms
    'api', 'key', 'token', 'name', 'id', 'url', 'http', 'https', 'www', 'com', 'org', 'net',
    // UI elements
    'click', 'button', 'submit', 'form', 'input', 'text', 'field', 'value', 'type', 'role', 
    'href', 'src', 'alt', 'aria', 'label', 'data', 'test', 'create', 'delete', 'edit', 
    'save', 'cancel', 'close', 'open', 'menu', 'item', 'select', 'option', 'div', 'span', 
    'p', 'a', 'img', 'svg', 'path', 'view', 'dashboard', 'account', 'settings', 'profile', 
    'avatar', 'user', 'icon', 'copy', 'paste', 'replicate', 'deploy', 'model', 'run', 'version',
    // Common words
    'the', 'and', 'or', 'for', 'with', 'from', 'to', 'in', 'on', 'at', 'by', 'of', 'is', 
    'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'must', 'this', 'that', 'these', 'those',
    // Action words
    'enter', 'type', 'click', 'select', 'choose', 'navigate', 'go', 'open', 'close', 'save',
    'cancel', 'delete', 'edit', 'create', 'update', 'add', 'remove', 'copy', 'paste', 'cut',
    // Common UI text
    'recent', 'deployments', 'no', 'yes', 'ok', 'cancel', 'submit', 'confirm', 'back', 'next',
    'previous', 'first', 'last', 'new', 'old', 'all', 'none', 'some', 'any', 'each', 'every'
  ];
  
  // Only mask if it looks like a username AND is not in the never-mask list
  // Usernames are typically: 3-20 chars, lowercase alphanumeric, not common words
  masked = masked.replace(/\b([a-z0-9_-]{3,20})\b/g, (match) => {
    const lowerMatch = match.toLowerCase();
    
    // Never mask common words
    if (neverMask.includes(lowerMatch)) {
      return match;
    }
    
    // Never mask if it contains numbers (likely not a username)
    if (/\d/.test(match)) {
      return match;
    }
    
    // Never mask if it contains underscores or hyphens in the middle (likely technical)
    if (match.includes('_') || match.includes('-')) {
      return match;
    }
    
    // Only mask if it's a simple lowercase word that's not common
    // This is very conservative - we'll only mask things that are clearly usernames
    // In practice, we should only mask usernames when they appear in profile/account contexts
    // For now, we'll be very conservative and NOT mask most things
    return match;
  });
  
  return masked;
}

class AIService {
  constructor() {
    // Initialize Replicate if key is available
    if (process.env.REPLICATE_API_TOKEN) {
      this.replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN
      });
      this.provider = 'replicate';
      this.model = "google/gemini-2.5-flash";
    } else {
      this.provider = null;
      console.warn('⚠️  No Replicate API token found. Set REPLICATE_API_TOKEN in .env');
    }
    // Vision analysis reuses Replicate with gemini-2.5-flash (supports image input)
    this.visionEnabled = !!this.replicate;
  }

  /**
   * Detect if step 1 looks like a "landing" click (user establishing context on a page, not a real UI action).
   * E.g. clicking on "No deployments found" on a dashboard = they're just starting on that page.
   */
  isLikelyLandingStep(stepIndex, element, page) {
    if (stepIndex !== 0) return false;
    const tag = (element.tag || '').toLowerCase();
    const role = (element.attributes?.role || element.ariaRole || '').toLowerCase();
    const text = (element.text || '').trim();
    const nonInteractiveTags = ['p', 'div', 'span', 'section', 'main'];
    const looksLikeEmptyState = /\b(no|zero)\s+.+\s+(found|yet|here|available)\b/i.test(text) ||
      /no\s+deployments/i.test(text) || /no\s+items/i.test(text) || /nothing\s+to\s+show/i.test(text);
    const isInteractive = role === 'button' || role === 'link' || role === 'menuitem' ||
      tag === 'a' || tag === 'button' || tag === 'input' || tag === 'select';
    return nonInteractiveTags.includes(tag) && !isInteractive && (looksLikeEmptyState || !text || text.length < 10);
  }

  /**
   * Analyze a screenshot with Gemini vision. Optionally sends a 200x200 crop at click coords to focus on the element (Gemini recommendation).
   */
  async analyzeScreenshotWithVision(screenshotPath, stepIndex = 0, stepForCrop = null) {
    if (!this.visionEnabled || !screenshotPath) return null;
    try {
      const resolved = path.isAbsolute(screenshotPath)
        ? screenshotPath
        : path.resolve(process.cwd(), screenshotPath);
      const buffer = await fs.readFile(resolved);
      const coords = stepForCrop?.clickData?.coordinates;
      const viewport = stepForCrop?.clickData?.page?.viewport;
      let imageBase64 = buffer.toString('base64');
      if (coords && viewport && typeof coords.x === 'number' && typeof coords.y === 'number' && stepIndex > 0) {
        try {
          const meta = await sharp(buffer).metadata();
          const w = meta.width || viewport.width || 0;
          const h = meta.height || viewport.height || 0;
          const size = 200;
          const left = Math.max(0, Math.min(w - size, Math.round(coords.x - size / 2)));
          const top = Math.max(0, Math.min(h - size, Math.round(coords.y - size / 2)));
          const cropW = Math.min(size, w - left);
          const cropH = Math.min(size, h - top);
          if (cropW >= 20 && cropH >= 20) {
            const cropBuffer = await sharp(buffer)
              .extract({ left, top, width: cropW, height: cropH })
              .png()
              .toBuffer();
            imageBase64 = cropBuffer.toString('base64');
          }
        } catch (e) {
          // fallback to full image
        }
      }
      const isFirstStep = stepIndex === 0;
      const prompt = isFirstStep
        ? `This is the FIRST step of a tutorial. Describe in 1-2 sentences: what page or app this is (e.g. "Replicate dashboard", "GitHub home"), and whether the user is simply starting here (e.g. "User is on the dashboard ready to start"). If it looks like a main/dashboard/home page with no specific button clicked yet, say so. Be concise.`
        : `This image shows the element the user clicked (or a crop around it). I have recorded a click on a specific element. If that element is part of a larger logical UI component (like a card, menu item, or dashboard tile), describe the ENTIRE component so the highlight box can frame it (e.g. "The user clicked the 'Abandoned cart' card – the whole white card with border is the target"). In 2-3 short sentences: 1) What is this element or component (button, icon, link, field, card, tile)? 2) What does clicking or using it do? Be concise.`;
      const imageDataUrl = `data:image/png;base64,${imageBase64}`;
      const output = await this.replicate.run('google/gemini-2.5-flash', {
        input: { prompt, image: imageDataUrl }
      });
      const text = Array.isArray(output) ? output.join('') : String(output || '');
      return text ? text.trim() : null;
    } catch (err) {
      console.warn('ClickTut: Vision analysis failed for', screenshotPath, err.message);
      return null;
    }
  }

  // Generate instructions for a single step
  async generateStepInstruction(step, stepNumber, totalSteps) {
    if (!this.provider) {
      throw new Error('No AI provider configured. Please set REPLICATE_API_TOKEN');
    }

    const element = step.clickData?.element || {};
    const page = step.clickData?.page || {};
    const coordinates = step.clickData?.coordinates || {};

    // Build context description
    const context = this.buildStepContext(step, element, page, coordinates);
    const prompt = this.buildPrompt(context, stepNumber, totalSteps);

    try {
      return await this.generateWithReplicate(prompt);
    } catch (error) {
      console.error('AI generation error:', error);
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  /**
   * Two-pass: get high-level goal of the sequence so step instructions stay cohesive (Gemini recommendation).
   */
  async getHighLevelGoal(steps, tutorialTitle = null) {
    if (!this.provider || !steps.length) return null;
    const summary = steps.map((s, i) => {
      const el = s.clickData?.element || {};
      const page = s.clickData?.page || {};
      const action = el.actionType || 'click';
      const label = el.text || el.ariaLabel || el.attributes?.title || el.placeholder || (el.tag || 'element');
      const short = typeof label === 'string' ? label.substring(0, 50) : 'element';
      return `Step ${i + 1}: ${action} on "${short}" (page: ${page.title || page.url || '?'})`;
    }).join('. ');
    const prompt = `Given this sequence of user actions: ${summary}. ${tutorialTitle ? `Tutorial title: "${tutorialTitle}".` : ''} What is the high-level goal of this sequence in one short sentence? (e.g. "The user is adding a new API key", "The user is logging in and changing settings"). Reply with ONLY that one sentence, no other text.`;
    try {
      const out = await this.generateWithReplicate(prompt);
      const goal = (out || '').trim().replace(/^["']|["']$/g, '');
      if (goal) {
        console.log('🎯 High-level goal:', goal);
        return goal;
      }
    } catch (e) {
      console.warn('ClickTut: Goal pass failed', e.message);
    }
    return null;
  }

  // Generate instructions for all steps in a tutorial
  async generateTutorialInstructions(steps, tutorialTitle = null) {
    if (!this.provider) {
      throw new Error('No AI provider configured. Please set REPLICATE_API_TOKEN');
    }

    // Pass 1: get high-level goal so instructions are cohesive
    const highLevelGoal = await this.getHighLevelGoal(steps, tutorialTitle);

    // Optional: run vision analysis on each screenshot for better context (parallel)
    let imageAnalyses = [];
    if (this.visionEnabled) {
      console.log('📸 Running AI image analysis on screenshots for extra context...');
      imageAnalyses = await Promise.all(
        steps.map((step, i) =>
          step.screenshot ? this.analyzeScreenshotWithVision(step.screenshot, i, step) : Promise.resolve(null)
        )
      );
    }

    // Build rich context for all steps (DOM + optional image analysis)
    const stepsContext = steps.map((step, index) => {
      const element = step.clickData?.element || {};
      const page = step.clickData?.page || {};
      const coordinates = step.clickData?.coordinates || {};
      const viewport = page.viewport || {};
      
      return {
        stepNumber: index + 1,
        element: {
          tag: element.tag,
          id: element.id,
          classes: element.classes || [],
          text: element.text,
          selector: element.selector,
          selectorStack: element.selectorStack || null,
          contextSandwich: element.contextSandwich || null,
          attributes: element.attributes || {},
          actionType: element.actionType || 'click',
          inputType: element.inputType || null,
          inputValue: element.inputValue || null,
          placeholder: element.placeholder || null,
          label: element.label || null,
          isImage: element.isImage || false,
          imageInfo: element.imageInfo || null,
          parentContext: element.parentContext || null,
          childContext: element.childContext || null
        },
        page: {
          title: page.title,
          url: page.url,
          pageHeading: page.pageHeading || null,
          viewport: viewport
        },
        clickLocation: {
          x: coordinates.x,
          y: coordinates.y,
          pageX: coordinates.pageX,
          pageY: coordinates.pageY,
          elementX: coordinates.elementX,
          elementY: coordinates.elementY,
          elementPercentX: coordinates.elementPercentX,
          elementPercentY: coordinates.elementPercentY
        },
        hasScreenshot: !!step.screenshot,
        timestamp: step.timestamp,
        imageAnalysis: imageAnalyses[index] || null,
        likelyLandingStep: this.isLikelyLandingStep(index, element, page)
      };
    });

    const prompt = this.buildTutorialPrompt(stepsContext, tutorialTitle, highLevelGoal);
    
    // Debug: Log the prompt to see what we're sending (first 1000 chars)
    if (prompt && typeof prompt === 'string') {
      console.log('📝 AI Prompt (first 1000 chars):', prompt.substring(0, 1000));
    } else {
      console.error('❌ Error: buildTutorialPrompt returned invalid value:', typeof prompt);
      throw new Error('Failed to build AI prompt');
    }

    try {
      return await this.generateTutorialWithReplicate(prompt, steps.length);
    } catch (error) {
      console.error('AI generation error:', error);
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  // Build context description for a step
  buildStepContext(step, element, page, coordinates) {
    let context = `Step ${step.stepNumber || 'N/A'}:\n`;
    context += `- Page: ${page.title || 'Unknown'} (${page.url || 'N/A'})\n`;
    context += `- Element clicked: ${element.tag || 'unknown'}`;
    
    if (element.id) context += ` with ID "${element.id}"`;
    if (element.classes && element.classes.length > 0) {
      context += ` with classes: ${element.classes.join(', ')}`;
    }
    if (element.text && typeof element.text === 'string') {
      context += `\n- Element text: "${element.text.substring(0, 100)}"`;
    }
    if (element.selector) context += `\n- CSS selector: ${element.selector}`;
    
    context += `\n- Click coordinates: (${coordinates.x || 'N/A'}, ${coordinates.y || 'N/A'})`;
    
    return context;
  }

  // Build prompt for single step
  buildPrompt(context, stepNumber, totalSteps) {
    return `You are analyzing a user's interaction with a web application to create clear, concise tutorial instructions.

${context}

Generate a brief, instructional description of what the user should do at this step. The instruction should be:
- Clear and actionable (e.g., "Click the 'Add Product' button")
- Concise (1-2 sentences maximum)
- Friendly and professional
- Written in second person ("Click...", "Select...", "Enter...")

Step ${stepNumber} of ${totalSteps}:

Instruction:`;
  }

  // Build prompt for entire tutorial (with optional high-level goal from two-pass)
  buildTutorialPrompt(stepsContext, tutorialTitle = null, highLevelGoal = null) {
    // Safety check
    if (!stepsContext || !Array.isArray(stepsContext) || stepsContext.length === 0) {
      console.error('❌ Error: stepsContext is invalid:', stepsContext);
      throw new Error('Invalid stepsContext: must be a non-empty array');
    }

    let prompt = `You are analyzing a user's interaction with a web application to create a step-by-step tutorial.

${tutorialTitle ? `TUTORIAL TITLE: "${tutorialTitle}"\n` : ''}
${highLevelGoal ? `TUTORIAL GOAL: ${highLevelGoal}\nUse this goal so each step instruction fits the overall purpose.\n` : ''}
OVERVIEW: The user performed ${stepsContext.length} sequential actions to complete a task. Analyze the full workflow to understand the goal and create clear instructions.

FEW-SHOT STYLE (mimic intent and outcome):
- Context: User clicked <button> "Save" inside "Profile Settings" form, next to "Cancel". Goal: saving profile.
  Instruction: "Click 'Save' to save your profile changes."
- Context: User clicked icon (copy) next to API key value. Page: API tokens. Goal: adding API key.
  Instruction: "Click the copy icon to copy the API key to your clipboard."
- Context: User typed in "Token name" field, then clicked "Create token". Goal: adding API key.
  Instruction (type step): "Enter a name for your token in the 'Token name' field."
- Context: Step 1 – user clicked on paragraph "No deployments found" on Dashboard. Goal: getting started.
  Instruction: "Open the Replicate dashboard (or ensure you're on the home page)."

The complete sequence of actions:

${stepsContext.map((ctx, idx) => {
  const element = ctx.element || {};
  const page = ctx.page || {};
  const click = ctx.clickLocation || {};
  const viewport = page.viewport || {};
  
  let stepInfo = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  stepInfo += `STEP ${idx + 1} of ${stepsContext.length}\n`;
  stepInfo += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // Page context (incl. page heading for "where am I" - Gemini recommendation)
  stepInfo += `📍 PAGE CONTEXT:\n`;
  stepInfo += `   Title: "${page.title || 'Unknown'}"\n`;
  stepInfo += `   URL: ${page.url || 'N/A'}\n`;
  if (page.pageHeading) stepInfo += `   Page heading: "${page.pageHeading}"\n`;
  if (viewport.width && viewport.height) {
    stepInfo += `   Viewport: ${viewport.width}x${viewport.height} pixels\n`;
  }
  stepInfo += `\n`;
  
  // Click location
  stepInfo += `🖱️  CLICK LOCATION:\n`;
  if (click.x !== undefined && click.y !== undefined) {
    stepInfo += `   Coordinates: (${click.x}, ${click.y}) pixels from top-left\n`;
    if (viewport.width && viewport.height) {
      const percentX = ((click.x / viewport.width) * 100).toFixed(1);
      const percentY = ((click.y / viewport.height) * 100).toFixed(1);
      stepInfo += `   Position: ${percentX}% from left, ${percentY}% from top\n`;
    }
  }
  stepInfo += `\n`;
  
  // Element details (context sandwich = intent-focused description - Gemini recommendation)
  const actionType = element.actionType || 'click';
  stepInfo += `🎯 ELEMENT ${actionType.toUpperCase()}:\n`;
  if (element.contextSandwich) stepInfo += `   Context: ${element.contextSandwich}\n`;
  stepInfo += `   Type: <${element.tag || 'unknown'}>\n`;
  
  // Image/Icon detection context
  if (element.isImage) {
    stepInfo += `   🖼️  IMAGE/ICON DETECTED:\n`;
    if (element.imageInfo) {
      if (element.imageInfo.src) {
        stepInfo += `      Image Source: ${element.imageInfo.src.substring(0, 100)}\n`;
      }
      if (element.imageInfo.alt) {
        stepInfo += `      Alt Text: "${element.imageInfo.alt}"\n`;
      }
      if (element.imageInfo.detectedBy) {
        stepInfo += `      Detected by: ${element.imageInfo.detectedBy}\n`;
      }
      if (element.imageInfo.iconClasses && element.imageInfo.iconClasses.length > 0) {
        stepInfo += `      Icon Classes: ${element.imageInfo.iconClasses.join(', ')}\n`;
      }
    }
    if (element.childContext && element.childContext.hasImage) {
      stepInfo += `      Contains child image: ${element.childContext.imageAlt || 'image'}\n`;
      if (element.childContext.imageSrc) {
        stepInfo += `      Child image source: ${element.childContext.imageSrc.substring(0, 80)}\n`;
      }
    }
    if (element.parentContext && element.parentContext.hasImage) {
      stepInfo += `      Parent element contains image (${element.parentContext.parentTag})\n`;
    }
    stepInfo += `\n`;
  }
  
  if (element.text && typeof element.text === 'string' && element.text.trim()) {
    const maskedText = maskSensitiveData(element.text.trim());
    stepInfo += `   Visible Text/Label: "${maskedText}"\n`;
    // If it's an image but has text, explain the relationship
    if (element.isImage) {
      stepInfo += `      ⚠️  NOTE: This element is an image/icon, but also contains text. The text "${maskedText}" may be a label or overlay, not the primary element.\n`;
    }
  }
  
  // For input fields, show what was typed (or that it was masked)
  if (actionType === 'input') {
    const masked = element.inputValue === '[SENSITIVE DATA MASKED]' || element.inputValue === '[PASSWORD FIELD]' || element.isSensitive;
    if (masked) {
      stepInfo += `   Input Value: [SENSITIVE DATA MASKED - do not reveal; use label/placeholder for instruction]\n`;
    } else if (element.inputValue && typeof element.inputValue === 'string') {
      stepInfo += `   Input Value: "${element.inputValue.substring(0, 200)}"\n`;
    }
    if (element.inputType) {
      stepInfo += `   Input Type: ${element.inputType}\n`;
    }
    if (element.placeholder) {
      stepInfo += `   Placeholder: "${element.placeholder}"\n`;
    }
    if (element.label) {
      stepInfo += `   Field Label: "${element.label}"\n`;
    }
  }
  
  if (element.id) {
    stepInfo += `   ID: "${element.id}"\n`;
  }
  
  if (element.classes && element.classes.length > 0) {
    stepInfo += `   CSS Classes: ${element.classes.join(', ')}\n`;
  }
  
  if (element.selector) {
    stepInfo += `   Selector: ${element.selector}\n`;
  }
  if (element.selectorStack && typeof element.selectorStack === 'object') {
    const s = element.selectorStack;
    const parts = [s.id && `id=${s.id}`, s.robust && `robust=${s.robust}`, s.xpath && `xpath=${s.xpath}`, s.innerText && `innerText="${(s.innerText || '').substring(0, 40)}"`].filter(Boolean);
    if (parts.length) stepInfo += `   Selector stack (replay): ${parts.join(', ')}\n`;
  }
  
  if (element.attributes && typeof element.attributes === 'object') {
    try {
      const attrs = Object.entries(element.attributes)
        .filter(([key, value]) => {
          const relevantKeys = ['href', 'src', 'alt', 'aria-label', 'data-testid', 'name', 'type', 'value', 'placeholder', 'role'];
          return relevantKeys.includes(key) && value !== null && value !== undefined;
        })
        .map(([key, value]) => {
          const val = typeof value === 'string' ? value : String(value);
          return `${key}="${val.substring(0, 100)}"`;
        })
        .join(', ');
      if (attrs) {
        stepInfo += `   Attributes: ${attrs}\n`;
      }
    } catch (error) {
      // Ignore attribute parsing errors
    }
  }

  // Additional context data points
  if (element.ariaLabel) {
    stepInfo += `   Aria Label: "${element.ariaLabel}"\n`;
  }
  if (element.ariaRole) {
    stepInfo += `   Aria Role: "${element.ariaRole}"\n`;
  }
  if (element.title) {
    stepInfo += `   Title Attribute: "${element.title}"\n`;
  }
  if (element.dataAttributes && Object.keys(element.dataAttributes).length > 0) {
    const dataAttrs = Object.entries(element.dataAttributes)
      .map(([k, v]) => `${k}="${String(v).substring(0, 50)}"`)
      .join(', ');
    stepInfo += `   Data Attributes: ${dataAttrs}\n`;
  }
  if (element.dimensions) {
    stepInfo += `   Element Size: ${element.dimensions.width}x${element.dimensions.height}px\n`;
    stepInfo += `   Element Position: (${element.dimensions.left}, ${element.dimensions.top})\n`;
  }
  if (element.computedStyles) {
    const styles = element.computedStyles;
    if (styles.display) stepInfo += `   Display: ${styles.display}\n`;
    if (styles.position) stepInfo += `   Position: ${styles.position}\n`;
    if (styles.cursor) stepInfo += `   Cursor: ${styles.cursor}\n`;
  }
  if (element.isVisible !== undefined) {
    stepInfo += `   Visible: ${element.isVisible}\n`;
  }
  if (element.isInteractive !== undefined) {
    stepInfo += `   Interactive: ${element.isInteractive}\n`;
  }
  
  // Surrounding context
  if (element.surroundingContext) {
    const surround = element.surroundingContext;
    if (surround.parent) {
      stepInfo += `\n   📦 PARENT ELEMENT:\n`;
      stepInfo += `      Tag: <${surround.parent.tag}>\n`;
      if (surround.parent.id) stepInfo += `      ID: ${surround.parent.id}\n`;
      if (surround.parent.classes && surround.parent.classes.length > 0) {
        stepInfo += `      Classes: ${surround.parent.classes.join(', ')}\n`;
      }
      if (surround.parent.text) {
        stepInfo += `      Text: "${surround.parent.text}"\n`;
      }
    }
    if (surround.container) {
      stepInfo += `\n   📦 CONTAINER:\n`;
      stepInfo += `      Tag: <${surround.container.tag}>\n`;
      if (surround.container.id) stepInfo += `      ID: ${surround.container.id}\n`;
      if (surround.container.role) stepInfo += `      Role: ${surround.container.role}\n`;
    }
    if (surround.siblings && surround.siblings.length > 0) {
      stepInfo += `\n   🔗 SIBLING ELEMENTS:\n`;
      surround.siblings.forEach((sib, idx) => {
        stepInfo += `      ${idx === 0 ? 'Previous' : 'Next'}: <${sib.tag}>`;
        if (sib.text) stepInfo += ` "${sib.text}"`;
        stepInfo += `\n`;
      });
    }
  }
  
  // Enhanced click coordinates
  if (click.elementX !== undefined && click.elementY !== undefined) {
    stepInfo += `\n   📍 CLICK WITHIN ELEMENT:\n`;
    stepInfo += `      Position: (${click.elementX}, ${click.elementY})px from element top-left\n`;
    if (click.elementPercentX && click.elementPercentY) {
      stepInfo += `      Position: ${click.elementPercentX}% from left, ${click.elementPercentY}% from top of element\n`;
    }
  }
  
  // Screenshot and optional AI image analysis (double-verify context)
  if (ctx.hasScreenshot) {
    stepInfo += `\n   📸 Screenshot available (shows page state at this moment)\n`;
  }
  if (ctx.imageAnalysis && typeof ctx.imageAnalysis === 'string' && ctx.imageAnalysis.trim()) {
    stepInfo += `\n   📸 IMAGE ANALYSIS (AI vision): ${ctx.imageAnalysis.trim()}\n`;
  }
  // Hint when step 1 looks like "user just landed on page" (not a real UI action)
  if (idx === 0 && ctx.likelyLandingStep) {
    const pageName = (page.title || page.url || 'this page').replace(/\s*[-|–].*$/, '').trim();
    stepInfo += `\n   ⚠️  LIKELY LANDING STEP: The user is probably establishing context (e.g. focusing the page or starting here). Do NOT say "Click the text that says ...". Instead write something like: "Open the [site] dashboard", "Start on the ${pageName}", or "Ensure you're on the ${pageName}".\n`;
  }
  
  // Context from previous steps
  if (idx > 0) {
    const prevStep = stepsContext[idx - 1];
    if (prevStep && prevStep.page && page && prevStep.page.title !== page.title) {
      stepInfo += `\n   ⚠️  NOTE: User navigated from "${prevStep.page.title || 'Unknown'}" to "${page.title || 'Unknown'}"\n`;
    }
  }
  
  return stepInfo;
}).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When "IMAGE ANALYSIS (AI vision)" is present for a step, use it to double-verify and enrich your understanding of what the user sees and does; combine it with the element/page data for more accurate instructions.

INTENT AND OUTCOME:
- Prefer describing WHY the user did something (the goal of the step) over the exact element clicked.
- For each step, infer the OUTCOME or RESULT of the action when you can (e.g. "Click the copy icon to copy the API key to your clipboard", "Click Save to store your changes"). Use IMAGE ANALYSIS (which may describe what the action achieves), aria-label, title, nearby text, and the flow (e.g. previous step created an API key, so a copy icon likely copies it). Prefer instructions that tell the user what they will achieve, not just what to click.
- For STEP 1: If the user clicked on non-interactive content (e.g. a paragraph, empty-state text like "No deployments found") on a dashboard or home page, they are almost certainly just starting on that page. Write an instruction like "Open the [Site] dashboard", "Start on the [Page Name]", or "Ensure you're on the [Page Name]". Do NOT write "Click the text that says 'No deployments found'" or similar.
- When LIKELY LANDING STEP is shown for step 1, follow that hint: describe where the user is starting, not what they clicked.

ANALYSIS INSTRUCTIONS:

Analyze the COMPLETE workflow to understand:
1. What is the overall goal? (Look at the tutorial title and all steps together)
2. What is the user trying to accomplish?
3. What is the purpose of each step in the sequence?
4. How do the steps relate to each other?

For EACH step, analyze:
- What was the USER'S INTENT (e.g. "starting on the dashboard", "opening the menu", "submitting the form") and what element was interacted with and why (button, link, menu item, form field, input, image/icon, etc.)
- What the element's purpose is based on:
  * For IMAGES/ICONS: Analyze the image context carefully:
    - If IMAGE/ICON DETECTED is shown, prioritize understanding it's an image/icon element
    - Look at image source, alt text, icon classes, and parent/child context
    - If text is present but element is marked as image, the text may be a label/overlay - the PRIMARY element is the image/icon
    - Common patterns: profile pictures, avatars, icons, buttons with images
    - Use image alt text, icon classes, or context clues to identify what the icon represents
  * Its visible text/label (important, but for images/icons, this may be secondary)
  * For input fields: what was typed, the field label, placeholder
  * Its ID, classes, and attributes (especially for icons: look for "icon", "avatar", "profile", "pic" in classes/IDs)
  * Its position on the page (click coordinates)
  * The page context (what page is this, what is it for?)
  * The sequence (what came before, what comes after?)
- What action is being performed (navigate, submit, select, type/enter text, click image/icon, etc.)
- What is the OUTCOME or RESULT of this action? (e.g. "copies the key to clipboard", "opens dropdown", "saves the form"). Use IMAGE ANALYSIS, labels, icon context, and the sequence (e.g. after "create token", a copy icon copies that token).

GENERATION RULES:

Generate clear, specific, and actionable instructions for each step. Each instruction should:
1. For STEP 1 when it is a landing/context step (e.g. user on dashboard home, clicked non-interactive or empty-state text): Describe WHERE the user is starting (e.g. "Open the Replicate dashboard" or "Start on the Replicate home page"), NOT the literal element. Never say "Click the text that says 'No deployments found'" for such steps.
2. For IMAGES/ICONS:
   - If IMAGE/ICON DETECTED is shown, identify what the icon represents (e.g., "Click your profile picture", "Click the settings icon", "Click the user avatar")
   - Use alt text, icon classes, or context to identify the icon (e.g., if classes contain "profile" or "avatar", say "profile picture/avatar")
   - If the element is an image but has text, prioritize describing it as an image/icon, not just the text
   - Examples: "Click your profile picture" (not "Click [Your Name]"), "Click the menu icon" (not "Click ☰")
3. Use the element's VISIBLE TEXT when available for non-image elements (e.g., "Click the 'Add Product' button" not "Click the button"). Never say "Click the div" or "Click the span" - always use the element's label, intent, or visible text (e.g. "Click the user menu", "Click the Save button").
4. For input/typing steps (actionType INPUT):
   - If the input value is masked (SENSITIVE DATA MASKED or PASSWORD FIELD): write "Enter your password" or "Enter your [field purpose]" using the field label or placeholder (e.g. "Enter your password in the Password field", "Enter your API key in the API Key field"). Do not reveal or guess the value.
   - If the value is a specific name or short string: "Enter '[Value]' into the [Field Name] field" (e.g. "Enter 'John Doe' into the Name field").
   - If the value looks like a long ID, token, or API key: say "Enter your API key" or use the field label/placeholder (e.g. "Enter your API key into the Token field"). Do not repeat the actual value.
   - Prefer the field label or placeholder for the field name (e.g. "Email", "Token name").
5. Be specific about location if helpful (e.g., "Click the 'Save' button in the top right")
6. Describe the action clearly (Click, Select, Type/Enter, Navigate to, Submit, Click [icon type], etc.)
7. When the action has an obvious result (copy, save, delete, open menu, download), include that result in the instruction (e.g. "Click the copy icon to copy the API key to your clipboard" not just "Click the copy icon"). Use IMAGE ANALYSIS and the preceding steps (e.g. "create token" then an icon = likely copy) to infer the outcome.
8. Be written in second person ("Click...", "Type...", "Enter...", "Select...")
9. Be 1-2 sentences maximum.
10. Be friendly and professional.
11. Consider the flow - if it's part of a sequence, mention context (e.g., "Next, click..." or "Then, type..."). Prefer describing the PURPOSE and RESULT of each step, not just the literal element.

CRITICAL OUTPUT FORMAT:

You MUST return a JSON array with exactly ${stepsContext.length} items. Each item must have:
- "stepNumber": (number from 1 to ${stepsContext.length})
- "instruction": (a clear, specific instruction string)

Example format:
[
  {"stepNumber": 1, "instruction": "Click the 'Sign In' button"},
  {"stepNumber": 2, "instruction": "Enter your email address in the Email field"},
  {"stepNumber": 3, "instruction": "Click the 'Submit' button"}
]

IMPORTANT: 
- Return ONLY the JSON array
- No markdown code blocks
- No explanations or additional text
- Exactly ${stepsContext.length} items
- Each stepNumber must match its position (1, 2, 3, etc.)`;

    // Ensure we always return a string
    if (typeof prompt !== 'string') {
      console.error('❌ Error: buildTutorialPrompt did not return a string');
      throw new Error('Failed to build prompt: result is not a string');
    }

    return prompt;
  }

  /**
   * Condense a tutorial title into 3-4 punchy uppercase words for a thumbnail.
   * e.g. "how to create a new api key in brevo" → "CREATE API KEY"
   */
  async condenseTitleForThumbnail(title, steps = []) {
    if (!this.provider || !title) {
      return (title || 'TUTORIAL').toUpperCase().split(/\s+/).slice(0, 4).join(' ');
    }

    const stepHints = steps.slice(0, 5).map((s, i) => {
      const el = s.clickData?.element || {};
      return `Step ${i + 1}: ${el.text || s.instruction || '(no info)'}`;
    }).join(', ');

    const prompt = `Condense this tutorial title into 2-4 punchy uppercase words for a YouTube-style thumbnail.

Title: "${title}"
Context (first few steps): ${stepHints}

Rules:
- Output ONLY the condensed title, nothing else
- 2-4 words maximum
- All uppercase
- Remove filler words (how, to, the, a, your, etc.)
- Keep the core action/topic
- Make it attention-grabbing

Examples:
- "how to withdraw your balance on whop" → "WITHDRAW BALANCE"
- "create a new api key in google ai studio" → "CREATE API KEY"
- "how to set up shipping in shopify" → "SETUP SHIPPING"
- "add abandoned cart automation in brevo" → "ABANDONED CART SETUP"`;

    try {
      const out = await this.generateWithReplicate(prompt);
      const result = (out || '').trim().replace(/[^A-Z0-9\s]/gi, '').toUpperCase();
      if (result && result.split(/\s+/).length <= 5) return result;
    } catch (e) {
      console.warn('Title condensing AI failed:', e.message);
    }
    return (title || 'TUTORIAL').toUpperCase().split(/\s+/).slice(0, 4).join(' ');
  }

  /**
   * Use AI vision to determine where to center the crop on a screenshot.
   * Returns { centerXPct, centerYPct, zoomPct } — we enforce 16:9 in the crop code.
   */
  async pickCropRegion(screenshotPath, tutorialTitle) {
    if (!this.visionEnabled || !screenshotPath) return null;
    try {
      const resolved = path.isAbsolute(screenshotPath)
        ? screenshotPath
        : path.resolve(process.cwd(), screenshotPath);
      const buf = await fs.readFile(resolved);

      const resized = await sharp(buf)
        .resize(800, null, { fit: 'inside' })
        .png()
        .toBuffer();
      const imageDataUrl = `data:image/png;base64,${resized.toString('base64')}`;

      const prompt = `You are choosing where to crop this screenshot for a YouTube tutorial thumbnail background.

Tutorial: "${tutorialTitle || 'Tutorial'}"

I need you to tell me:
1. Where the CENTER of the crop should be (as % from top-left)
2. How zoomed in the crop should be (what % of the image width to show)

The crop should focus on the most relevant and visually interesting area that represents the tutorial's action. Include key UI elements like buttons, forms, headings — not empty space, sidebars, or browser chrome.

Reply with ONLY a JSON object:
{"centerX": <% from left 0-100>, "centerY": <% from top 0-100>, "zoom": <% of image width to show, 30-80>}

Examples:
- To focus on a button in the center-left: {"centerX": 40, "centerY": 45, "zoom": 50}
- To show a wide area of content: {"centerX": 50, "centerY": 40, "zoom": 70}
- To zoom into a specific form: {"centerX": 55, "centerY": 50, "zoom": 40}

Reply with ONLY the JSON, nothing else.`;

      const output = await this.replicate.run('google/gemini-2.5-flash', {
        input: { prompt, image: imageDataUrl }
      });
      const text = Array.isArray(output) ? output.join('') : String(output || '');
      console.log('🔲 AI crop region:', text.trim());

      const jsonStr = text.replace(/```json?\s*|\s*```/g, '').trim();
      const match = jsonStr.match(/\{[\s\S]*?\}/);
      if (match) {
        const region = JSON.parse(match[0]);
        if (typeof region.centerX === 'number' && typeof region.centerY === 'number') {
          return {
            centerXPct: Math.max(0, Math.min(100, region.centerX)),
            centerYPct: Math.max(0, Math.min(100, region.centerY)),
            zoomPct: Math.max(30, Math.min(80, region.zoom || 50)),
          };
        }
      }
    } catch (e) {
      console.warn('AI crop region failed:', e.message);
    }
    return null;
  }

  /**
   * Use AI vision to pick the best screenshot for a thumbnail.
   * Creates a numbered grid of screenshot thumbnails and asks the AI to pick the most representative one.
   */
  async pickBestScreenshotForThumbnail(steps, tutorialTitle) {
    if (!this.visionEnabled || !steps.length) return null;

    const stepsWithScreenshots = [];
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].screenshot) stepsWithScreenshots.push({ step: steps[i], idx: i });
    }
    if (stepsWithScreenshots.length === 0) return null;
    if (stepsWithScreenshots.length === 1) return { stepIndex: stepsWithScreenshots[0].idx };

    try {
      const cellW = 480, cellH = 270;
      const cols = Math.min(stepsWithScreenshots.length, 4);
      const rows = Math.ceil(stepsWithScreenshots.length / cols);
      const gridW = cols * cellW, gridH = rows * cellH;

      const composites = [];
      for (let i = 0; i < stepsWithScreenshots.length; i++) {
        const { step } = stepsWithScreenshots[i];
        const resolved = path.isAbsolute(step.screenshot)
          ? step.screenshot
          : path.resolve(process.cwd(), step.screenshot);
        try {
          const buf = await fs.readFile(resolved);
          const thumb = await sharp(buf)
            .resize(cellW - 10, cellH - 30, { fit: 'contain', background: { r: 30, g: 30, b: 30, alpha: 1 } })
            .png()
            .toBuffer();
          const col = i % cols, row = Math.floor(i / cols);
          composites.push({ input: thumb, left: col * cellW + 5, top: row * cellH + 25 });

          const labelSvg = Buffer.from(`<svg width="${cellW}" height="24">
            <rect width="${cellW}" height="24" fill="#1a1a2e"/>
            <text x="8" y="17" font-family="Arial" font-size="14" font-weight="bold" fill="#fff">Step ${stepsWithScreenshots[i].idx + 1}</text>
          </svg>`);
          composites.push({ input: labelSvg, left: col * cellW, top: row * cellH });
        } catch { /* skip unreadable screenshots */ }
      }

      if (composites.length === 0) return null;

      const gridBuffer = await sharp({
        create: { width: gridW, height: gridH, channels: 4, background: { r: 26, g: 26, b: 46, alpha: 1 } }
      }).composite(composites).png().toBuffer();

      const gridBase64 = gridBuffer.toString('base64');
      const imageDataUrl = `data:image/png;base64,${gridBase64}`;

      const prompt = `You are selecting the best screenshot for a YouTube tutorial thumbnail.

Tutorial title: "${tutorialTitle || 'Tutorial'}"

This grid shows numbered screenshots from different steps of the tutorial. Pick the ONE step whose screenshot would make the best thumbnail background.

STRONG preferences:
- The screenshot that best visually represents the tutorial topic at a glance
- Pages showing the MAIN feature/section with recognizable UI (buttons, cards, navigation, product listings etc.)
- Screenshots with rich visual content (images, icons, colorful UI elements)
- The "overview" or "landing" state of the key feature (e.g. a product list page for "add product", a settings panel for "change settings")

AVOID:
- Form-filling steps (text fields, typing into inputs) — these look boring and generic
- Mostly blank/white/empty pages
- Tiny dialogs or modals without page context
- Login pages, loading screens, or confirmation pages
- Steps where the user is just typing text

Reply with ONLY the step number (e.g. "Step 3"), nothing else.`;

      const output = await this.replicate.run('google/gemini-2.5-flash', {
        input: { prompt, image: imageDataUrl }
      });
      const text = Array.isArray(output) ? output.join('') : String(output || '');
      console.log('🎯 AI screenshot pick:', text.trim());

      const match = text.match(/step\s*(\d+)/i) || text.trim().match(/^(\d+)$/);
      if (match) {
        const stepNum = parseInt(match[1], 10);
        const found = stepsWithScreenshots.find(s => s.idx + 1 === stepNum);
        if (found) return { stepIndex: found.idx };
      }
    } catch (e) {
      console.warn('AI screenshot selection failed:', e.message);
    }
    return null;
  }

  /**
   * Generate narrative for published article: title, intro, prerequisites (Brevo-style).
   */
  async generatePublishNarrative(tutorial) {
    if (!this.provider) return { title: tutorial.title || 'Tutorial', intro: '', prerequisites: [] };
    const steps = tutorial.steps || [];
    const stepSummary = steps.map((s, i) => `Step ${i + 1}: ${(s.instruction || '').trim() || 'No instruction'}`).join('\n');
    const firstUrl = steps[0]?.clickData?.page?.url || '';
    const prompt = `You are writing a short help-article header for a step-by-step tutorial.

Tutorial title (user-provided): "${tutorial.title || 'Untitled'}"

Steps (summary):
${stepSummary}

First step URL: ${firstUrl}

Reply with ONLY a JSON object (no markdown, no other text) with exactly these keys:
- "title": A clear, reader-friendly title (e.g. "How to import your contacts to Brevo")
- "intro": 2-3 sentences explaining what the user will achieve by following the steps
- "prerequisites": An array of 1-4 short strings (e.g. "A Brevo account", "Your CSV file ready")`;

    try {
      const out = await this.generateWithReplicate(prompt);
      const jsonStr = (out || '').replace(/```json?\s*|\s*```/g, '').trim();
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          title: parsed.title || tutorial.title || 'Tutorial',
          intro: typeof parsed.intro === 'string' ? parsed.intro : '',
          prerequisites: Array.isArray(parsed.prerequisites) ? parsed.prerequisites : []
        };
      }
    } catch (e) {
      console.warn('ClickTut: Publish narrative failed', e.message);
    }
    return { title: tutorial.title || 'Tutorial', intro: '', prerequisites: [] };
  }

  /**
   * Call Replicate with retry on 429 (rate limit). Replicate limits to ~6 req/min when account has < $5 credit.
   */
  async replicateRunWithRetry(input, maxRetries = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.replicate.run(this.model, { input });
      } catch (err) {
        lastErr = err;
        const is429 = (err.status === 429) || (err.message && err.message.includes('429'));
        let waitSec = 7;
        try {
          const ra = err.response?.headers?.get?.('retry-after') ?? err.response?.headers?.['retry-after'];
          if (ra) waitSec = Math.max(7, parseInt(String(ra), 10) || 7);
          else {
            const m = err.message?.match(/retry_after["\s:]+(\d+)/i);
            if (m) waitSec = Math.max(7, parseInt(m[1], 10) || 7);
          }
        } catch (_) {}
        if (attempt < maxRetries && is429) {
          console.log(`⏳ Replicate rate limited (429). Waiting ${waitSec}s then retry (${attempt}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
        } else {
          throw err;
        }
      }
    }
    throw lastErr;
  }

  // Generate with Replicate (Gemini)
  async generateWithReplicate(prompt) {
    const fullPrompt = `You are a helpful assistant that creates clear, concise tutorial instructions for web applications.\n\n${prompt}`;
    const input = { prompt: fullPrompt };
    const output = await this.replicateRunWithRetry(input);
    const result = Array.isArray(output) ? output.join('') : output;
    return result.trim();
  }

  // Generate tutorial with Replicate (Gemini)
  async generateTutorialWithReplicate(prompt, stepCount) {
    // Enhanced prompt for better JSON generation
    const fullPrompt = `You are a helpful assistant that creates clear, concise tutorial instructions.

CRITICAL: You MUST respond with ONLY a valid JSON array. No explanations, no markdown, no other text. Just the JSON array.

The JSON array must have exactly ${stepCount} items, one for each step.

Format:
[
  {"stepNumber": 1, "instruction": "First instruction here"},
  {"stepNumber": 2, "instruction": "Second instruction here"},
  ...
]

${prompt}

Remember: Return ONLY the JSON array, nothing else.`;

    const input = {
      prompt: fullPrompt
    };

    console.log(`📤 Sending request to ${this.model} for ${stepCount} steps...`);
    const output = await this.replicateRunWithRetry(input);
    
    // Replicate returns an array of strings, join them
    const result = Array.isArray(output) ? output.join('') : output;
    const text = result.trim();

    // Log first 500 chars of response for debugging
    console.log(`📥 Raw AI response (first 500 chars):`, text.substring(0, 500));

    try {
      // Try to extract JSON array from response
      let jsonText = text;
      
      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Remove any leading/trailing text before/after JSON
      // Look for the JSON array pattern
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          // Validate and fix step numbers if needed
          if (parsed.length === stepCount) {
            // Ensure step numbers are correct
            parsed.forEach((item, idx) => {
              if (!item.stepNumber || item.stepNumber !== idx + 1) {
                item.stepNumber = idx + 1;
              }
            });
            console.log(`✅ Successfully parsed JSON array with ${parsed.length} steps`);
            return parsed;
          } else {
            console.warn(`⚠️  JSON array has ${parsed.length} items, expected ${stepCount}`);
            
            // Create a map of existing instructions by stepNumber
            const instructionMap = new Map();
            parsed.forEach(item => {
              if (item.stepNumber && item.instruction) {
                instructionMap.set(item.stepNumber, item.instruction);
              }
            });
            
            // Build complete array with all steps
            const completeInstructions = [];
            for (let i = 1; i <= stepCount; i++) {
              if (instructionMap.has(i)) {
                completeInstructions.push({
                  stepNumber: i,
                  instruction: instructionMap.get(i)
                });
              } else {
                // Find instruction by index if stepNumber doesn't match
                const byIndex = parsed[i - 1];
                if (byIndex && byIndex.instruction) {
                  completeInstructions.push({
                    stepNumber: i,
                    instruction: byIndex.instruction
                  });
                } else {
                  // Fallback: use placeholder
                  completeInstructions.push({
                    stepNumber: i,
                    instruction: `Complete step ${i}`
                  });
                }
              }
            }
            
            console.log(`✅ Built complete instruction array with ${completeInstructions.length} steps`);
            return completeInstructions;
          }
        }
      }
      
      // Try parsing the whole text
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) {
        console.log(`✅ Parsed entire text as JSON array`);
        return parsed;
      }
      
      // Fallback: parse instructions from text
      console.warn('⚠️  JSON parsing failed, using text parsing fallback');
      return this.parseInstructionsFromText(text, stepCount);
    } catch (error) {
      console.error('❌ Failed to parse as JSON:', error.message);
      console.log('📄 Full response text:', text);
      console.warn('⚠️  Falling back to text parsing');
      return this.parseInstructionsFromText(text, stepCount);
    }
  }

  // Fallback: parse instructions from text if JSON parsing fails
  parseInstructionsFromText(text, stepCount) {
    const instructions = [];
    const lines = text.split('\n');
    
    for (let i = 1; i <= stepCount; i++) {
      // Look for step patterns like "Step 1:", "1.", etc.
      const patterns = [
        new RegExp(`step\\s+${i}[:\\.]\\s*(.+?)(?=\\n|step|$)`, 'i'),
        new RegExp(`^${i}[:\\.]\\s*(.+?)$`, 'im'),
        new RegExp(`"stepNumber":\\s*${i}[^}]*"instruction":\\s*"([^"]+)"`, 'i')
      ];
      
      let found = false;
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          instructions.push({
            stepNumber: i,
            instruction: match[1].trim().replace(/^["']|["']$/g, '')
          });
          found = true;
          break;
        }
      }
      
      if (!found) {
        // Fallback: use a generic instruction
        instructions.push({
          stepNumber: i,
          instruction: `Complete step ${i}`
        });
      }
    }
    
    return instructions;
  }
}

module.exports = new AIService();
