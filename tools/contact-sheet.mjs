import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";

/**
 * ASSET-PLAN T2: tile every @2x sprite in a directory into one labeled
 * contact sheet for style review.
 *
 * Usage: node tools/contact-sheet.mjs <dir> [out.png]
 */

const dir = process.argv[2];
const out = process.argv[3] ?? join(dir, "_contact-sheet.png");
const CELL = 280;
const LABEL = 26;

const files = readdirSync(dir)
  .filter((f) => f.endsWith("@2x.png"))
  .map((f) => join(dir, f));
if (files.length === 0) {
  console.error(`no @2x.png sprites in ${dir} — run strip-chroma first`);
  process.exit(1);
}
const cols = Math.ceil(Math.sqrt(files.length));
const rows = Math.ceil(files.length / cols);

const composites = [];
for (let i = 0; i < files.length; i++) {
  const x = (i % cols) * CELL;
  const y = Math.floor(i / cols) * (CELL + LABEL);
  const thumb = await sharp(files[i])
    .resize(CELL - 16, CELL - 16, { fit: "inside" })
    .png()
    .toBuffer();
  composites.push({ input: thumb, left: x + 8, top: y + 8 });
  const name = basename(files[i], "@2x.png");
  const svg = `<svg width="${CELL}" height="${LABEL}"><text x="${CELL / 2}" y="18" text-anchor="middle" font-family="monospace" font-size="13" fill="#9fb0c8">${name}</text></svg>`;
  composites.push({ input: Buffer.from(svg), left: x, top: y + CELL - 8 });
}
await sharp({
  create: {
    width: cols * CELL,
    height: rows * (CELL + LABEL),
    channels: 4,
    background: { r: 11, g: 13, b: 18, alpha: 1 },
  },
})
  .composite(composites)
  .png()
  .toFile(out);
console.log(`contact sheet: ${out} (${files.length} sprites, ${cols}x${rows})`);
