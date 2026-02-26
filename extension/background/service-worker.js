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

// Capture screenshot of current tab
async function handleCaptureScreenshot(tabId, sendResponse) {
  try {
    if (!tabId) {
      // Get active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        sendResponse({ screenshot: null });
        return;
      }
      tabId = tabs[0].id;
    }

    // Capture visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 90
    });

    sendResponse({ screenshot: dataUrl });
  } catch (error) {
    console.error('ClickTut: Error capturing screenshot', error);
    sendResponse({ screenshot: null });
  }
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

