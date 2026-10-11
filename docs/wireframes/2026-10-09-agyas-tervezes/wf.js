/* Wireframe-segéd: közös adatok és rajzolók az ágyás-munkalap változataihoz. */

// --- Ikonok (lucide-szerű vonalrajzok) -------------------------------------------
const ICON = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkc: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  copyplus: '<line x1="15" x2="15" y1="12" y2="18"/><line x1="12" x2="18" y1="15" y2="15"/><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
};
function icon(name, size = 15, extra = '') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICON[name]}</svg>`;
}

// --- Színek (zöldségcsoport szerint, mint a cropColors.ts) --------------------------
const C = {
  termes: '#ff3b30',
  gyoker: '#ff9500',
  hagymas: '#ffcc00',
  level: '#34c759',
  huvelyes: '#af52de',
  fuszer: '#00c7be',
  kisero: '#ff2d55',
};

// --- Az ágyás és a 2027-es terve -----------------------------------------------------
// Emelt ágyás 1: 400 × 120 cm, a sorok keresztben (a tengely a 400 cm-es hossz).
// Előzmény: 2025 burgonya, 2026 ősszel fokhagyma (tény adatos, 2027. júl. 20-ig).
const BED = { L: 400, W: 120 };
const P = {
  retek: { name: 'Retek', color: C.gyoker, a0: 0, a1: 45, s: '03-20', e: '05-05', phase: 'elo' },
  salata: { name: 'Saláta', color: C.level, a0: 45, a1: 120, s: '03-25', e: '05-25', phase: 'elo' },
  bab1: { name: 'Bokorbab', color: C.huvelyes, a0: 0, a1: 45, s: '05-15', e: '08-20', linked: true },
  repa: { name: 'Sárgarépa', color: C.gyoker, a0: 45, a1: 75, s: '04-20', e: '10-10' },
  bab2: { name: 'Bokorbab', color: C.huvelyes, a0: 75, a1: 120, s: '05-15', e: '08-20', linked: true },
  uborka: { name: 'Uborka', color: C.termes, a0: 120, a1: 180, s: '05-20', e: '09-15' },
  paradicsom: { name: 'Paradicsom', color: C.termes, a0: 180, a1: 240, s: '05-10', e: '10-05', issue: 'kerulendo' },
  bazsalikom: { name: 'Bazsalikom', color: C.fuszer, a0: 240, a1: 270, s: '05-15', e: '09-30' },
  fokhagyma: { name: 'Fokhagyma', color: C.hagymas, a0: 325, a1: 400, s: '01-01', e: '07-20', fixed: true, cont: true },
  spenot: { name: 'Spenót', color: C.level, a0: 0, a1: 45, s: '08-25', e: '11-15' },
};
const DAYS = { elo: '04-12', fo: '07-01', uto: '09-22' };
const at = (md) => Object.values(P).filter((p) => p.s <= md && md < p.e);

// --- Dátumok --------------------------------------------------------------------------
const MONTHS = ['jan', 'feb', 'márc', 'ápr', 'máj', 'jún', 'júl', 'aug', 'szept', 'okt', 'nov', 'dec'];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function doy(md) {
  const [m, d] = md.split('-').map(Number);
  let n = 0;
  for (let i = 0; i < m - 1; i++) n += MDAYS[i];
  return n + d - 1;
}
const short = (md) => {
  const [m, d] = md.split('-').map(Number);
  return `${MONTHS[m - 1]}. ${d}.`;
};

// --- Ágyáskép (felülnézet) ----------------------------------------------------------
let svgSeq = 0;
const ink = '#1c1c1e';
const sub = 'rgba(60,60,67,.65)';
function textW(t, size = 12) {
  return t.length * size * 0.56;
}

/**
 * strips: [{a0,a1,c0?,c1?,name,color,issue?,fixed?,note?,sel?,dim?,linked?}]
 * gaps:   [{a0,a1,c0?,c1?,label,sel?}]
 * bounds: [{at,c0?,c1?,rel:1|-1}]
 * ghost:  {a0,a1,name,color,note}
 */
function bedSvg(o) {
  const { L = BED.L, W = BED.W, px = 1.72, strips = [], gaps = [], bounds = [], ghost = null, ruler = true, small = false } = o;
  const id = `h${++svgSeq}`;
  const pl = ruler ? 30 : 1;
  const pt = ruler ? 20 : 1;
  const w = L * px;
  const h = W * px;
  const fs = small ? 10.5 : 12;
  let g = '';
  g += `<defs><pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#fafafc"/><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(60,60,67,.10)" stroke-width="3"/></pattern>
  <pattern id="${id}l" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,.10)" stroke-width="1.5"/></pattern></defs>`;
  g += `<rect width="${w}" height="${h}" rx="3" fill="#fbfbfd" stroke="rgba(60,60,67,.28)"/>`;
  for (let a = 10; a < L; a += 10) g += `<line x1="${a * px}" y1="0" x2="${a * px}" y2="${h}" stroke="rgba(60,60,67,${a % 50 ? 0.05 : 0.12})"/>`;
  for (let c = 10; c < W; c += 10) g += `<line x1="0" y1="${c * px}" x2="${w}" y2="${c * px}" stroke="rgba(60,60,67,${c % 50 ? 0.05 : 0.12})"/>`;

  const rect = (q) => {
    const c0 = q.c0 ?? 0;
    const c1 = q.c1 ?? W;
    return { x: q.a0 * px, y: c0 * px, w: (q.a1 - q.a0) * px, h: (c1 - c0) * px };
  };
  const label = (r, lines, opts = {}) => {
    const wide = Math.max(...lines.map((l, i) => textW(l, i ? fs - 1 : fs)));
    const vertical = wide + 10 > r.w && r.h > r.w;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const lh = fs + 3;
    const start = -((lines.length - 1) * lh) / 2;
    let t = `<g ${vertical ? `transform="rotate(-90 ${cx} ${cy})"` : ''}>`;
    lines.forEach((l, i) => {
      t += `<text x="${cx}" y="${cy + start + i * lh + fs * 0.35}" text-anchor="middle" font-size="${i ? fs - 1 : fs}" font-weight="${i ? 400 : 600}" fill="${i ? sub : opts.color ?? ink}">${l}</text>`;
    });
    return t + '</g>';
  };

  for (const q of gaps) {
    const r = rect(q);
    const selC = q.sel ? '#248a3d' : 'rgba(60,60,67,.38)';
    g += `<rect x="${r.x + 1.5}" y="${r.y + 1.5}" width="${r.w - 3}" height="${r.h - 3}" rx="4" fill="${q.sel ? 'rgba(52,199,89,.10)' : `url(#${id})`}" stroke="${selC}" stroke-width="${q.sel ? 2 : 1.2}" stroke-dasharray="5 4"/>`;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2 - (small ? 0 : 10);
    if (!ghost || !q.sel) {
      g += `<circle cx="${cx}" cy="${cy}" r="${small ? 8 : 12}" fill="${q.sel ? '#34c759' : '#fff'}" stroke="${q.sel ? '#34c759' : 'rgba(60,60,67,.35)'}"/>`;
      g += `<path d="M${cx - 5} ${cy}h10M${cx} ${cy - 5}v10" stroke="${q.sel ? '#fff' : '#248a3d'}" stroke-width="2" stroke-linecap="round"/>`;
      if (!small && q.label) {
        const ls = q.label.split('\n');
        ls.forEach((l, i) => {
          g += `<text x="${cx}" y="${cy + 30 + i * 14}" text-anchor="middle" font-size="11.5" font-weight="${i ? 400 : 600}" fill="${q.sel ? '#248a3d' : sub}">${l}</text>`;
        });
      }
    }
  }
  if (ghost) {
    const r = rect(ghost);
    g += `<rect x="${r.x + 3}" y="${r.y + 3}" width="${r.w - 6}" height="${r.h - 6}" rx="3" fill="${ghost.color}" fill-opacity=".16" stroke="${ghost.color}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    g += label(r, [ghost.name, ghost.note ?? 'előnézet']);
  }
  for (const q of strips) {
    const r = rect(q);
    const op = q.dim ? 0.1 : 0.3;
    g += `<rect x="${r.x + 1}" y="${r.y + 1}" width="${r.w - 2}" height="${r.h - 2}" rx="3" fill="${q.color}" fill-opacity="${op}" stroke="${q.color}" stroke-opacity="${q.dim ? 0.35 : 0.9}" stroke-width="1.2"/>`;
    if (q.fixed) g += `<rect x="${r.x + 1}" y="${r.y + 1}" width="${r.w - 2}" height="${r.h - 2}" rx="3" fill="url(#${id}l)"/>`;
    if (!small) {
      const lines = [q.name, q.note ?? `${q.a1 - q.a0} cm`];
      g += label(r, lines, { color: q.dim ? sub : ink });
      if (q.fixed) g += `<g transform="translate(${r.x + 6} ${r.y + 6})" color="${sub}">${icon('lock', 13)}</g>`;
      if (q.linked) g += `<g transform="translate(${r.x + 6} ${r.y + r.h - 19})" color="${sub}">${icon('link', 13)}</g>`;
      if (q.issue) {
        const col = q.issue === 'kerulendo' ? '#ff3b30' : '#ff9500';
        g += `<circle cx="${r.x + r.w - 11}" cy="${r.y + 11}" r="8" fill="${col}"/><text x="${r.x + r.w - 11}" y="${r.y + 15}" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">!</text>`;
      }
    }
  }
  for (const b of bounds) {
    const x = b.at * px;
    const y0 = (b.c0 ?? 0) * px;
    const y1 = (b.c1 ?? W) * px;
    g += `<line x1="${x}" y1="${y0 + 3}" x2="${x}" y2="${y1 - 3}" stroke="${b.rel > 0 ? '#34c759' : '#ff3b30'}" stroke-width="3.5" stroke-linecap="round"/>`;
  }
  for (const q of strips.filter((s) => s.sel)) {
    const r = rect(q);
    g += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3" fill="none" stroke="#248a3d" stroke-width="2.5"/>`;
    const hs = [
      [r.x, r.y],
      [r.x + r.w / 2, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h / 2],
      [r.x + r.w, r.y + r.h / 2],
      [r.x, r.y + r.h],
      [r.x + r.w / 2, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ];
    for (const [x, y] of hs) g += `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="2" fill="#fff" stroke="#248a3d" stroke-width="1.6"/>`;
  }
  if (ruler) {
    for (let a = 0; a <= L; a += px < 1.2 ? 100 : 50) {
      g += `<text x="${a * px}" y="-7" text-anchor="${a === 0 ? 'start' : a === L ? 'end' : 'middle'}" font-size="10.5" fill="${sub}">${a === L ? `${a} cm` : a}</text>`;
    }
    g += `<text transform="translate(-12 ${h / 2}) rotate(-90)" text-anchor="middle" font-size="10.5" fill="${sub}">${String(W / 100).replace('.', ',')} m</text>`;
  }
  return `<svg width="${w + pl + 4}" height="${h + pt + 4}" font-family="-apple-system,BlinkMacSystemFont,sans-serif"><g transform="translate(${pl} ${pt})">${g}</g></svg>`;
}

/** Kis előnézet az időszak-kártyákon. */
function miniBed(md) {
  const strips = at(md)
    .map((p) => `<rect x="${p.a0}" y="0" width="${p.a1 - p.a0}" height="${BED.W}" fill="${p.color}" fill-opacity=".55"/>`)
    .join('');
  return `<svg viewBox="0 0 ${BED.L} ${BED.W}" preserveAspectRatio="none"><rect width="${BED.L}" height="${BED.W}" fill="rgba(118,118,128,.12)"/>${strips}</svg>`;
}

function phaseCards(on, dayText) {
  const card = (key, name) =>
    `<div class="phase ${on === key ? 'on' : ''}"><b>${name}</b><small>${short(DAYS[key])}</small>${miniBed(DAYS[key])}</div>`;
  return `<div class="phases">${card('elo', 'Elővetemény')}${card('fo', 'Fővetemény')}${card('uto', 'Utóvetemény')}<div class="dayfield">Nap<span>${dayText ?? `2027. ${short(DAYS[on])}`}</span></div></div>`;
}

// --- Idővonal (hely × idő) -------------------------------------------------------------
/**
 * items: P elemei (+ sel, dim); gap: {a0,a1,s,e,label}; cursor: 'HH-NN'
 */
function timelineSvg(o) {
  const { L = BED.L, W = 760, H = 420, items = Object.values(P), gap = null, cursor = null, clash = null, compact = false } = o;
  const id = `t${++svgSeq}`;
  const pl = 44;
  const pt = 24;
  const x = (md) => (doy(md) / 365) * W;
  const xe = (md) => (md === '12-31' ? W : x(md));
  const y = (cm) => (cm / L) * H;
  let g = `<defs><pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,59,48,.55)" stroke-width="2"/></pattern>
  <pattern id="${id}g" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#fafafc"/><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(60,60,67,.08)" stroke-width="3"/></pattern></defs>`;
  g += `<rect width="${W}" height="${H}" fill="url(#${id}g)"/>`;
  let acc = 0;
  MONTHS.forEach((m, i) => {
    const x0 = (acc / 365) * W;
    const x1 = ((acc + MDAYS[i]) / 365) * W;
    if (i % 2) g += `<rect x="${x0}" y="0" width="${x1 - x0}" height="${H}" fill="rgba(118,118,128,.06)"/>`;
    g += `<text x="${(x0 + x1) / 2}" y="-8" text-anchor="middle" font-size="11" fill="${sub}">${m}</text>`;
    acc += MDAYS[i];
  });
  for (let a = 0; a <= L; a += 50) {
    g += `<line x1="0" y1="${y(a)}" x2="${W}" y2="${y(a)}" stroke="rgba(60,60,67,.08)"/>`;
    g += `<text x="-8" y="${y(a) + 4}" text-anchor="end" font-size="10.5" fill="${sub}">${a}</text>`;
  }
  g += `<text x="-8" y="-8" text-anchor="end" font-size="10.5" fill="${sub}">cm</text>`;
  for (const p of items) {
    const x0 = x(p.s);
    const x1 = xe(p.e);
    const y0 = y(p.a0);
    const y1 = y(p.a1);
    g += `<rect x="${x0 + 1}" y="${y0 + 1}" width="${x1 - x0 - 2}" height="${y1 - y0 - 2}" rx="4" fill="${p.color}" fill-opacity="${p.dim ? 0.1 : 0.3}" stroke="${p.color}" stroke-opacity="${p.dim ? 0.35 : 0.9}" stroke-width="1.2" ${p.planned === false ? '' : ''}/>`;
    if (p.cont) g += `<path d="M${x0 + 2} ${(y0 + y1) / 2 - 6} l-0 12 l-6 -6z" fill="${p.color}"/>`;
    const lw = textW(p.name, 11.5);
    if (lw + 8 < x1 - x0 && y1 - y0 > 15) {
      g += `<text x="${x0 + 6}" y="${(y0 + y1) / 2 + 4}" font-size="11.5" font-weight="600" fill="${p.dim ? sub : ink}">${p.name}</text>`;
    }
    if (p.fixed) g += `<g transform="translate(${x1 - 18} ${(y0 + y1) / 2 - 7})" color="${sub}">${icon('lock', 13)}</g>`;
    if (p.issue) g += `<circle cx="${x1 - 10}" cy="${y0 + 10}" r="7" fill="#ff3b30"/><text x="${x1 - 10}" y="${y0 + 14}" text-anchor="middle" font-size="10" font-weight="800" fill="#fff">!</text>`;
    if (p.sel) g += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="4" fill="none" stroke="#248a3d" stroke-width="2.5"/>`;
  }
  if (clash) {
    const x0 = x(clash.s);
    const x1 = x(clash.e);
    g += `<rect x="${x0}" y="${y(clash.a0)}" width="${x1 - x0}" height="${y(clash.a1) - y(clash.a0)}" fill="url(#${id})" stroke="#ff3b30" stroke-width="1.5"/>`;
  }
  if (gap) {
    const x0 = x(gap.s);
    const x1 = xe(gap.e);
    const y0 = y(gap.a0);
    const y1 = y(gap.a1);
    g += `<rect x="${x0 + 1.5}" y="${y0 + 1.5}" width="${x1 - x0 - 3}" height="${y1 - y0 - 3}" rx="4" fill="rgba(52,199,89,.12)" stroke="#248a3d" stroke-width="2" stroke-dasharray="5 4"/>`;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 - 7;
    g += `<circle cx="${cx}" cy="${cy}" r="11" fill="#34c759"/><path d="M${cx - 5} ${cy}h10M${cx} ${cy - 5}v10" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
    if (gap.label) g += `<text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#248a3d">${gap.label}</text>`;
  }
  // fagyhatárok és a kurzor
  for (const f of ['05-10', '10-20']) g += `<line x1="${x(f)}" y1="0" x2="${x(f)}" y2="${H}" stroke="#32ade6" stroke-width="1.5" stroke-dasharray="2 3"/>`;
  if (cursor) {
    g += `<line x1="${x(cursor)}" y1="-2" x2="${x(cursor)}" y2="${H}" stroke="#248a3d" stroke-width="2"/>`;
    g += `<rect x="${x(cursor) - 26}" y="${H + 4}" width="52" height="18" rx="9" fill="#248a3d"/><text x="${x(cursor)}" y="${H + 17}" text-anchor="middle" font-size="11" font-weight="600" fill="#fff">${short(cursor)}</text>`;
  }
  return `<svg width="${W + pl + 8}" height="${H + pt + (compact ? 6 : 26)}" font-family="-apple-system,BlinkMacSystemFont,sans-serif"><g transform="translate(${pl} ${pt})">${g}</g></svg>`;
}

// --- Felületi darabok --------------------------------------------------------------------
function chip(tone, text) {
  return `<span class="chip ${tone}">${text}</span>`;
}

function sug(o) {
  return `<div class="sug ${o.hover ? 'hover' : ''}" style="--sc:${o.color}">
    <span class="sw"></span>
    <div class="body">
      <div class="t">${o.name}${o.variety ? ` <span>– ${o.variety}</span>` : ''}</div>
      <div class="m">${o.meta}</div>
      <div class="chips">${o.chips.map(([t, x]) => chip(t, x)).join('')}</div>
    </div>
    <span class="add">${icon('plus', 15)}</span>
  </div>`;
}

function notice(level, html) {
  const ic = { kerulendo: 'ban', figyelem: 'warn', ok: 'checkc', info: 'info' }[level];
  return `<div class="notice ${level}">${icon(ic, 15)}<div>${html}</div></div>`;
}

function sidebar() {
  const tile = (c, t) => `<div class="sb-tile" style="--c:${c}"><i></i>${t}</div>`;
  const beds = ['Emelt ágyás 1', 'Hosszú ágyás', 'Emelt ágyás 2', 'Emelt ágyás 3', 'Emelt ágyás 4', 'Emelt ágyás 5', 'Emelt ágyás 6', 'Emelt ágyás 7', 'Emelt ágyás 8'];
  return `<aside class="sb">
    <div class="sb-top"><span>Kerttervező</span><span class="sb-year">2027 ⌄</span></div>
    <div class="sb-search">Keresés a naplóban</div>
    <div class="sb-tiles">${tile('#007aff', 'Ez a hét')}${tile('#ff3b30', 'Ütemezett')}${tile('#5856d6', 'Naptár')}${tile('#34c759', 'Éves terv')}${tile('#ff9500', 'Figyelmeztetések')}${tile('#a2845e', 'Napló')}</div>
    <div class="sb-h">Kertem</div>
    ${beds.map((b, i) => `<div class="sb-bed ${i === 0 ? 'on' : ''}"><i></i>${b}<span>${[9, 3, 0, 0, 0, 0, 0, 0, 0][i]}</span></div>`).join('')}
  </aside>`;
}

function header() {
  return `<div class="nav"><span class="back">‹ Kert</span><span class="tools"><span class="tool">${icon('copy', 16)}</span><span class="tool">${icon('pencil', 16)}</span></span></div>
  <h1 class="h1">Emelt ágyás 1</h1>
  <div class="subline">Emelt ágyás · 4 × 1,2 m · 4,8 m² · sorok keresztben · napos · <span style="color:var(--tint)">Adatok ›</span></div>`;
}

function savebar(changes = 3, bad = 1) {
  return `<div class="savebar"><span class="cnt"><b>${changes} nem mentett módosítás</b></span>${bad ? `<span class="warnc">${icon('ban', 13)} ${bad} kerülendő</span>` : ''}<span class="btn discard">Elvetés</span><span class="btn save">Mentés</span></div>`;
}

function belowBlocks() {
  return `<div class="below">
    <div class="blk"><span>Idővonal 2027 <small>· az év egyben, kattintásra napot választ</small></span><span class="lnk">Megnyitás ⌄</span></div>
    <div class="blk"><span>Napló 2027 <small>· 2 bejegyzés</small></span><span class="lnk">+ Új bejegyzés</span></div>
    <div class="blk"><span>Előzmények (vetésforgó) <small>· 2026 fokhagyma, 2025 burgonya</small></span><span class="lnk">+ Előzmény rögzítése</span></div>
  </div>`;
}

/** A teljes asztali keret: oldalsáv, fejléc, munkalap (bal: stage, jobb: panel), alsó blokkok. */
function desktop({ stage, panel, below = belowBlocks(), bar = savebar(), extra = '' }) {
  return `<div class="frame">${sidebar()}<main class="main">${header()}<div class="ws"><section class="stage">${stage}</section><aside class="panel">${panel}</aside></div>${below}</main>${bar}${extra}</div>`;
}

function notes(list, cls = '') {
  return `<div class="notes ${cls}">${list.map((n, i) => `<div class="note"><span class="mk">${i + 1}</span><div>${n}</div></div>`).join('')}</div>`;
}

function mk(n, style) {
  return `<span class="mk" style="${style}">${n}</span>`;
}
