const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const { execFile } = require('child_process');

const VIEWPORT = { width: 1920, height: 1080 };
const MOUSE_MOVE_STEPS = 45;
const PAUSE_BEFORE_ACTION = 800;
const PAUSE_AFTER_ACTION = 1800;
const PAUSE_AFTER_NAV = 3000;
const PAUSE_AFTER_CLICK_NAV = 2500;
const HIGHLIGHT_LINGER_MS = 400;

// ── Highlight + Banner CSS/JS injected into the page ──

const INJECT_STYLES = `
<style id="clicktut-styles">
  @keyframes clicktut-pulse {
    0%, 100% { box-shadow: 0 0 0 4px rgba(102,126,234,0.7), 0 0 20px rgba(102,126,234,0.15); }
    50%      { box-shadow: 0 0 0 10px rgba(102,126,234,0.25), 0 0 30px rgba(102,126,234,0.08); }
  }
  .clicktut-highlight {
    animation: clicktut-pulse 0.9s ease-in-out infinite !important;
    outline: 3px solid rgba(102,126,234,0.8) !important;
    outline-offset: 3px !important;
    border-radius: 4px;
    position: relative;
    z-index: 999999 !important;
  }
  #clicktut-banner {
    position: fixed !important;
    bottom: 0 !important; left: 0 !important; right: 0 !important;
    height: 90px !important;
    background: linear-gradient(180deg, rgba(15,15,30,0.0) 0%, rgba(15,15,30,0.85) 40%, rgba(15,15,30,0.95) 100%) !important;
    display: flex !important; align-items: flex-end !important;
    padding: 0 40px 18px !important;
    z-index: 9999999 !important;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif !important;
    transition: opacity 0.35s ease !important;
    pointer-events: none !important;
  }
  #clicktut-banner .step-num {
    color: rgba(140,160,255,0.9);
    font-size: 14px; font-weight: 700;
    margin-right: 16px; white-space: nowrap;
    letter-spacing: 0.5px;
  }
  #clicktut-banner .step-text {
    color: rgba(255,255,255,0.95);
    font-size: 22px; font-weight: 500;
    text-shadow: 0 1px 4px rgba(0,0,0,0.5);
    line-height: 1.3;
  }
</style>`;

async function injectBaseStyles(page) {
  await page.evaluate((css) => {
    if (!document.getElementById('clicktut-styles')) {
      document.head.insertAdjacentHTML('beforeend', css);
    }
  }, INJECT_STYLES);
}

async function injectHighlight(page, elementHandle) {
  await page.evaluate((el) => {
    document.querySelectorAll('.clicktut-highlight').forEach(e => e.classList.remove('clicktut-highlight'));
    if (el) el.classList.add('clicktut-highlight');
  }, elementHandle);
}

async function removeHighlight(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.clicktut-highlight').forEach(e => e.classList.remove('clicktut-highlight'));
  });
}

async function injectBanner(page, stepNum, totalSteps, text) {
  const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  await page.evaluate(({ stepNum, totalSteps, escaped }) => {
    let banner = document.getElementById('clicktut-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'clicktut-banner';
      document.body.appendChild(banner);
    }
    banner.innerHTML = `<span class="step-num">STEP ${stepNum} / ${totalSteps}</span><span class="step-text">${escaped}</span>`;
    banner.style.opacity = '1';
  }, { stepNum, totalSteps, escaped });
}

async function hideBanner(page) {
  await page.evaluate(() => {
    const b = document.getElementById('clicktut-banner');
    if (b) b.style.opacity = '0';
  });
}

// ── Element finding with fallback chain ──

async function findElement(page, step) {
  const el = step.clickData?.element || {};
  const stack = el.selectorStack || {};
  const strategies = [];

  if (stack.id) strategies.push({ type: 'css', value: stack.id });
  if (stack.robust) strategies.push({ type: 'css', value: stack.robust });
  if (el.selector) strategies.push({ type: 'css', value: el.selector });
  if (el.id) strategies.push({ type: 'css', value: `#${el.id}` });
  if (stack.xpath) strategies.push({ type: 'xpath', value: stack.xpath });
  if (el.text && el.tag) {
    const cleanText = el.text.trim().substring(0, 40);
    if (cleanText) strategies.push({ type: 'text', value: cleanText, tag: el.tag });
  }

  for (const s of strategies) {
    try {
      let handle;
      if (s.type === 'css') {
        handle = await page.$(s.value);
      } else if (s.type === 'xpath') {
        handle = await page.$(`xpath=${s.value}`);
      } else if (s.type === 'text') {
        handle = await page.$(`${s.tag}:has-text("${s.value.replace(/"/g, '\\"')}")`);
      }
      if (handle) {
        const box = await handle.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          return handle;
        }
      }
    } catch (_) {}
  }

  return null;
}

async function waitForPageSettled(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch (_) {}
  await page.waitForTimeout(PAUSE_AFTER_NAV);
}

async function scrollToElement(page, handle) {
  await handle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
}

async function smoothMouseMove(page, targetX, targetY) {
  await page.mouse.move(targetX, targetY, { steps: MOUSE_MOVE_STEPS });
}

function safeHostname(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function sameOrigin(urlA, urlB) {
  try { return new URL(urlA).origin === new URL(urlB).origin; } catch { return false; }
}

function samePage(urlA, urlB) {
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch { return false; }
}

async function injectLoginBanner(page, intendedUrl) {
  await page.evaluate((url) => {
    const banner = document.createElement('div');
    banner.id = 'clicktut-login-banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999999;
      background: linear-gradient(135deg, #667eea, #764ba2); color: white;
      padding: 18px 30px; font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 16px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    banner.innerHTML = '<strong>ClickTut:</strong> Please log in to continue. The replay will resume automatically after login.';
    document.body.appendChild(banner);
  }, intendedUrl);
}

// ── Main replay function ──

async function replayTutorial(tutorial, opts = {}) {
  const steps = tutorial.steps.filter(s => s.clickData?.page?.url);
  if (steps.length === 0) throw new Error('No replayable steps found');

  const videosDir = path.resolve(process.cwd(), 'videos');
  const tempDir = path.join(videosDir, `replay_${tutorial._id}`);
  await fs.mkdir(tempDir, { recursive: true });

  const totalSteps = steps.length;
  const cookies = opts.cookies || [];
  console.log(`🎬 Replay: launching browser for "${tutorial.title}" (${totalSteps} steps, ${cookies.length} cookies)`);

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized'
    ]
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: {
      dir: tempDir,
      size: VIEWPORT
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    colorScheme: 'light'
  });

  // Inject captured cookies before navigating — one at a time to skip bad ones
  if (cookies.length > 0) {
    let injected = 0;
    let skipped = 0;
    for (const c of cookies) {
      try {
        let sameSite = 'Lax';
        if (c.sameSite === 'no_restriction') sameSite = 'None';
        else if (c.sameSite === 'lax') sameSite = 'Lax';
        else if (c.sameSite === 'strict') sameSite = 'Strict';

        if (sameSite === 'None' && !c.secure) {
          c.secure = true;
        }

        await context.addCookies([{
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure: c.secure || false,
          httpOnly: c.httpOnly || false,
          sameSite,
          expires: c.expires && c.expires > 0 ? c.expires : undefined
        }]);
        injected++;
      } catch (e) {
        skipped++;
      }
    }
    console.log(`🎬 Cookies: ${injected} injected, ${skipped} skipped out of ${cookies.length}`);
  } else {
    console.log('🎬 No cookies provided — authenticated pages will likely show login');
  }

  const page = await context.newPage();
  let currentUrl = '';
  const failedSteps = [];
  let userLoggedIn = false;

  try {
    for (let i = 0; i < totalSteps; i++) {
      const step = steps[i];
      const el = step.clickData?.element || {};
      const coords = step.clickData?.coordinates || {};
      const pageUrl = step.clickData?.page?.url;
      const actionType = el.actionType || 'click';
      const instruction = step.instruction || '';
      const stepNum = i + 1;

      console.log(`🎬 Step ${stepNum}/${totalSteps}: ${actionType} - "${(el.text || el.selector || '').substring(0, 50)}"`);

      // ── Smart navigation: only goto() for first load or cross-origin ──
      const liveUrl = currentUrl || '';
      const needsFullNav = !liveUrl || !sameOrigin(liveUrl, pageUrl);

      if (pageUrl && needsFullNav) {
        try {
          console.log(`🎬 Full navigation to: ${pageUrl}`);
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await waitForPageSettled(page);

          // Detect login redirect
          const actualUrl = page.url();
          const wantedHost = safeHostname(pageUrl);
          const actualHost = safeHostname(actualUrl);
          const isLoginRedirect = actualUrl !== pageUrl
            && !actualUrl.startsWith(pageUrl)
            && (actualUrl.includes('/login') || actualUrl.includes('/signin') || actualUrl.includes('/auth') || actualUrl.includes('/sso') || actualHost !== wantedHost);

          if (isLoginRedirect && !userLoggedIn) {
            console.log(`🎬 Login redirect detected! Expected: ${pageUrl}`);
            console.log(`🎬 Actual:   ${actualUrl}`);
            console.log('🎬 Waiting up to 120s for you to log in via the open browser window...');

            await injectLoginBanner(page, pageUrl);

            const loginStart = Date.now();
            const LOGIN_TIMEOUT = 120000;
            while (Date.now() - loginStart < LOGIN_TIMEOUT) {
              await page.waitForTimeout(2000);
              const nowUrl = page.url();
              const stillLogin = nowUrl.includes('/login') || nowUrl.includes('/signin') || nowUrl.includes('/auth') || nowUrl.includes('/sso');
              if (!stillLogin && nowUrl !== actualUrl) {
                console.log(`🎬 Login complete! Now at: ${nowUrl}`);
                userLoggedIn = true;
                break;
              }
            }

            if (!userLoggedIn) {
              console.warn('🎬 Login timeout — continuing anyway');
            }

            try {
              await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
              await waitForPageSettled(page);
            } catch (_) {}
          }

          currentUrl = page.url();
        } catch (navErr) {
          console.warn(`🎬 Navigation failed for step ${stepNum}: ${navErr.message}`);
          failedSteps.push(stepNum);
          continue;
        }
      }

      await injectBaseStyles(page);
      await injectBanner(page, stepNum, totalSteps, instruction);

      // Find the target element on the current page
      let handle = await findElement(page, step);

      // If element not found and we're on a different pathname, try navigating
      if (!handle && pageUrl && !samePage(page.url(), pageUrl)) {
        console.log(`🎬 Element not found, navigating to: ${pageUrl}`);
        try {
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await waitForPageSettled(page);
          currentUrl = page.url();
          await injectBaseStyles(page);
          await injectBanner(page, stepNum, totalSteps, instruction);
          handle = await findElement(page, step);
        } catch (_) {}
      }

      if (handle) {
        await scrollToElement(page, handle);
        await injectHighlight(page, handle);

        const box = await handle.boundingBox();
        if (box) {
          const targetX = box.x + box.width / 2;
          const targetY = box.y + box.height / 2;

          await smoothMouseMove(page, targetX, targetY);
          await page.waitForTimeout(PAUSE_BEFORE_ACTION);

          // Remember URL before action to detect navigation
          const urlBeforeAction = page.url();

          if (actionType === 'input' && el.inputValue) {
            await handle.click();
            await page.waitForTimeout(200);
            await handle.fill(el.inputValue);
            await page.waitForTimeout(400);
          } else {
            await handle.click().catch(async () => {
              await page.mouse.click(targetX, targetY);
            });
          }

          // If the click triggered navigation, wait for the page to settle
          await page.waitForTimeout(500);
          const urlAfterAction = page.url();
          if (urlAfterAction !== urlBeforeAction) {
            console.log(`🎬 Click triggered navigation: ${urlAfterAction.substring(0, 80)}`);
            await waitForPageSettled(page);
          }
        } else {
          await fallbackClick(page, coords);
        }
      } else {
        console.warn(`🎬 Element not found for step ${stepNum}, using coordinate fallback`);
        failedSteps.push(stepNum);
        await fallbackClick(page, coords);
      }

      await page.waitForTimeout(HIGHLIGHT_LINGER_MS);
      await removeHighlight(page);
      await page.waitForTimeout(PAUSE_AFTER_ACTION);

      // Keep currentUrl in sync
      try { currentUrl = page.url(); } catch (_) {}
    }

    await hideBanner(page);
    await page.waitForTimeout(800);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  // Playwright saves the video file; find it
  const files = await fs.readdir(tempDir);
  const videoFile = files.find(f => f.endsWith('.webm'));
  if (!videoFile) throw new Error('Playwright did not produce a video file');

  const rawVideoPath = path.join(tempDir, videoFile);
  console.log(`🎬 Raw recording: ${rawVideoPath}`);

  return {
    rawVideoPath,
    tempDir,
    failedSteps,
    totalSteps
  };
}

async function fallbackClick(page, coords) {
  const vp = VIEWPORT;
  const x = coords.x ? Math.min(coords.x, vp.width - 10) : vp.width / 2;
  const y = coords.y ? Math.min(coords.y, vp.height - 10) : vp.height / 2;
  await smoothMouseMove(page, x, y);
  await page.waitForTimeout(PAUSE_BEFORE_ACTION);
  await page.mouse.click(x, y);
}

// ── FFmpeg post-processing ──

function generateTitleCard(title, outputPath) {
  const width = VIEWPORT.width;
  const height = VIEWPORT.height;
  const escaped = title.replace(/'/g, "\u2019").replace(/:/g, '\\:');

  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'lavfi',
      '-i', `color=c=0x111827:s=${width}x${height}:d=2.5:r=30`,
      '-vf', `drawtext=text='${escaped}':fontsize=56:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-20,drawtext=text='Tutorial':fontsize=24:fontcolor=0x8898ee:x=(w-text_w)/2:y=(h/2)+30`,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-y', outputPath
    ];
    execFile('ffmpeg', args, { timeout: 30000 }, (err) => {
      if (err) reject(new Error('Title card generation failed')); else resolve();
    });
  });
}

async function postProcess(rawVideoPath, tutorialTitle, outputPath, tempDir) {
  const titleCardPath = path.join(tempDir, 'title_card.mp4');
  const convertedPath = path.join(tempDir, 'converted.mp4');

  console.log('🎬 Generating title card...');
  await generateTitleCard(tutorialTitle, titleCardPath);

  console.log('🎬 Converting recording to MP4...');
  await new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-i', rawVideoPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-r', '30',
      '-movflags', '+faststart',
      '-y', convertedPath
    ], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('FFmpeg convert error:', stderr?.slice(-500));
        reject(new Error('MP4 conversion failed'));
      } else resolve();
    });
  });

  console.log('🎬 Concatenating title card + recording...');
  const concatListPath = path.join(tempDir, 'concat.txt');
  await fs.writeFile(concatListPath, `file '${titleCardPath.replace(/\\/g, '/')}'\nfile '${convertedPath.replace(/\\/g, '/')}'`);

  await new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-f', 'concat', '-safe', '0',
      '-i', concatListPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-y', outputPath
    ], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('FFmpeg concat error:', stderr?.slice(-500));
        reject(new Error('Concatenation failed'));
      } else resolve();
    });
  });
}

// ── Public API ──

async function generateReplayVideo(tutorial, opts = {}) {
  const { rawVideoPath, tempDir, failedSteps, totalSteps } = await replayTutorial(tutorial, opts);

  const videosDir = path.resolve(process.cwd(), 'videos');
  await fs.mkdir(videosDir, { recursive: true });
  const outputPath = path.join(videosDir, tutorial._id + '.mp4');

  await postProcess(rawVideoPath, tutorial.title, outputPath, tempDir);

  try { await fs.rm(tempDir, { recursive: true, force: true }); } catch (_) {}

  const stat = await fs.stat(outputPath);
  console.log(`🎬 Replay video complete: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);

  return {
    videoPath: outputPath,
    videoUrl: `/api/tutorials/${tutorial._id}/video`,
    fileSize: stat.size,
    failedSteps,
    totalSteps,
    mode: 'replay'
  };
}

module.exports = { generateReplayVideo };
