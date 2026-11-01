'use strict';

// A read-only wiki of the game's content: one page per file in data/, with the sprites the game uses,
// so missing or shared icons are easy to spot. Pages are picked by the URL hash: #research, #species/fish.

const FILES = ['research', 'species', 'stories', 'disasters', 'atoms', 'laws', 'book', 'sky'];
const PAGES = [
  { id: 'research', name: 'Research', file: 'research.yaml', about: 'The tech tree, by book tab.' },
  { id: 'species', name: 'Species', file: 'species.yaml', about: 'The tree of life.' },
  { id: 'stories', name: 'Stories', file: 'stories.yaml', about: 'Research chapters that end in a natural disaster.' },
  { id: 'disasters', name: 'Disasters', file: 'disasters.yaml', about: 'Natural disasters and how often they come back.' },
  { id: 'atoms', name: 'Atoms', file: 'atoms.yaml', about: 'The periodic table and what comets carry.' },
  { id: 'laws', name: 'Laws', file: 'laws.yaml', about: 'Laws of nature (Physics).' },
  { id: 'book', name: 'Book', file: 'book.yaml', about: 'Subjects, tabs and sections of the science book.' },
  { id: 'sky', name: 'Night sky', file: 'sky.yaml', about: 'Star signs and planets.' },
  { id: 'sprites', name: 'Sprites', file: 'sprites.js', about: 'Every pixel sprite, and where it is used.' },
];

const NEED_TEXT = {
  temp: v => `${v} °C`, sunAge: v => `sun ${v} billion years old`, spin: v => `${v}% spin`, days: v => `${v} days`,
  air: v => `${v} bar air`, water: v => `${v}% open water`, clouds: v => `${v}% clouds`, strikes: v => `${v} lightning strikes`,
  eruptions: v => `${v} eruptions`, land: v => `${v}% land`, mountains: v => `${v}% mountains`, minerals: v => `${v} minerals`,
  species: v => `${v} species alive`, desert: v => `${v}% desert`, plants: v => `${v} land plants`, comets: v => `${v} comets caught`,
  oxygen: v => `${v}% oxygen`, planets: v => `${v} planets found`, signs: v => `${v} star signs found`,
  matter: ([sym, n]) => `${n} ${sym} atoms`, done: id => link('research', id),
  evolved: id => link('species', id), daytime: () => 'the sun in the sky', night: () => 'night',
  disaster: id => `<a href="#disasters/${id}">${esc(byId(DATA.disasters, id)?.name || id)}</a> has struck`,
};
const EFFECTS = ['sun', 'volcanoes', 'eruptionSize', 'lightning', 'minerals', 'ch4', 'cloudRate', 'albedo', 'iceShift',
  'cloudMult', 'rainMult', 'boltMult', 'weatherMult', 'dieOff', 'landMult', 'dnaMult'];
const ELEMENTS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
  'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr ' +
  'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');

const DATA = {};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const byId = (list, id) => list.find(o => o.id === id);
const nameOf = (page, id) => (page === 'research' ? byId(DATA.research, id) : page === 'species' ? byId(DATA.species, id) : null)?.name || id;
function link(page, id) {
  return `<a href="#${page}/${encodeURIComponent(id)}">${esc(nameOf(page, id))}</a>`;
}
const fact = (label, value) => (value === undefined || value === '' ? '' : `<li><b>${label}:</b> ${value}</li>`);
const tags = list => list.map(t => `<span class="tag">${esc(t)}</span>`).join('');

// How many entries use each sprite, so shared icons stand out.
const iconUse = {};
function countIcons() {
  for (const r of DATA.research) (iconUse[r.icon] ||= []).push(['research', r.id]);
  for (const s of DATA.species) (iconUse[s.icon] ||= []).push(['species', s.id]);
}

function iconBox(id, missingText = 'no icon') {
  if (!id || !SPRITES[id]) return `<div class="icon none">${id ? `${esc(id)}<br>missing` : missingText}</div>`;
  return `<div class="icon" title="${esc(id)}"><img src="${Sprites.icon(id)}" alt="${esc(id)}"></div>`;
}

function iconNote(id) {
  const users = iconUse[id] || [];
  return `<span class="tag${users.length > 1 ? ' warn' : ''}">icon: ${esc(id)}${users.length > 1 ? ` · shared by ${users.length}` : ''}</span>`;
}

function card(page, item, iconHtml, body) {
  return `<article class="card" id="${page}/${esc(item.id)}">${iconHtml}<div class="card-body">
    <h3>${esc(item.name || item.id)}</h3><div class="id">${esc(item.id)}</div>${body}</div></article>`;
}

/* ---------- pages ---------- */

function pageHome() {
  const counts = {
    research: DATA.research.length, species: DATA.species.length, stories: DATA.stories.length, disasters: DATA.disasters.length,
    atoms: DATA.atoms.length, laws: DATA.laws.length, book: DATA.book.subjects.filter(s => !s.hidden).length,
    sky: DATA.sky.signs.length + DATA.sky.planets.length, sprites: Object.keys(SPRITES).length,
  };
  const unit = { research: 'nodes', species: 'species', stories: 'stories', disasters: 'disasters', atoms: 'atoms', laws: 'laws', book: 'subjects', sky: 'signs and planets', sprites: 'sprites' };
  const noIcon = [...DATA.disasters, ...DATA.laws, ...DATA.stories].length;
  const shared = Object.entries(iconUse).filter(([, u]) => u.length > 1);
  return `<h1>Phylarium Wiki</h1>
    <p class="lead">Everything in the game's data files, readable. Edit the YAML in <span class="file">data/</span> and this page follows.</p>
    <div class="tiles">${PAGES.map(p => `<a class="tile" href="#${p.id}"><span class="chip-title">${p.name}</span>
      <span>${counts[p.id]} ${unit[p.id]}</span><span class="file">${p.file}</span><span>${p.about}</span></a>`).join('')}</div>
    <h2>Art to do</h2>
    <p class="lead">${shared.length} sprites are shared by several entries (marked in red on cards). ${noIcon} disasters, laws and stories have no icon yet.</p>
    <div>${shared.map(([id, u]) => `<span class="tag warn">${esc(id)} × ${u.length}</span>`).join('')}</div>`;
}

function pageResearch() {
  const tabs = [];
  for (const s of DATA.book.subjects) for (const sec of s.sections || s.groups.flatMap(g => g.sections)) tabs.push([sec, `${s.name} › ${DATA.book.sections[sec]}`]);
  const storyOf = id => DATA.stories.find(st => st.chapters.includes(id) || st.ultra === id);
  const unlocks = id => DATA.research.filter(r => (r.requires || []).includes(id) || (r.needs || []).includes(`done ${id}`));
  return `<h1>Research</h1><p class="lead">${DATA.research.length} nodes. <span class="file">data/research.yaml</span></p>` +
    tabs.filter(([sec]) => DATA.research.some(r => r.tab === sec)).map(([sec, title]) => `<h2>${esc(title)}</h2><div class="grid">${
      DATA.research.filter(r => r.tab === sec).map(r => {
        const needs = (r.needs || []).map(n => {
          const [kind, ...rest] = String(n).split(' ');
          const v = rest.length === 1 ? (isNaN(rest[0]) ? rest[0] : +rest[0]) : rest.map(x => (isNaN(x) ? x : +x));
          return NEED_TEXT[kind] ? NEED_TEXT[kind](v) : esc(n);
        });
        const effects = EFFECTS.filter(k => r[k] !== undefined).map(k => `${k} ${typeof r[k] === 'object' ? Object.entries(r[k]).map(([a, b]) => `${a} ×${b}`).join(', ') : r[k]}`);
        const st = storyOf(r.id), next = unlocks(r.id);
        return card('research', r, iconBox(r.icon), `<ul class="facts">
          ${fact('Needs', needs.join(', '))}
          ${fact('After', r.requires ? r.requires.map(id => link('research', id)).join(', ') : '')}
          ${fact('Event', r.after)}
          ${fact('Leads to', next.map(n => link('research', n.id)).join(', '))}
          ${fact('Time', `${r.days} ${r.days === 1 ? 'day' : 'days'}`)}
          ${fact('Replaces', r.replaces && link('research', r.replaces))}
          ${fact('Puzzle', r.puzzle && esc(PUZZLE_NAMES[r.puzzle] || r.puzzle))}
          ${fact('Effects', effects.join(' · '))}
          ${fact('Story', st && `<a href="#stories/${st.id}">${esc(st.name)}</a>${st.ultra === r.id ? ' · ultra-research, after the disaster' : ''}${st.chapters.at(-1) === r.id && st.disaster ? ` · climax: <a href="#disasters/${st.disaster}">${esc(byId(DATA.disasters, st.disaster)?.name)}</a>` : ''}`)}
          ${fact('Unlocks species', DATA.species.filter(s => s.research === r.id).map(s => link('species', s.id)).join(', '))}
        </ul>${iconNote(r.icon)}`);
      }).join('')}</div>`).join('');
}

function pageSpecies() {
  const domains = [['ocean', 'Ocean'], ['ground', 'Land'], ['atmosphere', 'Air']];
  return `<h1>Species</h1><p class="lead">${DATA.species.length} species. The icon is also the critter on the planet. <span class="file">data/species.yaml</span></p>` +
    domains.map(([d, title]) => `<h2>${title}</h2><div class="grid">${DATA.species.filter(s => s.domain === d).map(s => {
      const kids = DATA.species.filter(k => k.parent === s.id);
      return card('species', s, iconBox(s.icon), `<p class="desc">${esc(s.desc || '')}</p><ul class="facts">
        ${fact('Evolves from', s.parent && link('species', s.parent))}
        ${fact('Evolves into', kids.map(k => link('species', k.id)).join(', '))}
        ${fact('Cost', s.cost !== undefined ? `${s.cost.toLocaleString('en')} DNA` : 'free')}
        ${fact('Makes', [`${s.dna} DNA/s`, s.o2 && `${s.o2} O₂/s`, s.green && `greens ${Math.round(s.green * 100)}%`].filter(Boolean).join(', '))}
        ${fact('Lives at', s.temp && `${s.temp[0]} to ${s.temp[1]} °C`)}
        ${fact('Homes', s.home && tags(s.home))}
        ${fact('Needs research', s.research && link('research', s.research))}
        ${fact('Microbe', s.microbe && 'yes, not shown on the planet')}
      </ul>${iconNote(s.icon)}`);
    }).join('')}</div>`).join('');
}

function pageStories() {
  return `<h1>Stories</h1><p class="lead">Each story opens with a minigame, then a chain of research ending in a climax that unlocks a disaster, then an ultra-research (gained by a puzzle) that makes facing it worth while. <span class="file">data/stories.yaml</span></p>` +
    DATA.stories.map(st => {
      const d = st.disaster && byId(DATA.disasters, st.disaster);
      return `<section class="story card" id="stories/${st.id}" style="display:block"><h3>${esc(st.name)}</h3><div class="id">${esc(st.id)}</div>
        <div class="chapters">${st.minigame ? `<span class="chapter game">▶ ${esc(MINIGAME_NAMES[st.minigame] || st.minigame)}</span><span class="arrow">▸</span>` : ''}${st.chapters.map(id => {
          const r = byId(DATA.research, id);
          return `<a class="chapter" href="#research/${id}">${r && SPRITES[r.icon] ? `<img src="${Sprites.icon(r.icon)}" alt="">` : ''}${esc(r?.name || id)}</a>`;
        }).join('<span class="arrow">▸</span>')}${d ? `<span class="arrow">▸</span><a class="chapter climax" href="#disasters/${d.id}">${esc(d.name)}</a>` : ''}${ultraLink(st)}</div></section>`;
    }).join('');
}

function pageDisasters() {
  return `<h1>Natural disasters</h1><p class="lead"><span class="file">data/disasters.yaml</span></p><div class="grid">${DATA.disasters.map(d => {
    const st = DATA.stories.find(s => s.disaster === d.id);
    return card('disasters', d, iconBox(null), `<p class="desc">${esc(d.how)}</p><ul class="facts">
      ${fact('Unlocked by', st && `<a href="#stories/${st.id}">${esc(st.name)}</a>`)}
      ${fact('Comes back', d.every && `about every ${d.every} s`)}
    </ul>`);
  }).join('')}</div>`;
}

function pageAtoms() {
  const known = new Map(DATA.atoms.map(a => [a.id, a]));
  const cell = z => {
    if (z === 1) return [1, 1];
    if (z === 2) return [1, 18];
    const starts = [3, 11, 19, 37, 55, 87], row = starts.findLastIndex(s => z >= s) + 2, i = z - starts[row - 2];
    if (row <= 3) return [row, i < 2 ? i + 1 : i + 11];
    if (row <= 5) return [row, i + 1];
    if (i < 2) return [row, i + 1];
    if (i < 17) return [row + 3, i + 1];
    return [row, i - 13];
  };
  const table = ELEMENTS.map((sym, k) => {
    const [r, c] = cell(k + 1), a = known.get(sym);
    return `<div class="el${a ? ' in' : ''}${a?.comet ? ' comet' : ''}" style="grid-row:${r};grid-column:${c}" title="${sym}">${a ? `<a href="#atoms/${sym}" style="color:inherit">${sym}</a>` : k + 1}</div>`;
  }).join('');
  return `<h1>Atoms</h1><p class="lead">${DATA.atoms.length} of 118 can be found. Green: found on the planet. Orange: carried by comets. <span class="file">data/atoms.yaml</span></p>
    <div class="ptable">${table}</div><div class="grid">${DATA.atoms.map(a => card('atoms', a,
      `<div class="icon" style="font-family:var(--pixel-font);font-size:16px;color:var(--good)">${esc(a.id)}</div>`,
      `<p class="desc">${esc(a.how)}</p><ul class="facts">${fact('Atomic number', ELEMENTS.indexOf(a.id) + 1)}
      ${fact('Comets', a.comet && `<span class="swatch" style="background:${a.comet.color}"></span> tail stripe, ${Math.round(a.comet.chance * 100)}% of comets`)}</ul>`)).join('')}</div>`;
}

function pageLaws() {
  return `<h1>Laws of nature</h1><p class="lead"><span class="file">data/laws.yaml</span></p><div class="grid">${DATA.laws.map(l => card('laws', l,
    `<div class="icon" style="font-family:var(--pixel-font);font-size:${l.sign.length > 3 ? 9 : 14}px;color:var(--accent)">${esc(l.sign)}</div>`,
    `<p class="desc">${esc(l.how)}</p>`)).join('')}</div>`;
}

const sectionTags = list => list.length ? list.map(sec => `<a href="#research" class="tag">${esc(DATA.book.sections[sec] || sec)}</a>`).join('') : 'empty for now';

function pageBook() {
  return `<h1>Science book</h1><p class="lead">Tabs top to bottom, and the sections on each page. <span class="file">data/book.yaml</span></p><div class="grid">${
    DATA.book.subjects.map(s => card('book', s,
      `<div class="subject-tab" style="background:${s.color}">${SPRITES['subject' + s.name] ? `<img src="${Sprites.icon('subject' + s.name)}" alt="">` : ''}</div>`,
      `<ul class="facts">${fact('Color', `<span class="swatch" style="background:${s.color}"></span> ${s.color}`)}
      ${s.groups ? s.groups.map(g => fact(esc(g.name), sectionTags(g.sections))).join('') : fact('Sections', sectionTags(s.sections))}
      ${fact('Hidden', s.hidden && 'yes, opened from the ⚙ button')}</ul>`)).join('')}</div>`;
}

function signCanvas(s) {
  const P = 3, c = document.createElement('canvas');
  c.width = 32 * P;
  c.height = 20 * P;
  const g = c.getContext('2d'), ox = 4 * P, oy = 2 * P;
  g.fillStyle = '#6a8aff';
  for (const [a, b] of s.lines) {
    const [x0, y0] = s.stars[a], [x1, y1] = s.stars[b], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 1; k < n; k += 2) g.fillRect(ox + Math.round(x0 + (x1 - x0) * k / n) * P, oy + Math.round(y0 + (y1 - y0) * k / n) * P, P, P);
  }
  g.fillStyle = '#fff8d0';
  for (const [x, y] of s.stars) g.fillRect(ox + x * P, oy + y * P, P, P);
  return c.toDataURL();
}

function pageSky() {
  return `<h1>Night sky</h1><p class="lead"><span class="file">data/sky.yaml</span></p>
    <h2>Star signs</h2><div class="grid">${DATA.sky.signs.map(s => card('sky', s, `<img class="sign-canvas" src="${signCanvas(s)}" alt="">`,
      `<ul class="facts">${fact('Stars', s.stars.length)}${fact('Hidden', s.hidden && 'yes, a secret 13th sign')}</ul>`)).join('')}</div>
    <h2>Planets</h2><div class="grid">${DATA.sky.planets.map(p => card('sky', p,
      `<div class="planet-dot"><i style="width:${(p.size || 1) * 8}px;height:${(p.size || 1) * 8}px;background:${p.color};opacity:${p.faint || 1}"></i></div>`,
      `<ul class="facts">${fact('Color', `<span class="swatch" style="background:${p.color}"></span> ${p.color}`)}
      ${fact('Speed', `${p.speed} of the sky per day`)}${fact('Shows', p.twilight ? 'only at dusk and dawn' : p.rare ? `one night in ${p.rare}` : 'at night')}
      ${fact('Brightness', p.faint && `faint (${p.faint})`)}</ul>`)).join('')}</div>`;
}

function pageSprites() {
  const users = id => [...(iconUse[id] || []), ...DATA.book.subjects.filter(s => 'subject' + s.name === id).map(s => ['book', s.id])];
  return `<h1>Sprites</h1><p class="lead">${Object.keys(SPRITES).length} pixel sprites in <span class="file">sprites.js</span>. The sun, moon, planet and comets are drawn in code.</p>
    <div class="grid">${Object.keys(SPRITES).map(id => {
      const u = users(id), c = Sprites.canvas(id);
      return card('sprites', { id, name: id }, iconBox(id), `<ul class="facts">${fact('Size', `${c.width} × ${c.height}`)}
        ${fact('Used by', u.length ? u.map(([p, i]) => (p === 'book' ? esc(i) : link(p, i))).join(', ') : 'scene or UI only')}</ul>
        ${u.length > 1 ? `<span class="tag warn">shared by ${u.length}</span>` : ''}`);
    }).join('')}</div>`;
}

// What the player does to open each story (MINIGAMES in game.js).
const MINIGAME_NAMES = { ignite: 'Ignite the sun', spin: 'Spin the planet', comets: 'Catch a comet', ice: 'Crack the ice',
  cracks: 'Tap 3 lava cracks', sunspots: 'Tap 3 sunspots', moon: 'Drag the moon across the sky', river: 'Trace a river to the sea',
  plates: 'Push two plates together', seeds: 'Plant 3 seeds' };
const PUZZLE_NAMES = { spectrum: 'Put the colors on the arcs in spectrum order' };

// A story's ultra-research, after its disaster, in a rainbow frame.
function ultraLink(st) {
  const r = st.ultra && byId(DATA.research, st.ultra);
  return r ? `<span class="arrow">▸</span><a class="chapter ultra" href="#research/${r.id}">${SPRITES[r.icon] ? `<img src="${Sprites.icon(r.icon)}" alt="">` : ''}${esc(r.name)}</a>` : '';
}

const RENDER = { research: pageResearch, species: pageSpecies, stories: pageStories, disasters: pageDisasters, atoms: pageAtoms,
  laws: pageLaws, book: pageBook, sky: pageSky, sprites: pageSprites };

function route() {
  const [page, item] = location.hash.slice(1).split('/').map(decodeURIComponent);
  const render = RENDER[page] || pageHome;
  document.getElementById('page').innerHTML = render();
  document.getElementById('nav').innerHTML = PAGES.map(p => `<a href="#${p.id}" class="${p.id === page ? 'on' : ''}">${p.name}</a>`).join('');
  document.title = `${RENDER[page] ? PAGES.find(p => p.id === page).name + ' · ' : ''}Phylarium Wiki`;
  const target = item && document.getElementById(`${page}/${item}`);
  if (target) target.scrollIntoView();
  else window.scrollTo(0, 0);
}

(async () => {
  try {
    await Promise.all(FILES.map(async f => {
      const res = await fetch(`../data/${f}.yaml`, { cache: 'no-cache' });
      DATA[f] = jsyaml.load(await res.text());
    }));
  } catch (e) {
    document.getElementById('page').innerHTML = `<h1>Could not load the data</h1><p class="lead">${esc(e.message)}</p>`;
    return;
  }
  countIcons();
  window.addEventListener('hashchange', route);
  route();
})();
