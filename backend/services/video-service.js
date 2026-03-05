const path = require('path');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const sharp = require('sharp');

const FPS = 30;
const W = 1920;
const H = 1080;

const STEP_HOLD_SEC = 3.5;
const CURSOR_MOVE_SEC = 0.9;
const CLICK_PULSE_SEC = 0.5;
const TRANSITION_SEC = 0.5;
const TEXT_FADE_SEC = 0.3;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a, b, t) { return a + (b - a) * t; }

async function generateCursorFrames(tempDir) {
  const size = 48;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <filter id="s"><feDropShadow dx="1.5" dy="2" stdDeviation="1.8" flood-opacity="0.5"/></filter>
    <path d="M5 2l15 9-7 1.5L10 20z" fill="white" stroke="#222" stroke-width="1.3" stroke-linejoin="round" filter="url(#s)"/>
  </svg>`;
  const cursorPath = path.join(tempDir, 'cursor.png');
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(cursorPath);
  return { cursorPath, size };
}

function generateRippleSvg(radius, opacity) {
  const d = radius * 2 + 8;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}">
    <circle cx="${d/2}" cy="${d/2}" r="${radius}" fill="none" stroke="rgba(102,126,234,${opacity})" stroke-width="3"/>
    <circle cx="${d/2}" cy="${d/2}" r="${Math.max(2, radius * 0.3)}" fill="rgba(102,126,234,${opacity * 0.5})"/>
  </svg>`);
}

function generateTextBar(text, w, stepNum, totalSteps, opacity) {
  const barH = 100;
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const label = `Step ${stepNum} of ${totalSteps}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${barH}">
    <rect width="${w}" height="${barH}" fill="rgba(0,0,0,${(0.6 * opacity).toFixed(2)})" rx="0"/>
    <text x="30" y="42" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700" fill="rgba(160,180,255,${opacity.toFixed(2)})">${label}</text>
    <text x="30" y="72" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="500" fill="rgba(255,255,255,${opacity.toFixed(2)})">${escaped}</text>
  </svg>`;
  return Buffer.from(svg);
}

async function prepareScreenshot(screenshotPath) {
  const resolved = path.isAbsolute(screenshotPath) ? screenshotPath : path.resolve(process.cwd(), screenshotPath);
  try { await fs.access(resolved); } catch { return null; }
  const buf = await sharp(resolved).resize(W, H, { fit: 'cover', position: 'top' }).png().toBuffer();
  return buf;
}

function computeZoomCrop(frame, totalFrames, clickNormX, clickNormY, zoomMax) {
  const t = frame / Math.max(1, totalFrames - 1);
  const zoom = 1 + (zoomMax - 1) * easeInOutCubic(t);
  const cropW = Math.round(W / zoom);
  const cropH = Math.round(H / zoom);
  const focusX = clickNormX * W;
  const focusY = clickNormY * H;
  let left = Math.round(focusX - cropW / 2);
  let top = Math.round(focusY - cropH / 2);
  left = Math.max(0, Math.min(W - cropW, left));
  top = Math.max(0, Math.min(H - cropH, top));
  return { left, top, width: cropW, height: cropH };
}

async function renderFrame(opts) {
  const { baseBuf, nextBuf, transitionProgress, cursorBuf, cursorSize,
    cursorX, cursorY, showCursor, rippleRadius, rippleOpacity,
    textBar, zoomCrop } = opts;

  let img;

  if (zoomCrop && zoomCrop.width < W) {
    img = sharp(baseBuf).extract(zoomCrop).resize(W, H, { fit: 'fill' });
  } else {
    img = sharp(baseBuf);
  }

  let frameBuf = await img.png().toBuffer();

  if (nextBuf && transitionProgress > 0) {
    const alpha = Math.min(1, transitionProgress);
    let nextProcessed = nextBuf;
    const composites = [{
      input: nextProcessed,
      blend: 'over',
      left: 0,
      top: 0,
    }];
    const overlayWithAlpha = await sharp(nextProcessed)
      .ensureAlpha()
      .composite([{
        input: Buffer.from([0, 0, 0, Math.round(alpha * 255)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in'
      }])
      .png().toBuffer();

    frameBuf = await sharp(frameBuf)
      .composite([{ input: overlayWithAlpha, left: 0, top: 0 }])
      .png().toBuffer();
  }

  const composites = [];

  if (textBar) {
    composites.push({ input: textBar, left: 0, top: H - 100, blend: 'over' });
  }

  if (rippleRadius > 0 && rippleOpacity > 0) {
    const rippleSvg = generateRippleSvg(Math.round(rippleRadius), rippleOpacity);
    const rippleD = Math.round(rippleRadius) * 2 + 8;
    const rl = Math.max(0, Math.min(W - rippleD, Math.round(cursorX - rippleD / 2)));
    const rt = Math.max(0, Math.min(H - rippleD, Math.round(cursorY - rippleD / 2)));
    composites.push({ input: rippleSvg, left: rl, top: rt, blend: 'over' });
  }

  if (showCursor && cursorBuf) {
    const cl = Math.max(0, Math.min(W - cursorSize, Math.round(cursorX)));
    const ct = Math.max(0, Math.min(H - cursorSize, Math.round(cursorY)));
    composites.push({ input: cursorBuf, left: cl, top: ct, blend: 'over' });
  }

  if (composites.length > 0) {
    frameBuf = await sharp(frameBuf).composite(composites).png().toBuffer();
  }

  return frameBuf;
}

async function generateVideo(tutorial) {
  const tutorialId = tutorial._id;
  const videosDir = path.resolve(process.cwd(), 'videos');
  const tempDir = path.join(videosDir, `temp_${tutorialId}`);
  const framesDir = path.join(tempDir, 'frames');
  await fs.mkdir(framesDir, { recursive: true });

  console.log(`🎬 Starting video for "${tutorial.title}" (${tutorial.steps.length} steps)`);

  const { cursorPath, size: cursorSize } = await generateCursorFrames(tempDir);
  const cursorBuf = await fs.readFile(cursorPath);

  const steps = tutorial.steps.filter(s => s.screenshot);
  if (steps.length === 0) throw new Error('No screenshots available');

  const screenshots = [];
  for (const step of steps) {
    const buf = await prepareScreenshot(step.screenshot);
    if (!buf) continue;
    const viewport = step.clickData?.page?.viewport || { width: W, height: H };
    const coords = step.clickData?.coordinates || {};
    const scaleX = W / viewport.width;
    const scaleY = H / viewport.height;
    screenshots.push({
      buf,
      clickX: Math.min(Math.max((coords.x || W / 2) * scaleX, 0), W),
      clickY: Math.min(Math.max((coords.y || H / 2) * scaleY, 0), H),
      clickNormX: Math.min(Math.max((coords.x || viewport.width / 2) / viewport.width, 0.1), 0.9),
      clickNormY: Math.min(Math.max((coords.y || viewport.height / 2) / viewport.height, 0.1), 0.9),
      instruction: step.instruction || ''
    });
  }

  if (screenshots.length === 0) throw new Error('No valid screenshots');

  const totalSteps = screenshots.length;
  const holdFrames = Math.round(STEP_HOLD_SEC * FPS);
  const cursorFrames = Math.round(CURSOR_MOVE_SEC * FPS);
  const clickFrames = Math.round(CLICK_PULSE_SEC * FPS);
  const transFrames = Math.round(TRANSITION_SEC * FPS);
  const textFadeFrames = Math.round(TEXT_FADE_SEC * FPS);

  const framesPerStep = holdFrames;
  const overlapFrames = transFrames;

  let globalFrame = 0;
  let prevCursorX = W / 2;
  let prevCursorY = H / 3;

  const totalFrameCount = totalSteps * framesPerStep - (totalSteps - 1) * overlapFrames;
  console.log(`🎬 Rendering ${totalFrameCount} frames (${(totalFrameCount / FPS).toFixed(1)}s)...`);

  for (let stepIdx = 0; stepIdx < totalSteps; stepIdx++) {
    const ss = screenshots[stepIdx];
    const targetX = ss.clickX;
    const targetY = ss.clickY;
    const nextSs = stepIdx < totalSteps - 1 ? screenshots[stepIdx + 1] : null;

    const startCursorX = prevCursorX;
    const startCursorY = prevCursorY;

    for (let f = 0; f < framesPerStep; f++) {
      const absFrame = stepIdx * (framesPerStep - overlapFrames) + f;
      if (absFrame >= totalFrameCount) break;

      const tStep = f / framesPerStep;

      const cursorMoveT = Math.min(1, f / cursorFrames);
      const easedT = easeInOutCubic(cursorMoveT);
      const cx = lerp(startCursorX, targetX, easedT);
      const cy = lerp(startCursorY, targetY, easedT);

      let rippleRadius = 0;
      let rippleOpacity = 0;
      const clickStart = cursorFrames;
      const clickEnd = cursorFrames + clickFrames;
      if (f >= clickStart && f < clickEnd) {
        const ct = (f - clickStart) / clickFrames;
        rippleRadius = lerp(8, 40, ct);
        rippleOpacity = lerp(0.8, 0, ct);
      }

      const zoomStartFrame = cursorFrames;
      const zoomProgress = Math.max(0, (f - zoomStartFrame) / (framesPerStep - zoomStartFrame));
      const zoomCrop = computeZoomCrop(
        Math.max(0, f - zoomStartFrame),
        framesPerStep - zoomStartFrame,
        ss.clickNormX, ss.clickNormY,
        1.18
      );

      let transitionProgress = 0;
      let nextBuf = null;
      if (nextSs && f >= framesPerStep - overlapFrames) {
        transitionProgress = (f - (framesPerStep - overlapFrames)) / overlapFrames;
        nextBuf = nextSs.buf;
      }

      let textOpacity = 0;
      if (f >= textFadeFrames && f < framesPerStep - textFadeFrames) {
        textOpacity = 1;
      } else if (f < textFadeFrames) {
        textOpacity = f / textFadeFrames;
      } else {
        textOpacity = (framesPerStep - f) / textFadeFrames;
      }
      textOpacity = Math.max(0, Math.min(1, textOpacity));

      const textBar = textOpacity > 0.05
        ? generateTextBar(ss.instruction, W, stepIdx + 1, totalSteps, textOpacity)
        : null;

      const frameBuf = await renderFrame({
        baseBuf: ss.buf,
        nextBuf,
        transitionProgress,
        cursorBuf,
        cursorSize,
        cursorX: cx,
        cursorY: cy,
        showCursor: true,
        rippleRadius,
        rippleOpacity,
        textBar,
        zoomCrop: f >= zoomStartFrame ? zoomCrop : null
      });

      const framePath = path.join(framesDir, `frame_${String(absFrame).padStart(5, '0')}.png`);
      await fs.writeFile(framePath, frameBuf);

      if (absFrame % 30 === 0) {
        process.stdout.write(`\r🎬 Frame ${absFrame + 1}/${totalFrameCount}`);
      }
    }

    prevCursorX = targetX;
    prevCursorY = targetY;
  }
  console.log(`\n🎬 All ${totalFrameCount} frames rendered. Encoding...`);

  const outputPath = path.join(videosDir, tutorialId + '.mp4');
  const ffmpegArgs = [
    '-framerate', String(FPS),
    '-i', path.join(framesDir, 'frame_%05d.png'),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y',
    outputPath
  ];

  await new Promise((resolve, reject) => {
    execFile('ffmpeg', ffmpegArgs, { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('FFmpeg encode error:', stderr?.slice(-500));
        reject(new Error('FFmpeg encoding failed'));
      } else {
        resolve();
      }
    });
  });

  try { await fs.rm(tempDir, { recursive: true, force: true }); } catch (_) {}

  const stat = await fs.stat(outputPath);
  const totalDuration = totalFrameCount / FPS;
  console.log(`🎬 Video complete: ${(stat.size / 1024 / 1024).toFixed(1)}MB, ${totalDuration.toFixed(1)}s`);

  return {
    videoPath: outputPath,
    videoUrl: `/api/tutorials/${tutorialId}/video`,
    duration: totalDuration,
    fileSize: stat.size
  };
}

module.exports = { generateVideo };
