// ClickTut - Popup Script
// Handles UI interactions for the extension popup

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const recordingInfo = document.getElementById('recordingInfo');
  const clickCountEl = document.getElementById('clickCount');
  const tutorialIdEl = document.getElementById('tutorialId');
  const formSection = document.getElementById('formSection');
  const tutorialTitle = document.getElementById('tutorialTitle');
  const tutorialDescription = document.getElementById('tutorialDescription');
  const dashboardLink = document.getElementById('dashboardLink');

  // Check current recording status
  updateStatus();

  // Start recording button
  startBtn.addEventListener('click', async () => {
    const title = tutorialTitle.value.trim() || 'Untitled Tutorial';
    const description = tutorialDescription.value.trim() || '';

    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'startRecording',
        title: title,
        description: description
      });

      if (response.success) {
        updateUI(true, response.tutorialId);
      } else {
        showError(response.error || 'Failed to start recording');
        startBtn.disabled = false;
        startBtn.textContent = 'Start Recording';
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      showError('Error starting recording. Make sure the backend server is running.');
      startBtn.disabled = false;
      startBtn.textContent = 'Start Recording';
    }
  });

  // Stop recording button
  stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    stopBtn.textContent = 'Stopping...';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'stopRecording'
      });

      if (response.success) {
        updateUI(false);
        const tutorialId = response.tutorialId;
        showSuccessWithLink(`Recording stopped. ${response.clickCount} clicks recorded.`, tutorialId);
      } else {
        showError(response.error || 'Failed to stop recording');
        stopBtn.disabled = false;
        stopBtn.textContent = 'Stop Recording';
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      showError('Error stopping recording');
      stopBtn.disabled = false;
      stopBtn.textContent = 'Stop Recording';
    }
  });

  // Dashboard link (backend serves on port 3000)
  dashboardLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'http://localhost:3000/tutorial-editor.html' });
  });

  // Update status periodically when recording
  setInterval(() => {
    if (statusIndicator.classList.contains('recording')) {
      updateClickCount();
    }
  }, 1000);

  // Update UI based on recording state
  function updateUI(isRecording, tutorialId = null) {
    if (isRecording) {
      statusIndicator.classList.add('recording');
      statusText.textContent = 'Recording...';
      startBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      formSection.style.display = 'none';
      recordingInfo.style.display = 'block';
      if (tutorialId) {
        tutorialIdEl.textContent = tutorialId.substring(0, 8) + '...';
      }
    } else {
      statusIndicator.classList.remove('recording');
      statusText.textContent = 'Not Recording';
      startBtn.style.display = 'block';
      stopBtn.style.display = 'none';
      formSection.style.display = 'block';
      recordingInfo.style.display = 'none';
      startBtn.disabled = false;
      startBtn.textContent = 'Start Recording';
      stopBtn.disabled = false;
      stopBtn.textContent = 'Stop Recording';
    }
  }

  // Update status from background
  async function updateStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getRecordingStatus'
      });

      if (response.isRecording) {
        updateUI(true, response.tutorialId);
        updateClickCount();
      } else {
        updateUI(false);
      }
    } catch (error) {
      console.error('Error getting status:', error);
    }
  }

  // Update click count
  async function updateClickCount() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getRecordingStatus'
      });

      if (response.clickCount !== undefined) {
        clickCountEl.textContent = response.clickCount;
      }
    } catch (error) {
      console.error('Error getting click count:', error);
    }
  }

  // Show error message
  function showError(message) {
    // Simple error display - could be enhanced
    alert('Error: ' + message);
  }

  // Show success message
  function showSuccess(message) {
    // Simple success display - could be enhanced
    alert('Success: ' + message);
  }

  // Show success with link to view tutorial
  function showSuccessWithLink(message, tutorialId) {
    const editUrl = `http://localhost:3000/tutorial-editor.html?id=${tutorialId}`;
    if (confirm(message + '\n\nOpen tutorial editor?')) {
      chrome.tabs.create({ url: editUrl });
    }
  }
});

