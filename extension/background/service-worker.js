// ClickTut - Background Service Worker
// Manages recording state and coordinates between content script and popup

let recordingState = {
  isRecording: false,
  tutorialId: null,
  clicks: [],
  startTime: null,
  stepCounter: 0 // Global step counter to prevent duplicates
};

// Load state from storage on startup
chrome.storage.local.get(['recordingState'], (result) => {
  if (result.recordingState) {
    recordingState = result.recordingState;
    console.log('ClickTut: Restored recording state', recordingState);
  }
});

// Save state to storage whenever it changes
function saveRecordingState() {
  chrome.storage.local.set({ recordingState }, () => {
    console.log('ClickTut: Saved recording state', recordingState);
  });
}

const API_BASE_URL = 'http://localhost:3000/api';

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startRecording') {
    handleStartRecording(request, sendResponse);
    return true; // Keep channel open
  } else if (request.action === 'stopRecording') {
    handleStopRecording(sendResponse);
    return true;
  } else if (request.action === 'getRecordingStatus') {
    sendResponse({ 
      isRecording: recordingState.isRecording,
      clickCount: recordingState.clicks.length,
      tutorialId: recordingState.tutorialId
    });
    return false;
  } else if (request.action === 'recordClick') {
    handleRecordClick(request.clickData, sendResponse);
    return true;
  } else if (request.action === 'captureScreenshot') {
    handleCaptureScreenshot(sender.tab.id, sendResponse);
    return true;
  }
  return false;
});

// Start recording
async function handleStartRecording(request, sendResponse) {
  try {
    // Create new tutorial session on backend
    const response = await fetch(`${API_BASE_URL}/tutorials/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: request.title || 'Untitled Tutorial',
        description: request.description || ''
      })
    });

    if (!response.ok) {
      throw new Error('Failed to start tutorial session');
    }

    const data = await response.json();
    
    recordingState = {
      isRecording: true,
      tutorialId: data.tutorialId,
      clicks: [],
      startTime: Date.now(),
      stepCounter: 0
    };
    saveRecordingState();
    console.log('ClickTut: Recording started', recordingState);

    // Notify all tabs to start recording
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'startRecording' }).catch(() => {
          // Ignore errors for tabs that don't have content script
        });
      });
    });

    sendResponse({ success: true, tutorialId: data.tutorialId });
  } catch (error) {
    console.error('ClickTut: Error starting recording', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Stop recording
async function handleStopRecording(sendResponse) {
  try {
    if (!recordingState.isRecording) {
      sendResponse({ success: false, error: 'Not recording' });
      return;
    }

    // Wait a moment for any pending clicks to be processed
    await new Promise(resolve => setTimeout(resolve, 500));

    // Notify all tabs to stop recording
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'stopRecording' }).catch(() => {
          // Ignore errors
        });
      });
    });

    // Wait a bit more for any final clicks that might be in flight
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Send any remaining clicks that haven't been sent yet
    const pendingClicks = recordingState.clicks.filter(c => !c.sent);
    console.log(`ClickTut: Found ${pendingClicks.length} pending clicks to send`);
    
    for (const clickData of pendingClicks) {
      try {
        console.log(`ClickTut: Sending pending click ${clickData.stepNumber}`);
        const response = await fetch(`${API_BASE_URL}/tutorials/${recordingState.tutorialId}/click`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(clickData)
        });
        
        if (response.ok) {
          clickData.sent = true;
          console.log(`ClickTut: Successfully sent pending click ${clickData.stepNumber}`);
        } else {
          const errorText = await response.text();
          console.error(`ClickTut: Failed to send pending click ${clickData.stepNumber}:`, response.status, errorText);
        }
      } catch (error) {
        console.error(`ClickTut: Error sending pending click ${clickData.stepNumber}:`, error);
      }
    }
    
    console.log(`ClickTut: Total clicks recorded: ${recordingState.clicks.length}, sent: ${recordingState.clicks.filter(c => c.sent).length}`);

    // Send final stop request to backend
    if (recordingState.tutorialId) {
      await fetch(`${API_BASE_URL}/tutorials/${recordingState.tutorialId}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    recordingState.isRecording = false;
    saveRecordingState();
    
    console.log(`ClickTut: Recording stopped. Total clicks: ${recordingState.clicks.length}`);
    
    sendResponse({ 
      success: true, 
      clickCount: recordingState.clicks.length,
      tutorialId: recordingState.tutorialId
    });
  } catch (error) {
    console.error('ClickTut: Error stopping recording', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Record a click event
async function handleRecordClick(clickData, sendResponse) {
  if (!recordingState.isRecording) {
    console.warn('ClickTut: Received click but not recording!', clickData);
    sendResponse({ success: false, error: 'Not recording' });
    return;
  }

  try {
    // Assign step number globally (prevents duplicates on navigation)
    recordingState.stepCounter++;
    clickData.stepNumber = recordingState.stepCounter;
    
    // Mark as not sent yet
    clickData.sent = false;
    clickData.receivedAt = Date.now();
    
    // Store locally
    recordingState.clicks.push(clickData);
    saveRecordingState();
    
    console.log(`ClickTut: Stored click ${clickData.stepNumber}, total clicks: ${recordingState.clicks.length}`);

    // Send to backend with retry logic
    const sendToBackend = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          const response = await fetch(`${API_BASE_URL}/tutorials/${recordingState.tutorialId}/click`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(clickData)
          });

          if (response.ok) {
            clickData.sent = true;
            saveRecordingState();
            console.log(`ClickTut: Successfully sent click ${clickData.stepNumber} to backend`);
            return true;
          } else {
            const errorText = await response.text();
            console.error(`ClickTut: Backend rejected click ${clickData.stepNumber}:`, response.status, errorText);
            if (i < retries - 1) {
              await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
            }
          }
        } catch (error) {
          console.error(`ClickTut: Error sending click ${clickData.stepNumber} (attempt ${i + 1}):`, error);
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
          }
        }
      }
      return false;
    };

    // Send in background (don't wait)
    sendToBackend().catch(err => {
      console.error('ClickTut: Failed to send click after retries', err);
    });

    // Respond immediately so we don't block
    sendResponse({ success: true, stepNumber: clickData.stepNumber });
  } catch (error) {
    console.error('ClickTut: Error recording click', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Screenshot: throttle + retry queue (Strategy B). Chrome allows ~2 captureVisibleTab/sec.
const MIN_SCREENSHOT_INTERVAL_MS = 550;
const SCREENSHOT_RETRY_DELAY_MS = 200;
const SCREENSHOT_MAX_RETRIES = 3;
const TAB_COMPLETE_RETRY_MS = 100;
let lastScreenshotTime = 0;

function getWindowIdForTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      resolve(tab && tab.windowId != null ? tab.windowId : null);
    });
  });
}

function waitForTabComplete(tabId, maxWaitMs = 500) {
  return new Promise((resolve) => {
    const start = Date.now();
    function check() {
      chrome.tabs.get(tabId, (tab) => {
        if (tab && tab.status === 'complete') {
          resolve(true);
          return;
        }
        if (Date.now() - start >= maxWaitMs) {
          resolve(false);
          return;
        }
        setTimeout(check, TAB_COMPLETE_RETRY_MS);
      });
    }
    check();
  });
}

const CAPTURE_SCALE = 2;
const HIGHRES_TIMEOUT_MS = 2000;
let debuggerAttachedTabId = null;

async function doCaptureHighRes(tabId) {
  const debuggee = { tabId };
  try {
    if (debuggerAttachedTabId === tabId) {
      // Already attached from a previous failed cleanup
      try { await chrome.debugger.detach(debuggee); } catch (_) {}
      debuggerAttachedTabId = null;
    }

    await chrome.debugger.attach(debuggee, '1.3');
    debuggerAttachedTabId = tabId;

    const layoutMetrics = await chrome.debugger.sendCommand(debuggee, 'Page.getLayoutMetrics');
    const vp = layoutMetrics.cssVisualViewport || layoutMetrics.visualViewport || {};
    const viewportW = Math.round(vp.clientWidth || 1920);
    const viewportH = Math.round(vp.clientHeight || 1080);

    await chrome.debugger.sendCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
      width: viewportW, height: viewportH,
      deviceScaleFactor: CAPTURE_SCALE, mobile: false
    });

    const result = await chrome.debugger.sendCommand(debuggee, 'Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false
    });

    await chrome.debugger.sendCommand(debuggee, 'Emulation.clearDeviceMetricsOverride');
    await chrome.debugger.detach(debuggee);
    debuggerAttachedTabId = null;

    if (!result || !result.data) throw new Error('No screenshot data returned');
    return 'data:image/png;base64,' + result.data;
  } catch (err) {
    try { await chrome.debugger.detach(debuggee); } catch (_) {}
    debuggerAttachedTabId = null;
    throw err;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

function doCapture(tabId, windowId) {
  return new Promise((resolve, reject) => {
    const wId = windowId != null ? windowId : null;
    chrome.tabs.captureVisibleTab(wId, { format: 'png', quality: 90 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!dataUrl) {
        reject(new Error('capture_returned_null'));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

async function doCaptureWithHighRes(tabId, windowId) {
  try {
    return await withTimeout(doCaptureHighRes(tabId), HIGHRES_TIMEOUT_MS);
  } catch (e) {
    console.warn('ClickTut: High-res capture skipped:', e.message);
    return await doCapture(tabId, windowId);
  }
}

async function tryCapture(tabId, sendResponse, retryCount = 0) {
  try {
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        sendResponse({ screenshot: null, reason: 'no_active_tab' });
        return;
      }
      tabId = tabs[0].id;
    }

    const now = Date.now();
    const elapsed = now - lastScreenshotTime;
    if (elapsed < MIN_SCREENSHOT_INTERVAL_MS) {
      await new Promise(r => setTimeout(r, MIN_SCREENSHOT_INTERVAL_MS - elapsed));
    }

    const windowId = await getWindowIdForTab(tabId);
    await waitForTabComplete(tabId);

    const dataUrl = await doCapture(tabId, windowId);
    lastScreenshotTime = Date.now();
    sendResponse({ screenshot: dataUrl });
  } catch (error) {
    const msg = error && error.message ? error.message : String(error);
    const isRetryable = /rate limit|429|MAX_CAPTURE|per second|busy|capture_returned_null/i.test(msg);
    if (isRetryable && retryCount < SCREENSHOT_MAX_RETRIES) {
      console.warn(`ClickTut: Screenshot failed, retrying in ${SCREENSHOT_RETRY_DELAY_MS}ms (${retryCount + 1}/${SCREENSHOT_MAX_RETRIES}):`, msg);
      setTimeout(() => tryCapture(tabId, sendResponse, retryCount + 1), SCREENSHOT_RETRY_DELAY_MS);
    } else {
      console.error('ClickTut: Screenshot failed:', msg);
      sendResponse({ screenshot: null, reason: isRetryable ? 'rate_limit' : 'error', error: msg });
    }
  }
}

async function handleCaptureScreenshot(tabId, sendResponse) {
  tryCapture(tabId, sendResponse, 0);
}

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('ClickTut extension installed');
});

// Inject recording state into new tabs/pages when they load (handles navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && recordingState.isRecording) {
    // When a page finishes loading and we're recording, inject the recording state
    chrome.tabs.sendMessage(tabId, { action: 'startRecording' }).catch(() => {
      // Ignore errors (tab might not have content script yet, or it's a chrome:// page)
    });
  }
});

