// ClickTut - AI Service
// Generates step-by-step instructions using Replicate API

const Replicate = require('replicate');

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
      // Using Google Gemini 2.5 Flash - fast and high quality for instruction generation
      this.model = "google/gemini-2.5-flash"; // Fast, high quality, perfect for tutorials
      // Alternative models: 
      // "google/gemini-3.1-pro" (slower but potentially higher quality - 5+ mins per generation)
      // "mistralai/mistral-7b-instruct-v0.2" (alternative option)
    } else {
      this.provider = null;
      console.warn('⚠️  No Replicate API token found. Set REPLICATE_API_TOKEN in .env');
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

  // Generate instructions for all steps in a tutorial
  async generateTutorialInstructions(steps, tutorialTitle = null) {
    if (!this.provider) {
      throw new Error('No AI provider configured. Please set REPLICATE_API_TOKEN');
    }

    // Build rich context for all steps with full element data, coordinates, and screenshot info
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
          attributes: element.attributes || {},
          actionType: element.actionType || 'click',
          inputType: element.inputType || null,
          inputValue: element.inputValue || null,
          placeholder: element.placeholder || null,
          label: element.label || null,
          // Image/icon context
          isImage: element.isImage || false,
          imageInfo: element.imageInfo || null,
          parentContext: element.parentContext || null,
          childContext: element.childContext || null
        },
        page: {
          title: page.title,
          url: page.url,
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
        timestamp: step.timestamp
      };
    });

    const prompt = this.buildTutorialPrompt(stepsContext, tutorialTitle);
    
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

  // Build prompt for entire tutorial
  buildTutorialPrompt(stepsContext, tutorialTitle = null) {
    // Safety check
    if (!stepsContext || !Array.isArray(stepsContext) || stepsContext.length === 0) {
      console.error('❌ Error: stepsContext is invalid:', stepsContext);
      throw new Error('Invalid stepsContext: must be a non-empty array');
    }

    let prompt = `You are analyzing a user's interaction with a web application to create a step-by-step tutorial.

${tutorialTitle ? `TUTORIAL TITLE: "${tutorialTitle}"\n` : ''}
OVERVIEW: The user performed ${stepsContext.length} sequential actions to complete a task. Analyze the full workflow to understand the goal and create clear instructions.

The complete sequence of actions:

${stepsContext.map((ctx, idx) => {
  const element = ctx.element || {};
  const page = ctx.page || {};
  const click = ctx.clickLocation || {};
  const viewport = page.viewport || {};
  
  let stepInfo = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  stepInfo += `STEP ${idx + 1} of ${stepsContext.length}\n`;
  stepInfo += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // Page context
  stepInfo += `📍 PAGE CONTEXT:\n`;
  stepInfo += `   Title: "${page.title || 'Unknown'}"\n`;
  stepInfo += `   URL: ${page.url || 'N/A'}\n`;
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
  
  // Element details
  const actionType = element.actionType || 'click';
  stepInfo += `🎯 ELEMENT ${actionType.toUpperCase()}:\n`;
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
  
  // For input fields, show what was typed
  if (actionType === 'input' && element.inputValue && typeof element.inputValue === 'string') {
    stepInfo += `   Input Value: "${element.inputValue.substring(0, 200)}"\n`;
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
  
  // Screenshot info
  if (ctx.hasScreenshot) {
    stepInfo += `\n   📸 Screenshot available (shows page state at this moment)\n`;
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

ANALYSIS INSTRUCTIONS:

Analyze the COMPLETE workflow to understand:
1. What is the overall goal? (Look at the tutorial title and all steps together)
2. What is the user trying to accomplish?
3. What is the purpose of each step in the sequence?
4. How do the steps relate to each other?

For EACH step, analyze:
- What element was interacted with and why (button, link, menu item, form field, input, image/icon, etc.)
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

GENERATION RULES:

Generate clear, specific, and actionable instructions for each step. Each instruction should:
1. For IMAGES/ICONS: 
   - If IMAGE/ICON DETECTED is shown, identify what the icon represents (e.g., "Click your profile picture", "Click the settings icon", "Click the user avatar")
   - Use alt text, icon classes, or context to identify the icon (e.g., if classes contain "profile" or "avatar", say "profile picture/avatar")
   - If the element is an image but has text, prioritize describing it as an image/icon, not just the text
   - Examples: "Click your profile picture" (not "Click [Your Name]"), "Click the menu icon" (not "Click ☰")
2. Use the element's VISIBLE TEXT when available for non-image elements (e.g., "Click the 'Add Product' button" not "Click the button")
3. For input/typing steps: Describe what to type and where (e.g., "Type 'John Doe' in the Name field" or "Enter your email address in the Email input")
4. Be specific about location if helpful (e.g., "Click the 'Save' button in the top right")
5. Describe the action clearly (Click, Select, Type/Enter, Navigate to, Submit, Click [icon type], etc.)
6. Be written in second person ("Click...", "Type...", "Enter...", "Select...")
7. Be 1-2 sentences maximum
8. Be friendly and professional
9. Consider the flow - if it's part of a sequence, mention context (e.g., "Next, click..." or "Then, type...")

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

  // Generate with Replicate (Gemini)
  async generateWithReplicate(prompt) {
    // Gemini models use just prompt
    const fullPrompt = `You are a helpful assistant that creates clear, concise tutorial instructions for web applications.\n\n${prompt}`;
    
    const input = {
      prompt: fullPrompt
    };

    const output = await this.replicate.run(this.model, { input });
    
    // Replicate returns an array of strings, join them
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
    const output = await this.replicate.run(this.model, { input });
    
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
