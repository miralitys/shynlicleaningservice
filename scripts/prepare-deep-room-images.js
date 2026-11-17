"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const sharp = require("sharp");
const modern = require("../lib/site/modern-images-manifest.json");

const root = path.resolve(__dirname, "..");
const sources = [
  ["living", "/images/tild3437-3538-4663-a566-353339336265__20251223_1600____rem.png"],
  ["kitchen", "/images/tild6431-6233-4663-b431-643364613862__20251223_1600____rem.png"],
  ["bathroom", "/images/tild3432-6435-4564-b161-666132613636__20251223_1600____rem.png"],
  ["bedroom", "/images/tild3039-6233-4634-a637-666331653162__20251223_1600____rem.png"],
];

async function main() {
  const rooms = [];
  for (const [name, original] of sources) {
    const input = await fs.readFile(path.join(root, original));
    const hash = createHash("sha256").update(input).update("webp85-room-v1").digest("hex").slice(0, 10);
    const existing = modern.images[original];
    const room = { name, original, legacy: existing.variants.map(image => image.url), variants: [] };
    for (const width of [150, 225, 260]) {
      const url = `/images/optimized/deep-room-${name}-${hash}-w${width}.webp`;
      const output = path.join(root, url);
      await sharp(input).resize({ width, withoutEnlargement: true }).webp({ quality: 85, effort: 6 }).toFile(output);
      const metadata = await sharp(output).metadata();
      room.variants.push({ url, width: metadata.width, height: metadata.height, bytes: (await fs.stat(output)).size });
    }
    room.variants.push(existing.variants.at(-1));
    rooms.push(room);
  }
  await fs.writeFile(path.join(root, "lib/site/deep-room-images.json"), JSON.stringify(rooms, null, 2) + "\n");
  console.log(JSON.stringify(rooms, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
