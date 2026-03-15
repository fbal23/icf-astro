/**
 * Generate an SVG initials avatar as a data URI.
 * Port of icf-coach-avatar.php from the WordPress mu-plugins.
 */

const PALETTE = ["#212251", "#2b379b", "#1a6b5c", "#8b3a3a", "#5a5a8b"];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

export function avatarDataUri(name: string): string {
  const bg = PALETTE[hashCode(name) % PALETTE.length];
  const initials = getInitials(name);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="${bg}"/>
    <text x="100" y="122" text-anchor="middle" dominant-baseline="auto"
      font-family="system-ui,sans-serif" font-size="80" font-weight="700" fill="#fff">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
