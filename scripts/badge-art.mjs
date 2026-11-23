// Writes the built-in badge art and the Woobux pictures as SVG files.
// Style (after the owner's coin reference): a bevelled emblem, a lighter
// face, a raised glyph with a soft shadow. Usage: node scripts/badge-art.mjs public/assets
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('out dir?');
mkdirSync(join(out, 'badges'), { recursive: true });

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (h, t, a) => toHex(hex(h).map((v, i) => v + (hex(t)[i] - v) * a));
const light = (h, a) => mix(h, '#ffffff', a);
const dark = (h, a) => mix(h, '#000000', a);

// ---- shapes, centred on 32,32 ----
const poly = (n, r, rot = 0, cx = 32, cy = 32) => Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');
const rosette = (r, depth = 0.12, n = 12) => Array.from({ length: n * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r * (1 - depth) : r;
    return `${(32 + rr * Math.cos(a)).toFixed(2)},${(32 + rr * Math.sin(a)).toFixed(2)}`;
}).join(' ');
const SHAPES = {
    octagon: r => `<polygon points="${poly(8, r, Math.PI / 8)}" stroke-linejoin="round"/>`,
    hexagon: r => `<polygon points="${poly(6, r, Math.PI / 6)}" stroke-linejoin="round"/>`,
    circle: r => `<circle cx="32" cy="32" r="${r}"/>`,
    rosette: r => `<polygon points="${rosette(r)}" stroke-linejoin="round"/>`,
    square: r => `<rect x="${32 - r * 0.9}" y="${32 - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" rx="${r * 0.38}"/>`,
    shield: r => {
        const s = r / 28;
        const t = (x, y) => `${(32 + x * s).toFixed(2)} ${(32 + y * s).toFixed(2)}`;
        return `<path d="M${t(0, -28)} C${t(9, -22)} ${t(17, -21)} ${t(24, -21)} C${t(24, -6)} ${t(24, 12)} ${t(0, 28)} C${t(-24, 12)} ${t(-24, -6)} ${t(-24, -21)} C${t(-17, -21)} ${t(-9, -22)} ${t(0, -28)}Z"/>`;
    }
};

// ---- glyphs, drawn in a 64 box, white fill ----
const GLYPHS = {
    code: '<path d="M25 22 15 32l10 10" fill="none" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M39 22l10 10-10 10" fill="none" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M35 19l-6 26" fill="none" stroke-width="5" stroke-linecap="round"/>',
    crown: '<path d="M17 41 14 23l10 8 8-12 8 12 10-8-3 18Z" stroke-linejoin="round" stroke-width="2"/><rect x="17" y="43" width="30" height="5" rx="2"/>',
    check: '<path d="M20 33l8 8 16-17" fill="none" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>',
    hammer: '<g transform="rotate(-40 32 32)"><rect x="19" y="13" width="26" height="12" rx="3"/><rect x="29" y="23" width="6" height="28" rx="3"/></g>',
    flag: '<rect x="20" y="15" width="4.5" height="35" rx="2.25"/><path d="M24 17c6-3 10 3 17 0s6-1 6-1v17s-1-2-6 1-11-3-17 0Z"/>',
    heart: '<path d="M32 47S16 37.5 16 27c0-5 4-9 8.5-9 3.3 0 5.9 1.8 7.5 4.5C33.6 19.8 36.2 18 39.5 18 44 18 48 22 48 27c0 10.5-16 20-16 20Z"/>',
    bug: '<ellipse cx="32" cy="35" rx="9" ry="12"/><circle cx="32" cy="21" r="6"/><path d="M23 30h-7M23 38h-7M41 30h7M41 38h7M27 17l-4-4M37 17l4-4" fill="none" stroke-width="3.5" stroke-linecap="round"/>',
    flask: '<path d="M27 15h10v12l10 17c1.4 2.6-.4 5-3 5H20c-2.6 0-4.4-2.4-3-5l10-17Z" stroke-linejoin="round" stroke-width="2"/><rect x="25" y="13" width="14" height="4" rx="2"/>',
    star: '<path d="M32 13c1.6 10 4 13.4 13.5 19C36 37.6 33.6 41 32 51c-1.6-10-4-13.4-13.5-19C28 26.4 30.4 23 32 13Z"/>',
    flame: '<path d="M32 13c2 8 12 12 12 23a12 12 0 0 1-24 0c0-6 3-9 5-11 0 4 2 6 4 6-1-7 1-13 3-18Z"/>',
    ticket: '<path d="M16 24a3 3 0 0 1 3-3h26a3 3 0 0 1 3 3v4a4 4 0 0 0 0 8v4a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3v-4a4 4 0 0 0 0-8Z"/>'
};

/** One emblem: a bevelled shape in `color`, then the glyph. `extra` goes on top (a tier ring). */
function emblem(name, shape, color, glyph, { glyphColor = '#ffffff', ring = false } = {}) {
    const id = name.replace(/[^a-z0-9]/gi, '');
    const s = SHAPES[shape];
    // stroke-only parts carry fill="none" themselves, so one paint fits every glyph
    const glyphPaint = `fill="url(#${id}g)" stroke="url(#${id}g)"`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
<defs>
<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light(color, 0.35)}"/><stop offset=".55" stop-color="${color}"/><stop offset="1" stop-color="${dark(color, 0.35)}"/></linearGradient>
<linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light(color, 0.28)}"/><stop offset="1" stop-color="${dark(color, 0.08)}"/></linearGradient>
<radialGradient id="${id}h" cx=".32" cy=".25" r=".6"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${glyphColor}"/><stop offset="1" stop-color="${mix(glyphColor, color, 0.25)}"/></linearGradient>
</defs>
<g fill="${dark(color, 0.45)}" transform="translate(0 1.6)">${s(29)}</g>
<g fill="url(#${id}r)">${s(29)}</g>
<g fill="url(#${id}f)">${s(23.5)}</g>
<g fill="url(#${id}h)">${s(23.5)}</g>
${ring ? `<g fill="none" stroke="${light(color, 0.6)}" stroke-width="1.4" opacity=".85">${s(26.3)}</g>` : ''}
<g fill="${dark(color, 0.45)}" stroke="${dark(color, 0.45)}" opacity=".55" transform="translate(0 1.4)">${GLYPHS[glyph]}</g>
<g ${glyphPaint}>${GLYPHS[glyph]}</g>
</svg>
`;
}

const BADGES = [
    ['developer', 'hexagon', '#8b5cf6', 'code'],
    ['admin', 'octagon', '#ef4444', 'crown', { glyphColor: '#fff4c2' }],
    ['moderator', 'shield', '#f59e0b', 'hammer'],
    ['event_organizer', 'square', '#22c55e', 'flag'],
    ['verified', 'rosette', '#5c92ff', 'check'],
    ['contributor', 'circle', '#ec4899', 'heart'],
    ['bug_hunter', 'hexagon', '#10b981', 'bug'],
    ['beta_tester', 'circle', '#0ea5e9', 'flask'],
    ['creator_1', 'circle', '#94a3b8', 'star'],
    ['creator_10', 'octagon', '#c47a35', 'star', { glyphColor: '#ffe6c7' }],
    ['creator_50', 'octagon', '#a8b3c2', 'star', { ring: true }],
    ['creator_100', 'octagon', '#f5b301', 'star', { glyphColor: '#fff8d6', ring: true }],
    ['streak_30', 'shield', '#f97316', 'flame', { glyphColor: '#fff1c2' }]
];
for (const [name, shape, color, glyph, opts] of BADGES) writeFileSync(join(out, 'badges', `${name}.svg`), emblem(name, shape, color, glyph, opts));

// Woobux: the reference coin, an orange-gold octagon with a four-point star
writeFileSync(join(out, 'woobux.svg'), emblem('woobux', 'octagon', '#f6a623', 'star', { glyphColor: '#fff3a8' }));
// a save pass: a ticket on a blue coin
writeFileSync(join(out, 'save-pass.svg'), emblem('savepass', 'circle', '#3b82f6', 'ticket'));
console.log('written', BADGES.length + 2);
