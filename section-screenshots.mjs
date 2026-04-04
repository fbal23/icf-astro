/**
 * Section-level screenshot tool for ICF Danmark migration.
 *
 * Captures cropped screenshots of individual sections (not full pages)
 * from the ORIGINAL site (icf-chapters.org) and our Astro build.
 * Small, focused images are much easier for AI vision or human review.
 *
 * Usage:
 *   node section-screenshots.mjs                    # Screenshot homepage sections
 *   node section-screenshots.mjs --diff             # Screenshot + pixel diff per section
 *   node section-screenshots.mjs --page /find-coach # Specific page
 *   node section-screenshots.mjs --astro-only       # Only Astro screenshots
 *   node section-screenshots.mjs --viewport 768     # Tablet width
 *
 * Output: screenshots/sections/<page>/<section-name>-original.png, <section-name>-astro.png
 * With --diff: also generates <section-name>-diff.png and a summary table
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ORIGINAL_URL,
  ASTRO_URL,
  VIEWPORT,
  SECTION_MAP,
  PIXEL_DIFF_THRESHOLD,
} from "./audit-config.mjs";
import { comparePNGs } from "./compare.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const astroOnly = args.includes("--astro-only");
const doDiff = args.includes("--diff");
const pageIdx = args.indexOf("--page");
const pagePath = pageIdx !== -1 ? (args[pageIdx + 1] || "/") : "/";
const vpIdx = args.indexOf("--viewport");
const vpWidth = vpIdx !== -1 ? parseInt(args[vpIdx + 1], 10) : VIEWPORT.width;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function navigateSafe(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(1500);
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getOriginalUrl(pagePath) {
  if (pagePath === "/") return ORIGINAL_URL;
  const clean = pagePath.replace(/^\//, "").replace(/\/$/, "");
  return `${ORIGINAL_URL.replace(/\/$/, "")}/${clean}/`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const sections = SECTION_MAP[pagePath];
  if (!sections) {
    console.log(`No SECTION_MAP for "${pagePath}". Available: ${Object.keys(SECTION_MAP).join(", ")}`);
    process.exit(2);
  }

  const outDir = path.join(__dirname, "screenshots", "sections", slugify(pagePath) || "home");
  fs.mkdirSync(outDir, { recursive: true });

  const viewport = { width: vpWidth, height: VIEWPORT.height };
  const browser = await chromium.launch();

  const originalPage = !astroOnly ? await browser.newPage({ viewport }) : null;
  const astroPage = await browser.newPage({ viewport });

  // Navigate to original site (the reference)
  if (originalPage) {
    const originalUrl = getOriginalUrl(pagePath);
    try {
      await navigateSafe(originalPage, originalUrl);
      await originalPage.evaluate(() => {
        document.querySelector("#wpadminbar")?.remove();
        document.querySelector(".cookie-notice")?.remove();
      });
      console.log(`Original: ${originalUrl}`);
    } catch (e) {
      console.log(`WARNING: Original not reachable at ${originalUrl}: ${e.message}`);
    }
  }

  try {
    await navigateSafe(astroPage, `${ASTRO_URL}${pagePath}`);
    console.log(`Astro:    ${ASTRO_URL}${pagePath}`);
  } catch (e) {
    console.log(`ERROR: Astro not reachable at ${ASTRO_URL}${pagePath}: ${e.message}`);
    console.log(`Is the dev server running? Try: npm run dev:astro`);
    await browser.close();
    process.exit(2);
  }

  console.log(`\nSection screenshots: ${pagePath}`);
  console.log(`Output: ${outDir}\n`);

  let captured = 0;
  const diffResults = [];

  for (const section of sections) {
    const slug = slugify(section.name);
    let astroFile = null;
    let origFile = null;

    // Astro screenshot
    try {
      const astroEl = await astroPage.$(section.astro);
      if (astroEl) {
        astroFile = path.join(outDir, `${slug}-astro.png`);
        await astroEl.screenshot({ path: astroFile });
        console.log(`  OK  ${section.name} (astro) → ${slug}-astro.png`);
        captured++;
      } else {
        console.log(`  --  ${section.name} (astro) not found: ${section.astro}`);
      }
    } catch (e) {
      console.log(`  ERR ${section.name} (astro): ${e.message}`);
    }

    // Original site screenshot (the reference)
    if (originalPage && section.original) {
      try {
        const origEl = await originalPage.$(section.original);
        if (origEl) {
          origFile = path.join(outDir, `${slug}-original.png`);
          await origEl.screenshot({ path: origFile });
          console.log(`  OK  ${section.name} (original) → ${slug}-original.png`);
          captured++;
        } else {
          console.log(`  --  ${section.name} (original) not found: ${section.original}`);
        }
      } catch (e) {
        console.log(`  ERR ${section.name} (original): ${e.message}`);
      }
    }

    // Pixel diff (when --diff flag is set and both screenshots exist)
    if (doDiff && astroFile && origFile) {
      try {
        const diffFile = path.join(outDir, `${slug}-diff.png`);
        const result = await comparePNGs(origFile, astroFile, diffFile);
        const pass = parseFloat(result.diffPercent) <= PIXEL_DIFF_THRESHOLD;
        diffResults.push({
          name: section.name,
          diffPercent: result.diffPercent,
          diffPixels: result.diffPixels,
          pass,
        });
        const status = pass ? "PASS" : "FAIL";
        console.log(`  ${status} ${section.name} visual diff: ${result.diffPercent}% → ${slug}-diff.png`);
      } catch (e) {
        console.log(`  ERR ${section.name} (diff): ${e.message}`);
        diffResults.push({ name: section.name, diffPercent: "ERR", pass: false });
      }
    }
  }

  console.log(`\nCaptured ${captured} section screenshots in ${outDir}`);

  // Visual diff summary table
  if (doDiff && diffResults.length > 0) {
    const failures = diffResults.filter((r) => !r.pass).length;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`VISUAL DIFF SUMMARY (threshold: ${PIXEL_DIFF_THRESHOLD}%)`);
    console.log(`${"=".repeat(60)}`);
    console.log(`${"Section".padEnd(40)} ${"Diff %".padStart(8)}  Status`);
    console.log(`${"-".repeat(40)} ${"-".repeat(8)}  ${"-".repeat(6)}`);
    for (const r of diffResults) {
      const pct = typeof r.diffPercent === "string" ? r.diffPercent : `${r.diffPercent}%`;
      const status = r.pass ? "PASS" : "FAIL";
      console.log(`${r.name.padEnd(40)} ${pct.padStart(8)}  ${status}`);
    }
    console.log(`${"-".repeat(60)}`);
    console.log(`Total: ${diffResults.length} sections, ${failures} failures`);

    if (failures > 0) {
      console.log(`\nOpen the *-diff.png files to see red-highlighted pixel differences.`);
      process.exit(1);
    }
  }

  await browser.close();
}

main().catch(console.error);
