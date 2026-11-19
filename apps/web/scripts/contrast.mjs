// Checks WCAG 2.2 contrast for the colour pairings used by HarvestSlot components.
// Run: pnpm --filter @harvestslot/web contrast   (exits non-zero if any pairing fails)
const tokens = {
  forest: '#137a3b',
  'forest-800': '#0f6431',
  leaf: '#137a3b',
  'leaf-600': '#0f6431',
  'leaf-50': '#ecf7f0',
  'leaf-100': '#d3ecdc',
  canvas: '#f5f6f8',
  surface: '#ffffff',
  ink: '#101828',
  muted: '#475467',
  'line-strong': '#848c9c',
  amber: '#f0b94d',
  'amber-50': '#fdf6e7',
  'amber-100': '#fbe8c3',
  'amber-ink': '#5c3a00',
  danger: '#c6281c',
  'danger-50': '#fef3f2',
  info: '#1a5fb4',
  'info-50': '#eef5fd',
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
  ['ink', 'canvas', 4.5, 'body text and headings on page background'],
  ['ink', 'surface', 4.5, 'body text on cards'],
  ['muted', 'canvas', 4.5, 'secondary text on page'],
  ['muted', 'surface', 4.5, 'secondary text on cards'],
  ['muted', 'leaf-50', 4.5, 'secondary text on tinted panels'],
  ['white', 'forest', 4.5, 'primary button text'],
  ['white', 'forest-800', 4.5, 'primary button hover'],
  ['white', 'danger', 4.5, 'danger button text'],
  ['forest', 'leaf-50', 4.5, 'success badge, secondary button, selected states'],
  ['forest-800', 'leaf-100', 4.5, 'secondary button hover'],
  ['amber-ink', 'amber', 4.5, 'amber accent badge'],
  ['amber-ink', 'amber-50', 4.5, 'warning badge / banner'],
  ['amber-ink', 'amber-100', 4.5, 'demo banner'],
  ['danger', 'danger-50', 4.5, 'error badge / alert'],
  ['danger', 'surface', 4.5, 'field error text'],
  ['info', 'info-50', 4.5, 'info badge'],
  ['leaf', 'surface', 4.5, 'links and accents on cards'],
  ['leaf', 'canvas', 4.5, 'links and accents on page'],
  ['line-strong', 'surface', 3, 'input borders (non-text UI)'],
  ['forest', 'surface', 3, 'focus ring on white'],
  ['forest', 'canvas', 3, 'focus ring on page background'],
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
