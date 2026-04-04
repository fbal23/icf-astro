/**
 * Shared configuration for style-audit and section-screenshots tools.
 *
 * IMPORTANT: The REFERENCE site is icf-chapters.org (the original).
 * Both WordPress and Astro are implementations that should match it.
 * Always compare against the original, never WP vs Astro directly.
 */

// The REFERENCE — this is what we're trying to match
export const ORIGINAL_URL = "https://www.icf-chapters.org/icf-danmark/";

// Our implementations
export const ASTRO_URL = "http://localhost:4321";
export const WORDPRESS_URL = "http://72.60.81.140";

export const VIEWPORT = { width: 1440, height: 900 };

// Tolerance thresholds
export const TOLERANCE = {
  position: 5,
  size: 5,
  color: 10,
};

// Pixel diff threshold — sections above this % are flagged as FAIL
export const PIXEL_DIFF_THRESHOLD = 2;

/**
 * Section map: original (icf-chapters.org) selector → Astro selector.
 *
 * Original site structure (discovered via --discover):
 *   header#header (1440x169)
 *   .entry-content > .banner (hero, 1440x312)
 *   .entry-content > .wrap > .cols.layout2 (two-column about+news, 1400x496)
 *   .entry-content > .wrap > .news.nb3 (partners/sponsors, 1400x544)
 *   .entry-content > .wrap > .blocs (find-coach + activities side-by-side, 1400x260)
 *   .entry-content > .banner:last-child (bottom banner, 1440x312)
 *   footer#footer (1440x319)
 */
// Switch target: "astro" for Astro selectors, "wp" for WordPress selectors
const TARGET = process.env.AUDIT_TARGET || "astro";

const ASTRO_SECTIONS = [
  {
    name: "Header",
    original: "header#header",
    astro: "header",
  },
  {
    name: "Hero Banner",
    original: ".entry-content > .banner:first-child",
    astro: "main > section:nth-child(1)",
  },
  {
    name: "Two-Column (About + News)",
    original: ".entry-content > .wrap > .cols.layout2",
    astro: "main > section:nth-child(2)",
  },
  {
    name: "Partners / Sponsors",
    original: ".entry-content > .wrap > .news.nb3",
    astro: "main > section:nth-child(3)",
  },
  {
    name: "Find Coach + Activities",
    original: ".entry-content > .wrap > .blocs",
    astro: "main > section:nth-child(4)",
    note: "Side-by-side blocs on both original and Astro",
  },
  {
    name: "Bottom Banner (Enjoy Great Learning)",
    original: ".entry-content > .banner:last-child",
    astro: "main > section:nth-child(5)",
    note: "Enjoy Great Learning CTA — bottom banner on original site",
  },
  {
    name: "Join Community CTA",
    original: null,
    astro: "main > section:nth-child(6)",
    note: "Astro addition — not on the original icf-chapters.org",
  },
  {
    name: "Footer",
    original: "footer#footer",
    astro: "footer",
  },
];

const WP_SECTIONS = [
  {
    name: "Header",
    original: "header#header",
    astro: "header#masthead",
  },
  {
    name: "Hero Banner",
    original: ".entry-content > .banner:first-child",
    astro: ".entry-content > div:nth-child(1)",
  },
  {
    name: "Two-Column (About + News)",
    original: ".entry-content > .wrap > .cols.layout2",
    astro: ".entry-content > div:nth-child(2)",
  },
  {
    name: "Partners / Sponsors",
    original: ".entry-content > .wrap > .news.nb3",
    astro: ".entry-content > div:nth-child(3)",
  },
  {
    name: "Find Coach + Activities",
    original: ".entry-content > .wrap > .blocs",
    astro: ".entry-content > div:nth-child(4)",
    note: "Now combined side-by-side like original",
  },
  {
    name: "Bottom Banner (Enjoy Great Learning)",
    original: ".entry-content > .banner:last-child",
    astro: ".entry-content > div:nth-child(5)",
  },
  {
    name: "Join Community CTA",
    original: null,
    astro: ".entry-content > div:nth-child(6)",
    note: "WP addition — not on the original icf-chapters.org",
  },
  {
    name: "Footer",
    original: "footer#footer",
    astro: "footer#colophon",
  },
];

export const SECTION_MAP = {
  "/": TARGET === "wp" ? WP_SECTIONS : ASTRO_SECTIONS,
};

/**
 * CSS properties to extract and compare for each element.
 */
export const STYLE_PROPERTIES = [
  "fontSize",
  "fontFamily",
  "fontWeight",
  "lineHeight",
  "color",
  "backgroundColor",
  "margin",
  "padding",
  "borderWidth",
  "borderColor",
  "borderRadius",
  "textAlign",
  "display",
  "gap",
];
