"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const sharp = require("sharp");
const modern = require("../lib/site/modern-images-manifest.json");

const root = path.resolve(__dirname, "..");
const profiles = {
  home: { source: "home-copy-team.png", widths: [480, 720, 960, 1280, 1680] },
  deep: { source: "tild3237-3730-4638-a162-393866363766__group_195_1.png", widths: [480, 960, 1440, 1680] },
};

async function main() {
  const manifest = {};
  for (const [name, profile] of Object.entries(profiles)) {
    const input = await fs.readFile(path.join(root, "images", profile.source));
    const hash = createHash("sha256").update(input).update("avif65-webp80-v1").digest("hex").slice(0, 10);
    const metadata = await sharp(input).metadata();
    const entry = { width: metadata.width, height: metadata.height, avif: [], webp: [] };
    for (const format of ["avif", "webp"]) {
      for (const width of profile.widths) {
        const existing = format === "webp" && (name === "home" ? `/images/home-copy-team-${width}.webp`
          : modern.images[`/images/${profile.source}`].variants.find(item => item.width === width)?.url);
        if (existing) {
          const file = path.join(root, existing);
          const metadata = await sharp(file).metadata();
          entry[format].push({ url: existing, width: metadata.width, height: metadata.height, bytes: (await fs.stat(file)).size });
          continue;
        }
        const url = `/images/optimized/${name}-hero-${hash}-w${width}.${format}`;
        const output = path.join(root, url);
        const image = sharp(input).resize({ width, withoutEnlargement: true });
        await (format === "avif" ? image.avif({ quality: 65, effort: 7 }) : image.webp({ quality: 80, effort: 6 })).toFile(output);
        const result = await sharp(output).metadata();
        entry[format].push({ url, width: result.width, height: result.height, bytes: (await fs.stat(output)).size });
      }
    }
    manifest[name] = entry;
  }
  await fs.writeFile(path.join(root, "lib/site/first-screen-images.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
