/**
 * Shared image utilities for ClickTut: Smart Crop (zoom) used by both Publish and Thumbnail.
 */
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

/**
 * Create a smart zoom crop around the element: 16:9, centered on element, with context buffer.
 * Used by: Publish (per-step zooms) and Thumbnail (hero step).
 * Returns { zoomPath, crop: { left, top, width, height }, imgW, imgH } or null.
 */
async function createSmartZoom(fullImagePath, elementRect, viewport, tutorialDir, stepNum) {
  try {
    const resolved = path.isAbsolute(fullImagePath) ? fullImagePath : path.resolve(process.cwd(), fullImagePath);
    const buf = await fs.readFile(resolved);
    const meta = await sharp(buf).metadata();
    const imgW = meta.width || viewport.width;
    const imgH = meta.height || viewport.height;
    const scaleX = imgW / (viewport.width || 1);
    const scaleY = imgH / (viewport.height || 1);
    const elLeft = elementRect.left * scaleX;
    const elTop = elementRect.top * scaleY;
    const elW = elementRect.width * scaleX;
    const elH = elementRect.height * scaleY;
    const cx = elLeft + elW / 2;
    const cy = elTop + elH / 2;
    const buffer = 200;
    let cropW = Math.max(elW + buffer * 2, elW * 2.5);
    let cropH = Math.max(elH + buffer * 2, elH * 2.5);
    if (cropW / cropH > 16 / 9) cropH = cropW * (9 / 16);
    else cropW = cropH * (16 / 9);
    let left = Math.round(cx - cropW / 2);
    let top = Math.round(cy - cropH / 2);
    left = Math.max(0, Math.min(imgW - cropW, left));
    top = Math.max(0, Math.min(imgH - cropH, top));
    const width = Math.round(Math.min(cropW, imgW - left));
    const height = Math.round(Math.min(cropH, imgH - top));
    if (width < 20 || height < 20) return null;
    const zoomFilename = `step_${stepNum}_zoom.png`;
    const zoomPath = path.join(tutorialDir, zoomFilename);
    await sharp(buf)
      .extract({ left, top, width, height })
      .png()
      .toFile(zoomPath);
    return { zoomPath, crop: { left, top, width, height }, imgW, imgH };
  } catch (err) {
    console.warn('ClickTut: createSmartZoom failed', err.message);
    return null;
  }
}

module.exports = { createSmartZoom };
