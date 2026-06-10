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
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    // Hue-based key: anything magenta-toned is background — including the
    // object's soft shadow, which the model renders ON the magenta and so
    // arrives as DARK magenta (a plain distance-to-key test keeps it and
    // produces a purple halo). Real object colors (white MLI, gold foil,
    // amber windows, cyan accents) all fail the |r−b| symmetry test.
    const m = Math.min(r, b);
    const isMagentaHue = m - g > 28 && Math.abs(r - b) < 72;
    if (isMagentaHue) {
      // Reconstruct the shadow: how much darker than the pure key this
      // pixel is becomes black-with-alpha; pure key (m≈255) vanishes.
      const shade = Math.max(0, Math.min(1, (235 - m) / 235));
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = Math.round(170 * shade);
      if (data[o + 3] < 12) {
        data[o + 3] = 0;
        continue;
      }
    } else if (g > 0 && m > g * 1.05) {
      // Mild magenta spill on object edges: pull r/b toward g.
      const spill = Math.min(1, (m / g - 1.05) * 1.4);
      data[o] = Math.round(r - (r - g) * spill * 0.6);
      data[o + 2] = Math.round(b - (b - g) * spill * 0.6);
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
