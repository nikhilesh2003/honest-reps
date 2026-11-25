const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerLen = 6;
  const dirEntryLen = 16;
  let offset = headerLen + count * dirEntryLen;

  const header = Buffer.alloc(headerLen);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  for (const img of pngBuffers) {
    const entry = Buffer.alloc(dirEntryLen);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers.map((img) => img.buffer)]);
}

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="108" fill="#000000"/>
  <!-- Left neon green dumbbell plates -->
  <rect x="44" y="214" width="18" height="84" rx="7" transform="skewX(-6)" fill="#10e760"/>
  <rect x="70" y="194" width="24" height="124" rx="8" transform="skewX(-6)" fill="#10e760"/>
  <rect x="102" y="170" width="34" height="172" rx="10" transform="skewX(-6)" fill="#10e760"/>
  <!-- Center Honest Reps H mark -->
  <path d="M188 136h56l-18 108h66l18-108h56l-24 128H164l24-128zm-26 144h178l-24 120h-56l16-78h-66l-16 78h-56l24-120z" fill="#ffffff"/>
  <!-- Right neon green dumbbell plates -->
  <rect x="376" y="170" width="34" height="172" rx="10" transform="skewX(-6)" fill="#10e760"/>
  <rect x="418" y="194" width="24" height="124" rx="8" transform="skewX(-6)" fill="#10e760"/>
  <rect x="450" y="214" width="18" height="84" rx="7" transform="skewX(-6)" fill="#10e760"/>
</svg>`;

async function renderBlackBgPng(trimmedBuf, size, paddingRatio = 0.1) {
  const innerSize = Math.max(8, Math.round(size * (1 - paddingRatio * 2)));
  const resizedLogo = await sharp(trimmedBuf)
    .resize(innerSize, innerSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: resizedLogo, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  const srcLogo = path.resolve("public/icons/logo-icon.png");
  const trimmedBuf = await sharp(srcLogo).trim().png().toBuffer();

  // Master 512x512 black-background PNGs
  const png512 = await renderBlackBgPng(trimmedBuf, 512, 0.09);
  fs.writeFileSync(path.resolve("public/icon.png"), png512);
  fs.writeFileSync(path.resolve("src/app/icon.png"), png512);
  fs.writeFileSync(path.resolve("public/icons/logo-icon.png"), png512);

  // 192x192 PWA Android icon
  const png192 = await renderBlackBgPng(trimmedBuf, 192, 0.09);
  fs.writeFileSync(path.resolve("public/icon-192x192.png"), png192);

  // 180x180 Apple Touch Icons (exact iOS size, solid #000000 background)
  const png180 = await renderBlackBgPng(trimmedBuf, 180, 0.09);
  fs.writeFileSync(path.resolve("public/apple-touch-icon.png"), png180);
  fs.writeFileSync(path.resolve("public/apple-touch-icon-precomposed.png"), png180);
  fs.writeFileSync(path.resolve("src/app/apple-icon.png"), png180);

  // 96x96, 48x48, 32x32, 16x16 desktop/browser favicons
  const png96 = await renderBlackBgPng(trimmedBuf, 96, 0.08);
  fs.writeFileSync(path.resolve("public/favicon-96x96.png"), png96);

  const png48 = await renderBlackBgPng(trimmedBuf, 48, 0.08);
  fs.writeFileSync(path.resolve("public/favicon-48x48.png"), png48);

  const png32 = await renderBlackBgPng(trimmedBuf, 32, 0.06);
  fs.writeFileSync(path.resolve("public/favicon-32x32.png"), png32);

  const png16 = await renderBlackBgPng(trimmedBuf, 16, 0.04);
  fs.writeFileSync(path.resolve("public/favicon-16x16.png"), png16);

  // Multi-resolution binary ICO (48, 32, 16)
  const icoBuffer = buildIco([
    { width: 48, height: 48, buffer: png48 },
    { width: 32, height: 32, buffer: png32 },
    { width: 16, height: 16, buffer: png16 },
  ]);
  fs.writeFileSync(path.resolve("public/favicon.ico"), icoBuffer);

  // SVG favicon
  fs.writeFileSync(path.resolve("public/favicon.svg"), faviconSvg);

  console.log("Generated full black-background Carzlync favicon suite successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
