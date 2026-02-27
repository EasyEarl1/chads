// ClickTut - Content Script for Click Tracking
// This script runs on every page and tracks user clicks

(function() {
  'use strict';

  let isRecording = false;
  const API_BASE_URL = 'http://localhost:3000/api';

  // Check recording status on page load (in case of navigation)
  async function checkRecordingStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getRecordingStatus' });
      if (response && response.isRecording) {
        isRecording = true;
        console.log('ClickTut: Content script - Restored recording state after navigation');
      }
    } catch (error) {
      console.error('ClickTut: Error checking recording status:', error);
    }
  }

  // Check immediately on load
  checkRecordingStatus();

  // Also check after a short delay (in case background script isn't ready)
  setTimeout(checkRecordingStatus, 100);

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startRecording') {
      isRecording = true;
      console.log('ClickTut: Content script - Recording started');
      sendResponse({ success: true });
    } else if (request.action === 'stopRecording') {
      isRecording = false;
      console.log('ClickTut: Content script - Recording stopped');
      sendResponse({ success: true });
    } else if (request.action === 'getRecordingStatus') {
      sendResponse({ isRecording });
    }
    return true; // Keep channel open for async response
  });

  // Pre-click capture: start screenshot on mousedown so we get the UI before menu/navigation (Google Drive, etc.)
  let pendingClickScreenshotPromise = null;
  document.addEventListener('mousedown', () => {
    if (isRecording) {
      pendingClickScreenshotPromise = requestScreenshot();
    }
  }, true);

  // Track click events (use pre-captured screenshot from mousedown when available)
  document.addEventListener('click', async (event) => {
    if (!isRecording) {
      console.log('ClickTut: Click detected but not recording');
      return;
    }

    try {
      console.log('ClickTut: Capturing click...');
      const clickData = await captureClickData(event, 'click', { usePreClickScreenshot: true });
      console.log('ClickTut: Click captured, sending to background...', clickData);
      
      // Send to background script for processing (background will assign step number)
      chrome.runtime.sendMessage({
        action: 'recordClick',
        clickData: clickData
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('ClickTut: Error sending click:', chrome.runtime.lastError);
        } else if (response && response.success) {
          console.log(`ClickTut: Click successfully sent to background (step ${response.stepNumber})`);
        } else {
          console.warn('ClickTut: Click sent but got unexpected response:', response);
        }
      });
    } catch (error) {
      console.error('ClickTut: Error capturing click:', error);
    }
  }, true); // Use capture phase to catch all clicks

  // Track input/typing events
  let inputTimeout = null;
  const inputDebounceDelay = 1000; // Wait 1 second after typing stops
  const inputTimestamps = new WeakMap(); // Store original timestamp per input element
  
  document.addEventListener('input', (event) => {
    if (!isRecording) return;
    
    const target = event.target;
    // Only track input in form fields (input, textarea, contenteditable)
    if (!['INPUT', 'TEXTAREA'].includes(target.tagName) && !target.isContentEditable) {
      return;
    }

    // Store the original timestamp when input first starts (before debounce)
    if (!inputTimestamps.has(target)) {
      inputTimestamps.set(target, Date.now());
    }

    // Clear previous timeout
    if (inputTimeout) {
      clearTimeout(inputTimeout);
    }

    // Debounce: wait for user to stop typing
    inputTimeout = setTimeout(async () => {
    try {
      // Use the original timestamp from when input started, not when debounce fires
      const originalTimestamp = inputTimestamps.get(target) || Date.now();
      const inputData = await captureInputData(event, target, originalTimestamp);
      
      // Clear the timestamp after capturing
      inputTimestamps.delete(target);
        
        // Send to background script for processing
        chrome.runtime.sendMessage({
          action: 'recordClick',
          clickData: inputData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('ClickTut: Error sending input data', chrome.runtime.lastError);
          }
        });
      } catch (error) {
        console.error('ClickTut: Error capturing input data', error);
        inputTimestamps.delete(target);
      }
    }, inputDebounceDelay);
  }, true);

  // Track form submissions
  document.addEventListener('submit', async (event) => {
    if (!isRecording) return;

    try {
      const submitData = await captureClickData(event, 'submit');
      
      chrome.runtime.sendMessage({
        action: 'recordClick',
        clickData: submitData
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('ClickTut: Error sending submit data', chrome.runtime.lastError);
        }
      });
    } catch (error) {
      console.error('ClickTut: Error capturing submit data', error);
    }
  }, true);

  // Capture comprehensive click data with extensive context
  // usePreClickScreenshot: for 'click', use screenshot started on mousedown (captures before menu disappears)
  async function captureClickData(event, actionType = 'click', options = {}) {
    const target = event.target;
    // Use event timestamp for more accurate ordering (milliseconds since page load)
    // Convert to absolute timestamp by adding to page load time
    const eventTimestamp = event.timeStamp || 0;
    const pageLoadTime = performance.timing.navigationStart || Date.now() - performance.now();
    const timestamp = pageLoadTime + eventTimestamp;
    
    // Detect if element is an image/icon
    const imageContext = detectImageContext(target);
    
    // Get surrounding context (sibling elements, parent text, nearby elements)
    const surroundingContext = getSurroundingContext(target);
    
    // Get element dimensions and position
    const rect = target.getBoundingClientRect();
    const elementDimensions = {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right
    };
    
    // Get element information with extensive context
    const elementInfo = {
      tag: target.tagName.toLowerCase(),
      id: target.id || null,
      classes: Array.from(target.classList || []),
      text: getElementText(target),
      selector: generateSelector(target),
      selectorStack: getSelectorStack(target),
      contextSandwich: getContextSandwich(target),
      attributes: getRelevantAttributes(target),
      actionType: actionType, // 'click', 'submit', etc.
      // Enhanced context for images/icons
      isImage: imageContext.isImage,
      imageInfo: imageContext.imageInfo,
      parentContext: imageContext.parentContext,
      childContext: imageContext.childContext,
      // Additional context data points
      dimensions: elementDimensions,
      surroundingContext: surroundingContext,
      ariaLabel: target.getAttribute('aria-label') || null,
      ariaRole: target.getAttribute('role') || null,
      title: target.title || target.getAttribute('title') || null,
      dataAttributes: getDataAttributes(target),
      computedStyles: getRelevantStyles(target),
      isVisible: isElementVisible(target),
      isInteractive: isElementInteractive(target)
    };

    // Get click coordinates relative to viewport and element
    const coordinates = {
      x: event.clientX,
      y: event.clientY,
      pageX: event.pageX,
      pageY: event.pageY,
      // Relative to element
      elementX: event.clientX - rect.left,
      elementY: event.clientY - rect.top,
      // Percentage position within element
      elementPercentX: rect.width > 0 ? ((event.clientX - rect.left) / rect.width * 100).toFixed(1) : 0,
      elementPercentY: rect.height > 0 ? ((event.clientY - rect.top) / rect.height * 100).toFixed(1) : 0
    };

    // Get comprehensive page context (incl. page heading for "where am I")
    const pageContext = {
      url: window.location.href,
      title: document.title,
      pageHeading: getClosestHeading(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      scrollPosition: {
        scrollX: window.scrollX || window.pageXOffset,
        scrollY: window.scrollY || window.pageYOffset
      },
      referrer: document.referrer || null,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash
    };

    // Screenshot: for click, use pre-capture from mousedown (wait up to 500ms); else request now
    let screenshot = null;
    if (actionType === 'click' && options.usePreClickScreenshot && pendingClickScreenshotPromise) {
      screenshot = await Promise.race([
        pendingClickScreenshotPromise,
        new Promise(r => setTimeout(() => r(null), 500))
      ]);
      pendingClickScreenshotPromise = null;
    }
    if (screenshot === null) {
      screenshot = await requestScreenshot();
    }

    return {
      timestamp,
      coordinates,
      element: elementInfo,
      page: pageContext,
      screenshot: screenshot || null
    };
  }

  // Capture input/typing data with enhanced context
  async function captureInputData(event, target, originalTimestamp = null) {
    // Use the original timestamp from when input started (before debounce)
    // This ensures input events are ordered correctly relative to clicks
    // Use event timestamp for more accurate ordering (same as clicks)
    const eventTimestamp = event.timeStamp || 0;
    const pageLoadTime = performance.timing.navigationStart || Date.now() - performance.now();
    const timestamp = originalTimestamp || (pageLoadTime + eventTimestamp);
    
    // Get input value (but don't capture sensitive data like passwords)
    const inputType = target.type || '';
    const isPassword = inputType === 'password';
    const inputValue = isPassword ? '[PASSWORD FIELD]' : (target.value || target.textContent || '');
    
    // Get element information (incl. selector stack and context sandwich for replay/intent)
    const elementInfo = {
      tag: target.tagName.toLowerCase(),
      id: target.id || null,
      classes: Array.from(target.classList || []),
      text: getElementText(target),
      selector: generateSelector(target),
      selectorStack: getSelectorStack(target),
      contextSandwich: getContextSandwich(target),
      attributes: getRelevantAttributes(target),
      actionType: 'input',
      inputType: inputType,
      inputValue: inputValue.substring(0, 200), // Limit to 200 chars
      placeholder: target.placeholder || null,
      label: getInputLabel(target)
    };

    // Get coordinates (where the input field is)
    const rect = target.getBoundingClientRect();
    const coordinates = {
      x: rect.left + (rect.width / 2), // Center of input field
      y: rect.top + (rect.height / 2),
      pageX: rect.left + window.scrollX + (rect.width / 2),
      pageY: rect.top + window.scrollY + (rect.height / 2)
    };

    // Get page context (incl. page heading)
    const pageContext = {
      url: window.location.href,
      title: document.title,
      pageHeading: getClosestHeading(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };

    // Request screenshot from background script
    const screenshot = await requestScreenshot();

    return {
      timestamp,
      coordinates,
      element: elementInfo,
      page: pageContext,
      screenshot: screenshot || null
    };
  }

  // Get label for an input field
  function getInputLabel(inputElement) {
    // Try to find associated label
    if (inputElement.id) {
      const label = document.querySelector(`label[for="${inputElement.id}"]`);
      if (label) {
        return label.textContent.trim();
      }
    }
    
    // Try to find parent label
    let parent = inputElement.parentElement;
    while (parent && parent.tagName !== 'LABEL' && parent !== document.body) {
      parent = parent.parentElement;
    }
    if (parent && parent.tagName === 'LABEL') {
      return parent.textContent.trim();
    }
    
    // Try aria-label
    if (inputElement.getAttribute('aria-label')) {
      return inputElement.getAttribute('aria-label');
    }
    
    return null;
  }

  // Mask sensitive information (usernames, emails, tokens)
  // BE VERY CONSERVATIVE - only mask actual sensitive data, not common words
  function maskSensitiveData(text) {
    if (!text || typeof text !== 'string') return text;
    
    let masked = text;
    
    // Mask email addresses
    masked = masked.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
    
    // Mask API tokens (long alphanumeric strings, typically 20+ chars)
    masked = masked.replace(/\b[A-Za-z0-9_-]{20,}\b/g, '[API_TOKEN]');
    
    // DO NOT mask usernames in general text - it's too aggressive
    // Only mask actual usernames when they appear in specific contexts (profile/account areas)
    // For now, we'll skip username masking in general text to avoid false positives
    
    return masked;
  }

  // Get text content from element (limited length)
  function getElementText(element) {
    let text = '';
    
    // For buttons, get the text content
    if (['button', 'a', 'span', 'div'].includes(element.tagName.toLowerCase())) {
      text = element.textContent || element.innerText || '';
    } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      // For inputs, get placeholder or value preview
      text = element.placeholder || element.value?.substring(0, 50) || '';
    } else {
      // Fallback
      text = element.textContent || element.innerText || '';
    }
    
    text = text.trim().substring(0, 100);
    
    // Mask sensitive data before returning
    return maskSensitiveData(text);
  }

  // Generate CSS selector for element
  function generateSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(c => c).join('.');
      if (classes) {
        return `${element.tagName.toLowerCase()}.${classes}`;
      }
    }
    
    // Fallback to path
    const path = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let selector = element.tagName.toLowerCase();
      if (element.id) {
        selector += `#${element.id}`;
        path.unshift(selector);
        break;
      }
      if (element.className) {
        const classes = Array.from(element.classList).join('.');
        if (classes) selector += `.${classes}`;
      }
      path.unshift(selector);
      element = element.parentElement;
      if (path.length > 5) break; // Limit depth
    }
    return path.join(' > ');
  }

  // Selector stack for robust replay (id, data-testid/aria-label, xpath, innerText)
  function getSelectorStack(element) {
    const id = element.id ? `#${element.id}` : null;
    let robust = null;
    const testId = element.getAttribute('data-testid');
    const ariaLabel = element.getAttribute('aria-label');
    if (testId) robust = `[data-testid="${testId}"]`;
    else if (ariaLabel) robust = `[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
    const xpath = getSimpleXPath(element);
    const innerText = getElementText(element) || null;
    return { id, robust, xpath, innerText: innerText ? innerText.substring(0, 80) : null };
  }

  function getSimpleXPath(el) {
    const parts = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let part = el.tagName.toLowerCase();
      if (el.id) {
        parts.unshift(part + '[@id="' + el.id + '"]');
        break;
      }
      const siblings = Array.from(el.parentElement?.children || []).filter(n => n.tagName === el.tagName);
      const idx = siblings.indexOf(el) + 1;
      parts.unshift(part + (siblings.length > 1 ? '[' + idx + ']' : ''));
      el = el.parentElement;
      if (parts.length > 8) break;
    }
    return '/' + parts.join('/');
  }

  // Closest page heading (h1/h2) for "where am I" context
  function getClosestHeading() {
    const h = document.querySelector('h1, h2');
    return h ? (h.textContent || '').trim().substring(0, 100) : null;
  }

  // Context sandwich: "User clicked X inside Y, next to Z" for intent (Gemini recommendation)
  function getContextSandwich(target) {
    const tag = target.tagName.toLowerCase();
    const label = target.getAttribute('aria-label') || target.title || getElementText(target) || tag;
    const labelStr = typeof label === 'string' ? label.substring(0, 60) : tag;
    let inside = null;
    let parent = target.parentElement;
    for (let i = 0; i < 5 && parent && parent !== document.body; i++) {
      const name = parent.getAttribute('aria-label') || parent.getAttribute('data-section') || (parent.tagName === 'FORM' ? (parent.getAttribute('name') || 'form') : null);
      if (name) {
        inside = name;
        break;
      }
      if (parent.tagName === 'FORM') {
        inside = parent.getAttribute('name') || 'form';
        break;
      }
      parent = parent.parentElement;
    }
    let nextTo = null;
    const prev = target.previousElementSibling;
    const next = target.nextElementSibling;
    if (prev && (prev.textContent || '').trim()) nextTo = (prev.textContent || '').trim().substring(0, 30);
    else if (next && (next.textContent || '').trim()) nextTo = (next.textContent || '').trim().substring(0, 30);
    let s = `User clicked a ${tag} labeled "${labelStr}"`;
    if (inside) s += ` inside "${inside}"`;
    if (nextTo) s += `, next to "${nextTo}"`;
    s += '.';
    return s;
  }

  // Detect if element is an image/icon and gather context
  function detectImageContext(element) {
    const context = {
      isImage: false,
      imageInfo: null,
      parentContext: null,
      childContext: null
    };

    // Check if element itself is an image
    if (element.tagName === 'IMG') {
      context.isImage = true;
      context.imageInfo = {
        src: element.src || element.getAttribute('src'),
        alt: element.alt || element.getAttribute('alt'),
        width: element.width || element.getAttribute('width'),
        height: element.height || element.getAttribute('height')
      };
    }

    // Check if element contains an image (common for profile pics/icons)
    const childImg = element.querySelector('img');
    if (childImg) {
      context.isImage = true;
      context.childContext = {
        hasImage: true,
        imageSrc: childImg.src || childImg.getAttribute('src'),
        imageAlt: childImg.alt || childImg.getAttribute('alt'),
        imageClasses: Array.from(childImg.classList || [])
      };
    }

    // Check parent for image context (clicked on container with image)
    let parent = element.parentElement;
    let depth = 0;
    while (parent && depth < 3 && parent !== document.body) {
      if (parent.tagName === 'IMG' || parent.querySelector('img')) {
        context.parentContext = {
          hasImage: true,
          parentTag: parent.tagName.toLowerCase(),
          parentClasses: Array.from(parent.classList || []),
          parentId: parent.id || null,
          imageInParent: parent.tagName === 'IMG' || !!parent.querySelector('img')
        };
        break;
      }
      parent = parent.parentElement;
      depth++;
    }

    // Check for icon/avatar/profile indicators in classes/attributes
    const allClasses = Array.from(element.classList || []);
    const iconKeywords = ['icon', 'avatar', 'profile', 'pic', 'picture', 'image', 'img', 'photo', 'user-image', 'user-pic'];
    const hasIconClass = allClasses.some(cls => 
      iconKeywords.some(keyword => cls.toLowerCase().includes(keyword))
    );

    if (hasIconClass || element.id) {
      const idLower = (element.id || '').toLowerCase();
      const hasIconId = iconKeywords.some(keyword => idLower.includes(keyword));
      
      if (hasIconClass || hasIconId) {
        context.isImage = true;
        if (!context.imageInfo) {
          context.imageInfo = {
            detectedBy: 'class/id',
            iconClasses: allClasses.filter(cls => 
              iconKeywords.some(keyword => cls.toLowerCase().includes(keyword))
            ),
            iconId: hasIconId ? element.id : null
          };
        }
      }
    }

    // Check for background-image in computed styles (common for icons)
    try {
      const styles = window.getComputedStyle(element);
      if (styles.backgroundImage && styles.backgroundImage !== 'none') {
        context.isImage = true;
        if (!context.imageInfo) {
          context.imageInfo = {
            detectedBy: 'background-image',
            backgroundImage: styles.backgroundImage.substring(0, 100) // Limit length
          };
        }
      }
    } catch (e) {
      // Ignore style errors
    }

    return context;
  }

  // Get surrounding context (parent, siblings, nearby elements)
  function getSurroundingContext(element) {
    const context = {
      parent: null,
      siblings: [],
      nearbyElements: [],
      container: null
    };

    // Get parent element info
    if (element.parentElement) {
      const parent = element.parentElement;
      context.parent = {
        tag: parent.tagName.toLowerCase(),
        id: parent.id || null,
        classes: Array.from(parent.classList || []).slice(0, 5), // Limit classes
        text: (parent.textContent || '').trim().substring(0, 100)
      };
    }

    // Get container (form, section, nav, etc.)
    let container = element.parentElement;
    let depth = 0;
    while (container && depth < 5 && container !== document.body) {
      const tag = container.tagName.toLowerCase();
      if (['form', 'section', 'nav', 'header', 'footer', 'main', 'article', 'aside', 'div'].includes(tag)) {
        context.container = {
          tag: tag,
          id: container.id || null,
          classes: Array.from(container.classList || []).slice(0, 3),
          role: container.getAttribute('role') || null
        };
        break;
      }
      container = container.parentElement;
      depth++;
    }

    // Get sibling elements (previous and next)
    if (element.parentElement) {
      const siblings = Array.from(element.parentElement.children);
      const index = siblings.indexOf(element);
      if (index > 0) {
        const prevSibling = siblings[index - 1];
        context.siblings.push({
          tag: prevSibling.tagName.toLowerCase(),
          text: (prevSibling.textContent || '').trim().substring(0, 50),
          classes: Array.from(prevSibling.classList || []).slice(0, 3)
        });
      }
      if (index < siblings.length - 1) {
        const nextSibling = siblings[index + 1];
        context.siblings.push({
          tag: nextSibling.tagName.toLowerCase(),
          text: (nextSibling.textContent || '').trim().substring(0, 50),
          classes: Array.from(nextSibling.classList || []).slice(0, 3)
        });
      }
    }

    return context;
  }

  // Get data attributes
  function getDataAttributes(element) {
    const dataAttrs = {};
    Array.from(element.attributes || []).forEach(attr => {
      if (attr.name.startsWith('data-')) {
        dataAttrs[attr.name] = attr.value.substring(0, 100);
      }
    });
    return Object.keys(dataAttrs).length > 0 ? dataAttrs : null;
  }

  // Get relevant computed styles
  function getRelevantStyles(element) {
    try {
      const styles = window.getComputedStyle(element);
      return {
        display: styles.display,
        visibility: styles.visibility,
        position: styles.position,
        zIndex: styles.zIndex,
        cursor: styles.cursor,
        backgroundColor: styles.backgroundColor !== 'rgba(0, 0, 0, 0)' ? styles.backgroundColor : null,
        color: styles.color,
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight
      };
    } catch (e) {
      return null;
    }
  }

  // Check if element is visible
  function isElementVisible(element) {
    try {
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        styles.display !== 'none' &&
        styles.visibility !== 'hidden' &&
        styles.opacity !== '0'
      );
    } catch (e) {
      return true; // Assume visible if we can't check
    }
  }

  // Check if element is interactive
  function isElementInteractive(element) {
    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'label'];
    const tag = element.tagName.toLowerCase();
    return (
      interactiveTags.includes(tag) ||
      element.hasAttribute('onclick') ||
      element.hasAttribute('role') && ['button', 'link', 'tab'].includes(element.getAttribute('role')) ||
      element.style.cursor === 'pointer' ||
      element.getAttribute('tabindex') !== null
    );
  }

  // Get relevant attributes
  function getRelevantAttributes(element) {
    const relevant = ['href', 'src', 'alt', 'aria-label', 'data-testid', 'name', 'type', 'value', 'placeholder', 'role', 'aria-describedby', 'title'];
    const attrs = {};
    relevant.forEach(attr => {
      if (element.hasAttribute(attr)) {
        let value = element.getAttribute(attr);
        // Don't capture password values
        if (attr === 'value' && element.type === 'password') {
          attrs[attr] = '[PASSWORD]';
        } else {
          // Mask sensitive data in attribute values
          attrs[attr] = maskSensitiveData(value);
        }
      }
    });
    return attrs;
  }

  // Request screenshot from background script (Chrome allows ~2/sec; background throttles)
  function requestScreenshot() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'captureScreenshot' },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('ClickTut: Screenshot not available –', chrome.runtime.lastError.message);
            resolve(null);
          } else if (!response?.screenshot) {
            const reason = response?.reason || 'unknown';
            console.warn('ClickTut: Screenshot not available for this step (reason:', reason, response?.error ? '- ' + response.error : '', ')');
            resolve(null);
          } else {
            resolve(response.screenshot);
          }
        }
      );
    });
  }

  // Visual feedback when recording
  function showRecordingIndicator() {
    // Could add visual indicator on page
  }

  console.log('ClickTut: Content script loaded');
})();

