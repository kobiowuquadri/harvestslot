// Checks WCAG 2.2 contrast for the colour pairings used by HarvestSlot components.
// Run: pnpm --filter @harvestslot/web contrast   (exits non-zero if any pairing fails)
const tokens = {
  forest: '#143e31',
  leaf: '#2f6b4e',
  'leaf-600': '#2a5f45',
  'leaf-50': '#ecf4ef',
  'leaf-100': '#d6e8dd',
  canvas: '#f7f8f4',
  surface: '#ffffff',
  ink: '#17211c',
  muted: '#525e57',
  'line-strong': '#8a968f',
  amber: '#e8b56b',
  'amber-50': '#fbf3e6',
  'amber-100': '#f6e2c2',
  'amber-ink': '#5c3a00',
  danger: '#b42318',
  'danger-50': '#fdeceb',
  info: '#1d5a85',
  'info-50': '#e8f1f8',
  white: '#ffffff',
};

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [l1, l2] = [luminance(tokens[a]), luminance(tokens[b])].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [foreground, background, minimum, usage]
const pairs = [
  ['ink', 'canvas', 4.5, 'body text on page background'],
  ['ink', 'surface', 4.5, 'body text on cards'],
  ['muted', 'canvas', 4.5, 'secondary text on page'],
  ['muted', 'surface', 4.5, 'secondary text on cards'],
  ['white', 'forest', 4.5, 'primary button / sidebar text'],
  ['white', 'leaf', 4.5, 'secondary button text'],
  ['white', 'leaf-600', 4.5, 'button hover'],
  ['forest', 'leaf-50', 4.5, 'success badge'],
  ['forest', 'leaf-100', 4.5, 'selected nav item'],
  ['amber-ink', 'amber', 4.5, 'amber accent badge'],
  ['amber-ink', 'amber-50', 4.5, 'warning badge / banner'],
  ['amber-ink', 'amber-100', 4.5, 'demo banner'],
  ['danger', 'danger-50', 4.5, 'error badge / alert'],
  ['danger', 'surface', 4.5, 'field error text'],
  ['info', 'info-50', 4.5, 'info badge'],
  ['leaf', 'surface', 4.5, 'links on cards'],
  ['forest', 'canvas', 4.5, 'headings'],
  ['line-strong', 'surface', 3, 'input borders (non-text UI)'],
  ['amber', 'forest', 3, 'focus ring on dark backgrounds'],
  ['forest', 'surface', 3, 'focus ring fallback / icons'],
];

let failed = 0;
for (const [fg, bg, min, usage] of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1 (min ${min})  ${fg} on ${bg} — ${usage}`);
}
// Known non-pairing: white text on amber fails (≈1.8:1) and is never used.
console.log(`\nwhite on amber = ${ratio('white', 'amber').toFixed(2)}:1 — not used anywhere (amber always carries amber-ink text).`);
process.exit(failed ? 1 : 0);
