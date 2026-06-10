import { readdirSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import sharp from "sharp";

/**
 * ASSET-PLAN T1: gpt-image-2 cannot output transparency, so sprites are
 * rendered on solid #FF00FF. This strips the key to alpha, despills the
 * magenta fringe, trims to content, and emits @1x (half-size) next to the
 * full-resolution @2x.
 *
 * Usage: node tools/strip-chroma.mjs <dir-or-file> [...more]
 * Output: <name>@2x.png and <name>@1x.png in the same directory; the raw
 * chroma original keeps its name so re-runs are idempotent (skips files
 * already containing "@").
 */

const KEY = { r: 255, g: 0, b: 255 };
const TOLERANCE = 90; // euclidean rgb distance counted as background
const DESPILL_RADIUS = 150; // distance within which magenta spill is muted

async function strip(file) {
  const img = sharp(file).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    const dr = data[o] - KEY.r;
    const dg = data[o + 1] - KEY.g;
    const db = data[o + 2] - KEY.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < TOLERANCE) {
      data[o + 3] = 0;
      continue;
    }
    if (dist < DESPILL_RADIUS) {
      // Despill: pull the magenta cast toward neutral, keep luminance.
      const spill = 1 - (dist - TOLERANCE) / (DESPILL_RADIUS - TOLERANCE);
      const g = data[o + 1];
      data[o] = Math.round(data[o] - (data[o] - g) * spill * 0.7);
      data[o + 2] = Math.round(data[o + 2] - (data[o + 2] - g) * spill * 0.7);
      data[o + 3] = Math.round(255 * Math.min(1, 0.35 + (1 - spill)));
    }
    const x = i % info.width;
    const y = Math.floor(i / info.width);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX <= minX || maxY <= minY) {
    console.warn(`SKIP ${file}: nothing survived the key — wrong background color?`);
    return;
  }
  const pad = 4;
  const region = {
    left: Math.max(0, minX - pad),
    top: Math.max(0, minY - pad),
    width: Math.min(info.width, maxX + pad) - Math.max(0, minX - pad),
    height: Math.min(info.height, maxY + pad) - Math.max(0, minY - pad),
  };
  const base = join(
    file.slice(0, file.length - basename(file).length),
    basename(file, extname(file)),
  );
  const cut = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).extract(
    region,
  );
  await cut.clone().png().toFile(`${base}@2x.png`);
  await cut
    .clone()
    .resize(Math.round(region.width / 2))
    .png()
    .toFile(`${base}@1x.png`);
  console.log(`OK ${basename(file)} -> @2x ${region.width}x${region.height}`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node tools/strip-chroma.mjs <dir-or-file> [...]");
  process.exit(1);
}
for (const arg of args) {
  let files;
  try {
    files = readdirSync(arg)
      .filter((f) => f.endsWith(".png") && !f.includes("@"))
      .map((f) => join(arg, f));
  } catch {
    files = [arg];
  }
  mkdirSync(arg, { recursive: true });
  for (const file of files) {
    await strip(file);
  }
}
