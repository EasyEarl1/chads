/**
 * ClickTut Final Boss Thumbnail: 4-layer Sharp composition.
 * Layer 0: AI background. Layer 1: Tilted UI card (shadow + border). Layer 2: Face. Layer 3: Logo. Layer 4: Text.
 */
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

const THUMB_WIDTH = 1280;
const THUMB_HEIGHT = 720;
const CARD_WIDTH = 640;
const CARD_HEIGHT = 360;
const CORNER_RADIUS = 24;
const BORDER_PX = 10;
const SHADOW_BLUR = 40;
const SHADOW_OPACITY = 0.5;
const TILT_DEG = -4;

/**
 * Process hero screenshot: resize, 10px white border, rounded corners, drop shadow, rotate -4°.
 * Returns { buffer, width, height } for the tilted card (with shadow) to composite.
 */
async function processHeroCard(heroImagePath, options = {}) {
  const { brandColorHex } = options;
  const resolved = path.isAbsolute(heroImagePath) ? heroImagePath : path.resolve(process.cwd(), heroImagePath);
  const buf = await fs.readFile(resolved);
  const meta = await sharp(buf).metadata();
  const imgW = meta.width || 800;
  const imgH = meta.height || 600;

  const w = CARD_WIDTH;
  const h = CARD_HEIGHT;
  const paddedW = w + BORDER_PX * 2;
  const paddedH = h + BORDER_PX * 2;

  let card = await sharp(buf)
    .resize(w, h, { fit: 'inside' })
    .extend({ top: BORDER_PX, bottom: BORDER_PX, left: BORDER_PX, right: BORDER_PX, background: '#ffffff' })
    .png()
    .toBuffer();

  const maskSvg = `<svg width="${paddedW}" height="${paddedH}"><rect width="${paddedW}" height="${paddedH}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="white"/></svg>`;
  const maskBuf = await sharp(Buffer.from(maskSvg))
    .resize(paddedW, paddedH)
    .png()
    .toBuffer();
  card = await sharp(card)
    .composite([{ input: maskBuf, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const shadowOffset = 20;
  const shadowPad = SHADOW_BLUR + shadowOffset;
  const shadowW = paddedW + shadowPad * 2;
  const shadowH = paddedH + shadowPad * 2;
  const shadowSvg = `<svg width="${shadowW}" height="${shadowH}"><rect x="${shadowOffset}" y="${shadowOffset}" width="${paddedW}" height="${paddedH}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="black" fill-opacity="${SHADOW_OPACITY}"/></svg>`;
  let shadowBuf = await sharp(Buffer.from(shadowSvg))
    .resize(shadowW, shadowH)
    .blur(SHADOW_BLUR)
    .png()
    .toBuffer();

  const cardWithShadow = await sharp(shadowBuf)
    .composite([{ input: card, left: shadowOffset, top: shadowOffset }])
    .rotate(TILT_DEG, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const tiltedMeta = await sharp(cardWithShadow).metadata();
  return { buffer: cardWithShadow, width: tiltedMeta.width || paddedW, height: tiltedMeta.height || paddedH };
}

/**
 * Build title SVG: Archivo Black (fallback Arial Black), white, 6px black stroke, drop shadow.
 */
function buildTitleSvg(condensedTitle) {
  const safe = String(condensedTitle || 'TUTORIAL').replace(/[<>'"&]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' })[c] || c);
  const fontSize = 72;
  const x = 56;
  const y = 120;
  return `<svg width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="textShadow"><feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#000" flood-opacity="0.6"/></filter></defs>
  <text x="${x}" y="${y}" font-family="Archivo Black, Arial Black, sans-serif" font-size="${fontSize}" font-weight="900" fill="#ffffff" stroke="#000000" stroke-width="6" paint-order="stroke" filter="url(#textShadow)">${safe}</text>
</svg>`;
}

/**
 * Composite all layers and save to outputPath.
 * Options: { baseBgPath, heroCardBuffer, heroCardW, heroCardH, facePath, logoBuffer, condensedTitle, outputPath }
 */
async function composeThumbnail(options) {
  const {
    baseBgPath,
    heroCardBuffer,
    heroCardW,
    heroCardH,
    facePath,
    logoBuffer,
    condensedTitle,
    outputPath
  } = options;

  if (!baseBgPath || !heroCardBuffer || !outputPath) {
    throw new Error('thumbnail compositor: baseBgPath, heroCardBuffer, outputPath required');
  }

  let base = await sharp(await fs.readFile(baseBgPath))
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover' })
    .toBuffer();

  const cardLeft = Math.round(THUMB_WIDTH * 0.08);
  const cardTop = Math.round((THUMB_HEIGHT - heroCardH) / 2);
  const maxCardW = THUMB_WIDTH - cardLeft - 40;
  const maxCardH = THUMB_HEIGHT - cardTop - 40;
  let cardInput = heroCardBuffer;
  let cardW = heroCardW;
  let cardH = heroCardH;
  if (heroCardW > maxCardW || heroCardH > maxCardH) {
    const scale = Math.min(maxCardW / heroCardW, maxCardH / heroCardH);
    cardW = Math.round(heroCardW * scale);
    cardH = Math.round(heroCardH * scale);
    cardInput = await sharp(heroCardBuffer).resize(cardW, cardH, { fit: 'inside' }).png().toBuffer();
  }
  const composites = [
    { input: cardInput, left: cardLeft, top: cardTop }
  ];

  if (facePath) {
    try {
      await fs.access(facePath);
      const faceBuf = await fs.readFile(facePath);
      const faceMeta = await sharp(faceBuf).metadata();
      const faceW = Math.min(320, faceMeta.width || 320);
      const faceH = Math.round(faceW * ((faceMeta.height || 400) / (faceMeta.width || 320)));
      const faceResized = await sharp(faceBuf).resize(faceW, faceH, { fit: 'cover' }).png().toBuffer();
      const faceLeft = THUMB_WIDTH - faceW - 40;
      const faceTop = Math.round((THUMB_HEIGHT - faceH) / 2);
      composites.push({ input: faceResized, left: faceLeft, top: faceTop });
    } catch (_) {}
  }

  if (logoBuffer && logoBuffer.length > 0) {
    try {
      const logoSize = 64;
      const logoImg = await sharp(logoBuffer).resize(logoSize, logoSize).png().toBuffer();
      composites.push({ input: logoImg, left: 32, top: 32 });
    } catch (_) {}
  }

  const textSvg = buildTitleSvg(condensedTitle);
  composites.push({ input: Buffer.from(textSvg), left: 0, top: 0 });

  await sharp(base)
    .composite(composites)
    .jpeg({ quality: 92 })
    .toFile(outputPath);

  return outputPath;
}

module.exports = {
  processHeroCard,
  buildTitleSvg,
  composeThumbnail,
  THUMB_WIDTH,
  THUMB_HEIGHT
};
