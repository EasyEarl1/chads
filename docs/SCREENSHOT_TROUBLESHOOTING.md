# Why Some Tutorial Screenshots Are Missing

This doc explains likely causes and how to confirm them from logs. You can paste it (and your logs) to Gemini for improvement ideas.

## How screenshots are captured

1. **Content script** (on click/input/submit): calls `requestScreenshot()` → sends message to background.
2. **Background** (`handleCaptureScreenshot`): throttles to ~1 capture every 550ms, then calls `chrome.tabs.captureVisibleTab(null, { format: 'png' })`.
3. **Backend** (`POST /:id/click`): receives step + optional screenshot base64, saves to `screenshots/<tutorialId>/step_N_*.png`.

If any step has no screenshot, the editor shows "Screenshot not available" for that step.

---

## Likely reasons screenshots are missing

### 1. **Chrome rate limit (most common)**

- Chrome allows about **2 `captureVisibleTab` calls per second** (hard limit, cannot be raised).
- If the user does several actions in under a second (e.g. click, then type, then another click), the 2nd or 3rd capture can fail with an error like:
  - `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`
  - Or a generic error from the extension.
- **Mitigation in code:** The background script now waits at least 550ms between captures. If actions happen faster than that (e.g. two steps in &lt; 1 second), the later one can still miss.
- **What to check:** In the **extension’s Service Worker console** (chrome://extensions → ClickTut → “Service worker”): look for `ClickTut: Screenshot failed: ... rate limit` or similar. In the **page console**: `ClickTut: Screenshot not available for this step (reason: rate_limit ...)`.

### 2. **Wrong or restricted tab**

- `captureVisibleTab(null)` captures the **currently active tab** in the **current window**, not necessarily the tab where the click happened.
- If the user has multiple tabs and the **recording tab is not focused** when the capture runs, the screenshot can be of the wrong tab (or fail on restricted URLs).
- **Restricted URLs:** Chrome does not allow capture on `chrome://`, `edge://`, the Chrome Web Store, or some internal pages. Those calls can fail or return null.
- **What to check:** Service Worker log: `ClickTut: Screenshot failed: ...` with a message about permission or “cannot capture”. If the user had another tab focused, no specific error may appear but the stored screenshot would be wrong; we don’t currently detect “wrong tab”.

### 3. **Timing / page not ready**

- Capture runs immediately when the content script requests it. If the page is still navigating or the tab is not yet painted (e.g. right after a click that navigates), the capture can be blank, outdated, or fail.
- **What to check:** Missing screenshots on steps that clearly caused navigation (e.g. “Click API tokens” then next step has no screenshot). No single log line for this; inferred from which step numbers are missing screenshots.

### 4. **Backend never received a screenshot**

- The extension might have sent the step with `screenshot: null` (e.g. after a rate limit or permission error). The backend still saves the step but does not save an image.
- **What to check:** **Backend terminal**: `ClickTut backend: Step N recorded without screenshot (extension may have hit rate limit or permission)`. That means the request for that step had no screenshot payload.

---

## Logs to collect when debugging

1. **Extension Service Worker**
   - Open `chrome://extensions`, find ClickTut, click “Service worker”.
   - Reproduce the tutorial (or at least the part where screenshots are missing).
   - Copy any `ClickTut: Screenshot failed`, `capture_returned null`, or `rate limit` messages.

2. **Page console (optional)**
   - On the page where you’re recording, F12 → Console.
   - Look for: `ClickTut: Screenshot not available for this step (reason: ...)`.

3. **Backend terminal**
   - Where you run `npm run dev`.
   - Look for: `ClickTut backend: Step N recorded without screenshot (...)`.

Paste these logs (and which step numbers had no screenshot) to Gemini to get targeted suggestions (e.g. queue all screenshot requests and process one every 600ms, or “pre-click” capture strategies).

---

## Summary table

| Symptom | Likely cause | Where to see it |
|--------|----------------|------------------|
| Every 2nd/3rd step in a fast sequence has no screenshot | Chrome 2/sec rate limit | Service Worker: “Screenshot failed” / rate limit; Backend: “Step N recorded without screenshot” |
| No screenshot on a specific step (e.g. after opening a new tab) | Wrong tab or new tab not ready | Inferred from step order; possibly “no active tab” in Service Worker |
| No screenshot only on chrome:// or extension pages | Restricted URL | Service Worker: permission or capture error |
| Random steps missing | Throttle not enough or timing | Service Worker + Backend logs for those step numbers |
