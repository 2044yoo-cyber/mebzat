// Generator for Medosha's local branded placeholder assets.
//
//   npm run assets:images
//
// Writes the branded SVG set into public/images/** (products, projects,
// companies, avatars, placeholders). Output is deterministic, so re-running
// reproduces byte-identical files. No network access, no dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'images');

// Brand base is oklch(0.47 0.16 259) ≈ #3652c4. Each family shifts hue a
// little so categories stay visually distinct while remaining on-brand.
const shade = (h) => {
  const hues = {
    blue: ['#3652c4', '#2a3f9c'], indigo: ['#4a45b8', '#332f8f'],
    slate: ['#3d4a6b', '#2a3448'], teal: ['#2f6f8f', '#22526b'],
    steel: ['#4a5a78', '#333f57'], violet: ['#5a45b0', '#3f2f85'],
    ocean: ['#2b5ea8', '#1f4480'], stone: ['#4a4f63', '#333745'],
  };
  return hues[h] ?? hues.blue;
};

// An SVG is XML, so a label is not free text. "Steel & Metal" wrote a bare
// ampersand into an attribute and a text node, which browsers refuse to
// decode — the file served fine with a 200 and rendered as a broken image.
// Four of the generated assets were invalid this way.
const xml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function svg({ w, h, hue, label, glyph, sub = 'Medosha' }) {
  const [c1, c2] = shade(hue);
  const cx = w / 2;
  // Glyph sits above centre; text below it.
  const gy = h * (h > 500 ? 0.42 : 0.38);
  const scale = Math.min(w, h) / 800;
  const labelSize = Math.round(Math.min(w, h) * 0.062) + 8;
  const subSize = Math.round(Math.min(w, h) * 0.038) + 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Medosha — ${xml(label)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#grid)"/>
  <g transform="translate(${cx} ${gy}) scale(${(scale * 0.9).toFixed(3)})" fill="none" stroke="#ffffff" stroke-opacity="0.92" stroke-width="16" stroke-linejoin="round" stroke-linecap="round">
${glyph}
  </g>
  <text x="${cx}" y="${h * 0.74}" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="${labelSize}" font-weight="700" fill="#ffffff" letter-spacing="1">${xml(label)}</text>
  <text x="${cx}" y="${h * 0.74 + subSize * 1.7}" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="${subSize}" fill="#ffffff" fill-opacity="0.72" letter-spacing="3">${xml(sub.toUpperCase())}</text>
</svg>
`;
}

// --- glyphs (simple line art, drawn around origin) -------------------------
const G = {
  tiles: `    <rect x="-130" y="-130" width="115" height="115" rx="10"/>
    <rect x="15" y="-130" width="115" height="115" rx="10"/>
    <rect x="-130" y="15" width="115" height="115" rx="10"/>
    <rect x="15" y="15" width="115" height="115" rx="10"/>`,
  kitchen: `    <path d="M-140 60 h280"/><rect x="-140" y="-60" width="280" height="120" rx="14"/>
    <path d="M0 -60 V60"/><circle cx="-70" cy="0" r="16"/><circle cx="70" cy="0" r="16"/>`,
  bath: `    <path d="M-140 0 h280 v40 a70 70 0 0 1 -70 70 h-140 a70 70 0 0 1 -70 -70 z"/>
    <path d="M-90 0 v-70 a34 34 0 0 1 68 0"/>`,
  light: `    <path d="M0 -130 V-80"/><path d="M-90 -10 L0 -80 L90 -10 z"/>
    <path d="M-40 -10 a40 40 0 0 0 80 0"/><path d="M0 50 V110"/>`,
  door: `    <rect x="-90" y="-140" width="180" height="280" rx="12"/><circle cx="46" cy="10" r="14"/>`,
  window: `    <rect x="-130" y="-120" width="260" height="240" rx="12"/>
    <path d="M0 -120 V120"/><path d="M-130 0 H130"/>`,
  roof: `    <path d="M-150 30 L0 -110 L150 30"/><path d="M-110 30 L-110 120 H110 V30"/>`,
  paint: `    <rect x="-100" y="-40" width="200" height="160" rx="16"/>
    <path d="M-100 -40 a100 40 0 0 1 200 0"/><path d="M60 -60 V-140 h60"/>`,
  electrical: `    <path d="M20 -140 L-70 20 H10 L-20 140 L80 -20 H0 z"/>`,
  materials: `    <rect x="-140" y="20" width="120" height="70" rx="8"/>
    <rect x="20" y="20" width="120" height="70" rx="8"/>
    <rect x="-60" y="-70" width="120" height="70" rx="8"/>`,
  furniture: `    <path d="M-140 40 v70"/><path d="M140 40 v70"/>
    <rect x="-150" y="-30" width="300" height="80" rx="26"/>
    <path d="M-120 -30 v-60 a24 24 0 0 1 24 -24 h192 a24 24 0 0 1 24 24 v60"/>`,
  plumbing: `    <path d="M-140 -60 h130 a50 50 0 0 1 50 50 v70 a50 50 0 0 0 50 50 h50"/>
    <rect x="-150" y="-95" width="40" height="70" rx="8"/>`,
  solar: `    <path d="M-150 60 L-110 -70 H110 L150 60 z"/><path d="M-130 5 H130"/><path d="M0 -70 V60"/>`,
  hardware: `    <circle cx="0" cy="0" r="60"/><path d="M0 -130 V-70"/><path d="M0 70 V130"/>
    <path d="M-130 0 H-70"/><path d="M70 0 H130"/>`,
  house: `    <path d="M-150 0 L0 -130 L150 0"/><path d="M-110 0 V130 H110 V0"/>
    <rect x="-35" y="40" width="70" height="90" rx="6"/>`,
  tower: `    <rect x="-110" y="-140" width="220" height="280" rx="10"/>
    <path d="M-60 -90 h40 M20 -90 h40 M-60 -20 h40 M20 -20 h40 M-60 50 h40 M20 50 h40"/>`,
  factory: `    <path d="M-150 130 V-10 L-30 60 V-10 L90 60 V-70 h60 V130 z"/>`,
  hotel: `    <rect x="-140" y="-120" width="280" height="240" rx="12"/>
    <path d="M-80 -60 h40 M40 -60 h40 M-80 10 h40 M40 10 h40"/><path d="M-25 120 v-60 h50 v60"/>`,
  civic: `    <path d="M-150 -30 L0 -120 L150 -30"/><path d="M-150 130 H150"/>
    <path d="M-100 -30 V90 M-35 -30 V90 M35 -30 V90 M100 -30 V90"/>`,
  mixed: `    <rect x="-150" y="-40" width="130" height="180" rx="10"/>
    <rect x="10" y="-130" width="140" height="270" rx="10"/>`,
  garden: `    <path d="M0 130 V20"/><path d="M0 40 a80 80 0 0 0 -80 -80 a80 80 0 0 0 80 80"/>
    <path d="M0 40 a80 80 0 0 1 80 -80 a80 80 0 0 1 -80 80"/><path d="M-120 130 H120"/>`,
  interior: `    <path d="M-150 90 H150"/><rect x="-130" y="-10" width="120" height="100" rx="14"/>
    <rect x="30" y="-120" width="110" height="80" rx="10"/><path d="M60 90 V-10"/>`,
  renovate: `    <path d="M-140 60 L-20 -60 l80 80 L-60 140 z"/><path d="M40 -40 l60 -60 a40 40 0 0 1 60 60 l-60 60"/>`,
  building: `    <rect x="-130" y="-130" width="260" height="260" rx="14"/>
    <path d="M-70 -70 h50 M20 -70 h50 M-70 0 h50 M20 0 h50 M-70 70 h50 M20 70 h50"/>`,
  crane: `    <path d="M-140 130 H140"/><path d="M-40 130 V-120 H120"/><path d="M-40 -120 H-140 l100 100"/>
    <path d="M60 -120 V-40"/>`,
  compass: `    <circle cx="0" cy="0" r="130"/><path d="M55 -55 L20 20 L-55 55 L-20 -20 z"/>`,
  blueprint: `    <rect x="-140" y="-110" width="280" height="220" rx="12"/>
    <path d="M-90 -60 h100 v80 h-100 z"/><path d="M40 -60 h50 M40 20 h50"/>`,
  store: `    <path d="M-140 -60 l30 -70 h220 l30 70"/><path d="M-140 -60 h280 v190 h-280 z"/>
    <path d="M-50 130 V30 h100 v100"/>`,
  handshake: `    <path d="M-140 -20 l60 -50 l70 40 l70 -40 l60 50"/>
    <path d="M-80 30 l60 50 l40 -30 l40 30 l60 -50"/>`,
  user: `    <circle cx="0" cy="-45" r="72"/><path d="M-125 135 a125 125 0 0 1 250 0"/>`,
  box: `    <path d="M0 -130 L140 -60 V70 L0 140 L-140 70 V-60 z"/><path d="M-140 -60 L0 10 L140 -60"/><path d="M0 10 V140"/>`,

  // --- feed glyphs ---------------------------------------------------------
  play: `    <circle cx="0" cy="0" r="130"/><path d="M-45 -70 L80 0 L-45 70 z"/>`,
  document: `    <path d="M-100 -140 h130 l70 70 V140 h-200 z"/><path d="M30 -140 v70 h70"/>
    <path d="M-60 0 h120 M-60 60 h120"/>`,
  sheet: `    <rect x="-130" y="-110" width="260" height="220" rx="12"/>
    <path d="M-130 -40 H130 M-130 25 H130 M-45 -110 V110 M45 -110 V110"/>`,
  cube3d: `    <path d="M0 -140 L130 -70 V70 L0 140 L-130 70 V-70 z"/>
    <path d="M-130 -70 L0 0 L130 -70"/><path d="M0 0 V140"/><path d="M-65 -105 L65 -35"/>`,
  plan: `    <rect x="-140" y="-110" width="280" height="220" rx="8"/>
    <path d="M-40 -110 V20 M-140 20 H60 M60 -30 H140 M-40 -50 H30"/>
    <path d="M-90 20 v90 M-90 65 h50"/>`,
  swap: `    <path d="M-140 -50 H90 l-55 -55"/><path d="M140 50 H-90 l55 55"/>`,
  sparkle: `    <path d="M0 -140 L34 -34 L140 0 L34 34 L0 140 L-34 34 L-140 0 L-34 -34 z"/>
    <circle cx="95" cy="-95" r="22"/>`,
  chart: `    <path d="M-130 110 H130"/><path d="M-130 110 V-110"/>
    <path d="M-95 55 L-25 -15 L35 35 L110 -75"/><path d="M110 -75 h-55 M110 -75 v55"/>`,
  coins: `    <ellipse cx="0" cy="-70" rx="115" ry="42"/>
    <path d="M-115 -70 V20 a115 42 0 0 0 230 0 V-70"/><path d="M-115 -25 a115 42 0 0 0 230 0"/>`,
  megaphone: `    <path d="M-140 -30 h60 l120 -75 V95 L-80 20 h-60 z"/>
    <path d="M-70 20 v75 h55 v-45"/><path d="M65 -35 a45 45 0 0 1 0 60"/>`,
  book: `    <path d="M0 -100 a110 45 0 0 0 -140 -20 V95 a110 45 0 0 1 140 20 z"/>
    <path d="M0 -100 a110 45 0 0 1 140 -20 V95 a110 45 0 0 0 -140 20 z"/>`,
  cap: `    <path d="M-150 -35 L0 -105 L150 -35 L0 35 z"/>
    <path d="M-90 -10 V75 a90 45 0 0 0 180 0 V-10"/><path d="M150 -35 V60"/>`,
  question: `    <circle cx="0" cy="0" r="130"/>
    <path d="M-45 -45 a45 45 0 1 1 45 55 v25"/><circle cx="0" cy="72" r="12" fill="#ffffff" stroke="none"/>`,
  chat: `    <path d="M-140 -110 h230 a30 30 0 0 1 30 30 v90 a30 30 0 0 1 -30 30 h-135 l-95 65 v-65 a30 30 0 0 1 0 0 z"/>
    <path d="M-80 -55 h115 M-80 -5 h70"/>`,
  trophy: `    <path d="M-75 -120 h150 v70 a75 75 0 0 1 -150 0 z"/>
    <path d="M-75 -100 h-45 a45 45 0 0 0 45 60"/><path d="M75 -100 h45 a45 45 0 0 1 -45 60"/>
    <path d="M0 25 v55"/><path d="M-70 125 h140 l-20 -45 h-100 z"/>`,
  camera: `    <path d="M-140 -55 h60 l25 -40 h110 l25 40 h60 v150 h-280 z"/><circle cx="0" cy="25" r="55"/>`,
  ruler: `    <path d="M-150 40 L40 -150 l110 110 L-40 150 z"/>
    <path d="M-100 -10 l35 35 M-55 -55 l35 35 M-10 -100 l35 35"/>`,
  key: `    <circle cx="-70" cy="-70" r="60"/><path d="M-28 -28 L130 130"/>
    <path d="M85 85 l40 -40"/><path d="M45 45 l40 -40"/>`,
};

// --- asset manifests -------------------------------------------------------
const products = [
  ['flooring', 'Flooring', 'blue', G.tiles], ['kitchen', 'Kitchen', 'teal', G.kitchen],
  ['bathroom', 'Bathroom', 'ocean', G.bath], ['lighting', 'Lighting', 'indigo', G.light],
  ['doors', 'Doors', 'stone', G.door], ['windows', 'Windows', 'ocean', G.window],
  ['roofing', 'Roofing', 'slate', G.roof], ['paint', 'Paint & Finishes', 'violet', G.paint],
  ['electrical', 'Electrical', 'indigo', G.electrical], ['construction-materials', 'Materials', 'steel', G.materials],
  ['furniture', 'Furniture', 'blue', G.furniture], ['plumbing', 'Plumbing', 'teal', G.plumbing],
  ['solar', 'Solar', 'ocean', G.solar], ['hardware', 'Hardware', 'stone', G.hardware],
];
const projects = [
  ['residential', 'Residential', 'blue', G.house], ['commercial', 'Commercial', 'ocean', G.tower],
  ['industrial', 'Industrial', 'steel', G.factory], ['hospitality', 'Hospitality', 'violet', G.hotel],
  ['institutional', 'Institutional', 'slate', G.civic], ['mixed-use', 'Mixed Use', 'indigo', G.mixed],
  ['landscape', 'Landscape', 'teal', G.garden], ['interior', 'Interior', 'stone', G.interior],
  ['renovation', 'Renovation', 'steel', G.renovate], ['other', 'Architecture', 'blue', G.building],
];
const companies = [
  ['architecture', 'Architecture', 'blue', G.compass], ['interior', 'Interior & Furniture', 'stone', G.interior],
  ['steel', 'Steel & Metal', 'steel', G.factory], ['materials', 'Building Materials', 'slate', G.store],
  ['contractor', 'Contracting', 'ocean', G.crane], ['developer', 'Development', 'indigo', G.tower],
  ['engineering', 'Engineering', 'teal', G.blueprint], ['general', 'Construction', 'blue', G.handshake],
];
const placeholders = [
  ['product', 'Product', 'blue', G.box, 800, 800], ['project', 'Project', 'blue', G.building, 1200, 900],
  ['company', 'Company', 'blue', G.store, 1200, 400], ['avatar', 'Medosha', 'blue', G.user, 512, 512],
  ['cover', 'Medosha', 'slate', G.crane, 1200, 400],
];
const avatarHues = ['blue', 'indigo', 'slate', 'teal', 'steel', 'violet', 'ocean', 'stone', 'blue', 'teal', 'indigo', 'ocean'];

// The Smart Discovery Feed. Every card in the feed carries an image — a feed
// of text blocks reads as a mailing list — so each content kind needs one that
// suits it. 4:3 because that is the aspect a phone shows without cropping and
// the feed is designed for phones first.
const feed = [
  ['progress', 'Site Progress', 'steel', G.crane],
  ['architecture', 'Architecture', 'blue', G.building],
  ['interior', 'Interior Design', 'stone', G.interior],
  ['furniture', 'Furniture', 'blue', G.furniture],
  ['materials', 'Materials', 'slate', G.materials],
  ['property', 'Property', 'blue', G.house],
  ['equipment', 'Equipment', 'steel', G.factory],
  ['ai-design', 'AI Design', 'violet', G.sparkle],
  ['before', 'Before', 'stone', G.renovate],
  ['after', 'After', 'teal', G.interior],
  ['floor-plan', 'Floor Plan', 'ocean', G.plan],
  ['boq', 'BOQ Template', 'slate', G.sheet],
  ['cost', 'Cost & Budget', 'teal', G.coins],
  ['price', 'Price Update', 'ocean', G.chart],
  ['video', 'Video', 'indigo', G.play],
  ['tutorial', 'Tutorial', 'indigo', G.ruler],
  ['document', 'Document', 'slate', G.document],
  ['cad', 'CAD Drawing', 'ocean', G.plan],
  ['model-3d', '3D Model', 'violet', G.cube3d],
  ['announcement', 'Announcement', 'blue', G.megaphone],
  ['investment', 'Investment', 'indigo', G.coins],
  ['learning', 'Learning', 'teal', G.book],
  ['course', 'Free Course', 'violet', G.cap],
  ['question', 'Question', 'stone', G.question],
  ['discussion', 'Discussion', 'steel', G.chat],
  ['success', 'Success Story', 'blue', G.trophy],
  ['professional', 'Professional', 'slate', G.user],
  ['handover', 'Handover', 'teal', G.key],
  ['photo', 'Site Photo', 'steel', G.camera],
];

let n = 0;
const write = (dir, name, content) => {
  mkdirSync(join(ROOT, dir), { recursive: true });
  writeFileSync(join(ROOT, dir, name + '.svg'), content);
  n++;
};

for (const [slug, label, hue, glyph] of products)
  write('products', slug, svg({ w: 800, h: 800, hue, label, glyph }));
for (const [slug, label, hue, glyph] of projects)
  write('projects', slug, svg({ w: 1200, h: 900, hue, label, glyph }));
for (const [slug, label, hue, glyph] of companies)
  write('companies', slug, svg({ w: 1200, h: 400, hue, label, glyph }));
for (const [slug, label, hue, glyph] of feed)
  write('feed', slug, svg({ w: 1200, h: 900, hue, label, glyph }));
for (const [slug, label, hue, glyph, w, h] of placeholders)
  write('placeholders', slug, svg({ w, h, hue, label, glyph }));
avatarHues.forEach((hue, i) =>
  write('avatars', `avatar-${String(i + 1).padStart(2, '0')}`,
    svg({ w: 512, h: 512, hue, label: '', glyph: G.user, sub: '' })));

console.log(`\u2713 wrote ${n} branded SVG assets into public/images/`);
