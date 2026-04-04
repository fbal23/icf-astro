/**
 * Text-based style audit for ICF Danmark migration.
 *
 * Compares the ORIGINAL site (icf-chapters.org) against our Astro build.
 * Extracts computed styles, layout metrics, and content, then outputs a
 * plain-text diff report that Claude Code can read and act on.
 *
 * IMPORTANT: The reference is always icf-chapters.org — we match against that.
 *
 * Usage:
 *   node style-audit.mjs                      # Audit homepage
 *   node style-audit.mjs --page /find-coach   # Audit specific page
 *   node style-audit.mjs --discover           # Dump original site DOM structure
 *   node style-audit.mjs --discover --page /  # Dump DOM for specific page
 *   node style-audit.mjs --astro-only         # Only audit Astro (no comparison)
 *   node style-audit.mjs --viewport 768       # Test at tablet width
 *
 * Exit codes:
 *   0 = all sections match within tolerance
 *   1 = diffs found (use output to fix issues)
 *   2 = error (site unreachable, etc.)
 */

import { chromium } from "playwright";
import {
  ORIGINAL_URL,
  ASTRO_URL,
  VIEWPORT,
  TOLERANCE,
  SECTION_MAP,
  STYLE_PROPERTIES,
} from "./audit-config.mjs";

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const discover = args.includes("--discover");
const astroOnly = args.includes("--astro-only");
const pageIdx = args.indexOf("--page");
const pagePath = pageIdx !== -1 ? (args[pageIdx + 1] || "/") : "/";
const vpIdx = args.indexOf("--viewport");
const vpWidth = vpIdx !== -1 ? parseInt(args[vpIdx + 1], 10) : VIEWPORT.width;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert rgb(r, g, b) or rgba(r, g, b, a) to #hex */
function rgbToHex(rgb) {
  if (!rgb || rgb === "transparent" || rgb === "rgba(0, 0, 0, 0)") return "transparent";
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return rgb;
  const [, r, g, b] = match.map(Number);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Normalize font family — strip quotes, lowercase, take first family */
function normalizeFont(family) {
  if (!family) return family;
  return family
    .split(",")[0]
    .trim()
    .replace(/['"]/g, "")
    .toLowerCase();
}

/** Check if two colors are close enough */
function colorsClose(c1, c2) {
  if (c1 === c2) return true;
  const parse = (c) => {
    if (c === "transparent") return [0, 0, 0, 0];
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) {
      const h = c.replace("#", "");
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    return m.slice(1).map(Number);
  };
  try {
    const [r1, g1, b1] = parse(c1);
    const [r2, g2, b2] = parse(c2);
    return Math.abs(r1 - r2) <= TOLERANCE.color &&
           Math.abs(g1 - g2) <= TOLERANCE.color &&
           Math.abs(b1 - b2) <= TOLERANCE.color;
  } catch {
    return false;
  }
}

// ─── DOM extraction (runs in browser context) ───────────────────────────────

/**
 * Extract element data inside Playwright's page.evaluate().
 * This function runs in the browser, not in Node.
 * Receives a single object arg (Playwright evaluate limitation).
 */
function extractElementData({ selector, styleProps }) {
  const el = document.querySelector(selector);
  if (!el) return null;

  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  const styles = {};
  for (const prop of styleProps) {
    styles[prop] = cs[prop] || "";
  }

  const images = [...el.querySelectorAll("img")].map((img) => ({
    src: img.getAttribute("src") || img.src,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    displayWidth: img.getBoundingClientRect().width,
    displayHeight: img.getBoundingClientRect().height,
    alt: img.alt,
  }));

  const links = [...el.querySelectorAll("a")].map((a) => ({
    href: a.getAttribute("href"),
    text: a.textContent.trim().slice(0, 80),
  }));

  return {
    exists: true,
    tag: el.tagName.toLowerCase(),
    classes: el.className,
    bbox: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    styles,
    text: el.textContent.trim().slice(0, 300),
    childCount: el.children.length,
    images,
    links,
  };
}

// ─── Discover mode ──────────────────────────────────────────────────────────

async function discoverDOM(page, url, label) {
  console.log(`\n=== DOM DISCOVERY [${label}]: ${url} ===\n`);

  await navigateSafe(page, url);

  // Remove common overlays
  await page.evaluate(() => {
    document.querySelector("#wpadminbar")?.remove();
    document.querySelector(".wp-admin-bar")?.remove();
    document.querySelector(".cookie-notice")?.remove();
  });

  const tree = await page.evaluate(() => {
    function walk(el, depth = 0) {
      if (depth > 6) return "";
      const tag = el.tagName?.toLowerCase();
      if (!tag || ["script", "style", "noscript", "svg", "path"].includes(tag)) return "";

      const id = el.id ? `#${el.id}` : "";
      const cls = el.className && typeof el.className === "string"
        ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";
      const rect = el.getBoundingClientRect();
      const size = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      const indent = "  ".repeat(depth);
      const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
        ? ` "${el.textContent.trim().slice(0, 50)}"`
        : "";

      let result = `${indent}<${tag}${id}${cls}> ${size}${text}\n`;

      for (const child of el.children) {
        result += walk(child, depth + 1);
      }
      return result;
    }
    return walk(document.body);
  });

  console.log(tree);
  console.log(`=== END DISCOVERY [${label}] ===\n`);
}

// ─── Navigation helper ──────────────────────────────────────────────────────

async function navigateSafe(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(1500); // fonts/images settle
}

// ─── Build the original URL for a given page path ───────────────────────────

function getOriginalUrl(pagePath) {
  // The original site is at icf-chapters.org/icf-danmark/
  // Sub-pages would be icf-chapters.org/icf-danmark/sub-page/
  if (pagePath === "/") return ORIGINAL_URL;
  // For sub-pages, append to the original URL
  const clean = pagePath.replace(/^\//, "").replace(/\/$/, "");
  return `${ORIGINAL_URL.replace(/\/$/, "")}/${clean}/`;
}

// ─── Audit logic ────────────────────────────────────────────────────────────

async function auditPage(browser, pagePath) {
  const sections = SECTION_MAP[pagePath];
  if (!sections) {
    console.log(`No SECTION_MAP defined for "${pagePath}".`);
    console.log(`Available pages: ${Object.keys(SECTION_MAP).join(", ")}`);
    console.log(`Run with --discover to explore the DOM and add selectors.`);
    process.exit(2);
  }

  const viewport = { width: vpWidth, height: VIEWPORT.height };
  const originalPage = !astroOnly ? await browser.newPage({ viewport }) : null;
  const astroPage = await browser.newPage({ viewport });

  const originalUrl = getOriginalUrl(pagePath);
  const astroUrl = `${ASTRO_URL}${pagePath}`;

  console.log(`\n=== STYLE AUDIT: ${pagePath} ===`);
  console.log(`Viewport:  ${vpWidth}x${VIEWPORT.height}`);
  console.log(`Original:  ${originalUrl}`);
  console.log(`Astro:     ${astroUrl}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  if (!astroOnly) {
    try {
      await navigateSafe(originalPage, originalUrl);
      // Remove common overlays on original site
      await originalPage.evaluate(() => {
        document.querySelector("#wpadminbar")?.remove();
        document.querySelector(".cookie-notice")?.remove();
      });
    } catch (e) {
      console.log(`ERROR: Cannot reach original at ${originalUrl}: ${e.message}`);
      process.exit(2);
    }
  }

  try {
    await navigateSafe(astroPage, astroUrl);
  } catch (e) {
    console.log(`ERROR: Cannot reach Astro at ${astroUrl}: ${e.message}`);
    console.log(`Is the dev server running? Try: npm run dev:astro`);
    process.exit(2);
  }

  let totalDiffs = 0;
  let criticalDiffs = 0;
  const diffDetails = [];

  for (const section of sections) {
    console.log(`--- SECTION: ${section.name} ---`);

    // Extract Astro data
    const astroData = await astroPage.evaluate(extractElementData, { selector: section.astro, styleProps: STYLE_PROPERTIES });

    if (!astroData) {
      console.log(`  Astro:     NOT FOUND (selector: ${section.astro})`);
      console.log("");
      totalDiffs++;
      criticalDiffs++;
      diffDetails.push({ section: section.name, type: "missing", site: "astro", selector: section.astro });
      continue;
    }

    // Format Astro output
    const astroBg = rgbToHex(astroData.styles.backgroundColor);
    const astroColor = rgbToHex(astroData.styles.color);
    console.log(`  Astro:     <${astroData.tag}> at (${astroData.bbox.x},${astroData.bbox.y}) ${astroData.bbox.width}x${astroData.bbox.height}`);
    console.log(`    bg: ${astroBg} | color: ${astroColor} | font: ${astroData.styles.fontSize}/${astroData.styles.lineHeight} ${normalizeFont(astroData.styles.fontFamily)}`);
    console.log(`    padding: ${astroData.styles.padding} | margin: ${astroData.styles.margin}`);
    console.log(`    children: ${astroData.childCount} | text: "${astroData.text.slice(0, 80)}..."`);
    if (astroData.images.length > 0) {
      for (const img of astroData.images) {
        console.log(`    img: ${img.src} ${img.displayWidth}x${img.displayHeight}`);
      }
    }

    // If no original selector or astro-only mode, just show Astro data
    if (astroOnly || !section.original) {
      if (!section.original && !astroOnly) {
        console.log(`  Original:  NO SELECTOR (run --discover to find it)`);
      }
      console.log("");
      continue;
    }

    // Extract original site data
    const origData = await originalPage.evaluate(extractElementData, { selector: section.original, styleProps: STYLE_PROPERTIES });

    if (!origData) {
      console.log(`  Original:  NOT FOUND (selector: ${section.original})`);
      console.log(`  TIP: Run --discover to check original site DOM structure`);
      console.log("");
      totalDiffs++;
      diffDetails.push({ section: section.name, type: "missing", site: "original", selector: section.original });
      continue;
    }

    // Format original output
    const origBg = rgbToHex(origData.styles.backgroundColor);
    const origColor = rgbToHex(origData.styles.color);
    console.log(`  Original:  <${origData.tag}> at (${origData.bbox.x},${origData.bbox.y}) ${origData.bbox.width}x${origData.bbox.height}`);
    console.log(`    bg: ${origBg} | color: ${origColor} | font: ${origData.styles.fontSize}/${origData.styles.lineHeight} ${normalizeFont(origData.styles.fontFamily)}`);
    console.log(`    padding: ${origData.styles.padding} | margin: ${origData.styles.margin}`);
    console.log(`    children: ${origData.childCount} | text: "${origData.text.slice(0, 80)}..."`);
    if (origData.images.length > 0) {
      for (const img of origData.images) {
        console.log(`    img: ${img.src} ${img.displayWidth}x${img.displayHeight}`);
      }
    }

    // Compare: original is the REFERENCE, astro is what we're fixing
    const diffs = [];

    // Size diffs
    const wDelta = Math.abs(astroData.bbox.width - origData.bbox.width);
    const hDelta = Math.abs(astroData.bbox.height - origData.bbox.height);
    if (wDelta > TOLERANCE.size) {
      diffs.push(`width: original ${origData.bbox.width}px → astro ${astroData.bbox.width}px (delta: ${wDelta}px)`);
    }
    if (hDelta > TOLERANCE.size) {
      diffs.push(`height: original ${origData.bbox.height}px → astro ${astroData.bbox.height}px (delta: ${hDelta}px)`);
    }

    // Color diffs
    if (!colorsClose(origData.styles.backgroundColor, astroData.styles.backgroundColor)) {
      diffs.push(`background: original ${origBg} → astro ${astroBg}`);
    }
    if (!colorsClose(origData.styles.color, astroData.styles.color)) {
      diffs.push(`text color: original ${origColor} → astro ${astroColor}`);
    }

    // Font diffs
    if (normalizeFont(origData.styles.fontFamily) !== normalizeFont(astroData.styles.fontFamily)) {
      diffs.push(`font-family: original "${normalizeFont(origData.styles.fontFamily)}" → astro "${normalizeFont(astroData.styles.fontFamily)}"`);
    }
    if (origData.styles.fontSize !== astroData.styles.fontSize) {
      diffs.push(`font-size: original ${origData.styles.fontSize} → astro ${astroData.styles.fontSize}`);
    }
    if (origData.styles.fontWeight !== astroData.styles.fontWeight) {
      diffs.push(`font-weight: original ${origData.styles.fontWeight} → astro ${astroData.styles.fontWeight}`);
    }

    // Padding/margin diffs
    if (origData.styles.padding !== astroData.styles.padding) {
      diffs.push(`padding: original ${origData.styles.padding} → astro ${astroData.styles.padding}`);
    }
    if (origData.styles.margin !== astroData.styles.margin) {
      diffs.push(`margin: original ${origData.styles.margin} → astro ${astroData.styles.margin}`);
    }

    // Child count diff
    if (Math.abs(origData.childCount - astroData.childCount) > 1) {
      diffs.push(`children: original ${origData.childCount} → astro ${astroData.childCount}`);
    }

    // Image count diff
    if (origData.images.length !== astroData.images.length) {
      diffs.push(`images: original ${origData.images.length} → astro ${astroData.images.length}`);
    }

    if (diffs.length > 0) {
      console.log(`  DIFFS (fix Astro to match original):`);
      for (const d of diffs) {
        const isCritical = d.includes("background:") || d.includes("text color:") ||
          (d.includes("height:") && parseInt(d.match(/delta: (\d+)/)?.[1] || "0") > 20);
        const marker = isCritical ? " *** CRITICAL" : "";
        console.log(`    - ${d}${marker}`);
        if (isCritical) criticalDiffs++;
      }
      totalDiffs += diffs.length;
      diffDetails.push({ section: section.name, diffs });
    } else {
      console.log(`  MATCH (within tolerance)`);
    }

    console.log("");
  }

  // Summary
  console.log(`${"=".repeat(50)}`);
  console.log(`SUMMARY: ${pagePath}`);
  console.log(`Reference: ${originalUrl}`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Sections audited:  ${sections.length}`);
  console.log(`Total diffs:       ${totalDiffs}`);
  console.log(`Critical diffs:    ${criticalDiffs}`);

  if (diffDetails.length > 0) {
    console.log(`\nACTION ITEMS (make Astro match the original):`);
    let i = 1;
    for (const d of diffDetails) {
      if (d.type === "missing") {
        console.log(`  ${i}. [${d.section}] Element not found on ${d.site} (selector: ${d.selector})`);
      } else {
        for (const diff of d.diffs) {
          console.log(`  ${i}. [${d.section}] ${diff}`);
          i++;
        }
      }
      i++;
    }
  } else {
    console.log(`\nAll sections match the original within tolerance!`);
  }

  console.log("");

  if (originalPage) await originalPage.close();
  await astroPage.close();

  return totalDiffs > 0 ? 1 : 0;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch();

  try {
    if (discover) {
      const page = await browser.newPage({ viewport: { width: vpWidth, height: VIEWPORT.height } });
      // Discover original site DOM (the reference)
      await discoverDOM(page, getOriginalUrl(pagePath), "ORIGINAL");
      // Also discover Astro DOM for comparison
      try {
        await discoverDOM(page, `${ASTRO_URL}${pagePath}`, "ASTRO");
      } catch (e) {
        console.log(`(Astro dev server not available for discovery: ${e.message})`);
      }
      await page.close();
      process.exit(0);
    }

    const exitCode = await auditPage(browser, pagePath);
    process.exit(exitCode);
  } catch (e) {
    console.error(`Fatal error: ${e.message}`);
    process.exit(2);
  } finally {
    await browser.close();
  }
}

main();
