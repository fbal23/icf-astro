/**
 * Visual comparison tool for ICF Danmark migration.
 *
 * Usage:
 *   node compare.mjs                    # Compare original (icf-chapters.org) vs Astro dev server
 *   node compare.mjs --baseline-only    # Only capture original baseline
 *   node compare.mjs --current-only     # Only capture Astro (skip original)
 *   node compare.mjs --page /find-coach # Compare a specific page
 *
 * Outputs:
 *   screenshots/original.png  — Original site (icf-chapters.org)
 *   screenshots/current.png   — Astro dev server
 *   screenshots/diff.png      — Pixel differences highlighted in red
 *
 * Also exports pixelmatch, loadPNG, and comparePNGs for reuse by other tools.
 */

import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ORIGINAL_URL,
  ASTRO_URL as CONFIG_ASTRO_URL,
  VIEWPORT as CONFIG_VIEWPORT,
} from "./audit-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");

// Config — use audit-config as source of truth
const ASTRO_URL = CONFIG_ASTRO_URL;
const VIEWPORT = { width: CONFIG_VIEWPORT.width, height: CONFIG_VIEWPORT.height };

// Parse args
const args = process.argv.slice(2);
const baselineOnly = args.includes("--baseline-only");
const currentOnly = args.includes("--current-only");
const pageIdx = args.indexOf("--page");
const pagePath = pageIdx !== -1 ? args[pageIdx + 1] || "" : "";

// Inline pixelmatch (simplified version) — exported for reuse
export function pixelmatch(img1, img2, output, width, height, options = {}) {
  const threshold = options.threshold ?? 0.1;
  const maxDelta = 35215 * threshold * threshold;
  let diffCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = (y * width + x) * 4;
      const r1 = img1[pos], g1 = img1[pos + 1], b1 = img1[pos + 2];
      const r2 = img2[pos], g2 = img2[pos + 1], b2 = img2[pos + 2];

      const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
      const delta = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;

      if (delta > maxDelta) {
        if (output) {
          output[pos] = 255;      // red
          output[pos + 1] = 0;
          output[pos + 2] = 0;
          output[pos + 3] = 255;
        }
        diffCount++;
      } else if (output) {
        // Dimmed original pixel
        output[pos] = (r1 + r2) / 2 * 0.3;
        output[pos + 1] = (g1 + g2) / 2 * 0.3;
        output[pos + 2] = (b1 + b2) / 2 * 0.3;
        output[pos + 3] = 255;
      }
    }
  }
  return diffCount;
}

export function loadPNG(filepath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filepath)
      .pipe(new PNG())
      .on("parsed", function () { resolve(this); })
      .on("error", reject);
  });
}

export async function comparePNGs(origPath, currPath, diffPath) {
  const orig = await loadPNG(origPath);
  const curr = await loadPNG(currPath);

  // Use the larger dimensions (pad the smaller image)
  const width = Math.max(orig.width, curr.width);
  const height = Math.max(orig.height, curr.height);

  const padImage = (img, w, h) => {
    const buf = Buffer.alloc(w * h * 4, 0);
    for (let y = 0; y < img.height && y < h; y++) {
      for (let x = 0; x < img.width && x < w; x++) {
        const srcPos = (y * img.width + x) * 4;
        const dstPos = (y * w + x) * 4;
        buf[dstPos] = img.data[srcPos];
        buf[dstPos + 1] = img.data[srcPos + 1];
        buf[dstPos + 2] = img.data[srcPos + 2];
        buf[dstPos + 3] = img.data[srcPos + 3];
      }
    }
    return buf;
  };

  const img1 = padImage(orig, width, height);
  const img2 = padImage(curr, width, height);
  const diff = Buffer.alloc(width * height * 4);

  const diffPixels = pixelmatch(img1, img2, diff, width, height, { threshold: 0.15 });
  const totalPixels = width * height;
  const diffPercent = ((diffPixels / totalPixels) * 100).toFixed(1);

  // Write diff image
  const png = new PNG({ width, height });
  png.data = diff;
  const stream = png.pack().pipe(fs.createWriteStream(diffPath));
  await new Promise((resolve) => stream.on("finish", resolve));

  return { diffPixels, totalPixels, diffPercent, width, height };
}

async function screenshot(browser, url, outputPath) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
  } catch {
    // Fallback if networkidle times out
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(1000); // Extra settle time for fonts/images
  await page.screenshot({
    path: outputPath,
    fullPage: true,
    animations: "disabled",
  });
  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  await page.close();
  console.log(`  ✓ ${path.basename(outputPath)} (${size.width}×${size.height})`);
  return size;
}

// Legacy aliases — use comparePNGs and loadPNG exports above
const compare = comparePNGs;

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const origPath = path.join(SCREENSHOTS_DIR, "original.png");
  const currPath = path.join(SCREENSHOTS_DIR, "current.png");
  const diffPath = path.join(SCREENSHOTS_DIR, "diff.png");

  const browser = await chromium.launch();

  try {
    // Step 1: Capture original site baseline (icf-chapters.org)
    const originalUrl = pagePath
      ? `${ORIGINAL_URL.replace(/\/$/, "")}/${pagePath.replace(/^\//, "")}/`
      : ORIGINAL_URL;
    if (!currentOnly) {
      console.log(`\nCapturing original: ${originalUrl}`);
      await screenshot(browser, originalUrl, origPath);
    }

    // Step 2: Capture Astro dev server
    if (!baselineOnly) {
      console.log(`Capturing Astro: ${ASTRO_URL}${pagePath}`);
      await screenshot(browser, `${ASTRO_URL}${pagePath}`, currPath);
    }

    // Step 3: Compare
    if (!baselineOnly && !currentOnly && fs.existsSync(origPath) && fs.existsSync(currPath)) {
      console.log("\nComparing...");
      const result = comparePNGs(origPath, currPath, diffPath);
      const { diffPercent, diffPixels, totalPixels, width, height } = await result;

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  Diff: ${diffPercent}%`);
      console.log(`  Pixels: ${diffPixels.toLocaleString()} / ${totalPixels.toLocaleString()} differ`);
      console.log(`  Canvas: ${width}×${height}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`\n📁 Files saved:`);
      console.log(`  ${origPath}`);
      console.log(`  ${currPath}`);
      console.log(`  ${diffPath}`);

      if (parseFloat(diffPercent) < 5) {
        console.log("\n✅ Pages look close! (<5% diff)");
      } else {
        console.log(`\n⚠️  ${diffPercent}% difference — needs work`);
      }
    }
  } finally {
    await browser.close();
  }
}

// Only run main() when executed directly, not when imported
const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch(console.error);
}
