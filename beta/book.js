'use strict';

// The page around the scene: DOM helpers, the colors found, and the science book with all its pages
// (research, star signs and planets, the periodic table, laws, species, the tree of life, the world).

/* ================= DOM ================= */

/** @type {(sel: string) => any} The page's elements by selector (any: each is used as the element it is). */
const $ = sel => document.querySelector(sel);
const el = {
  temp: $('#temp'),
  tempSub: $('#temp-sub'),
  hudLine: $('#hud-line'),
  fx: $('#fx'),
};

const spriteImg = id => `<img class="sprite" src="${Sprites.icon(id)}" alt="">`;

// Each tab is rebuilt only when its list of visible entries changes; otherwise only text updates.
const tabKeys = {};

function tabEntries(tab) {
  const entries = [];
  for (const u of RESEARCH) if (u.tab === tab && has(u.id)) entries.push({ kind: 'researched', item: u }); // every step stays
  for (const u of RESEARCH)
    if (u.tab === tab && !has(u.id) && !u.auto && researchVisible(u)) entries.push({ kind: 'research', item: u });
  // A gas not yet known shows as a blank: "?" and an empty gauge.
  for (const u of RESEARCH) if (u.tab === tab && u.auto && !has(u.id)) entries.push({ kind: 'mystery', item: u });
  // One blank card when more research waits in this section: there is always a next step. It is the nearest one:
  // research whose required research is done (only waiting for an event or atoms), then research one step away.
  // An ultra shows only once its disaster does, even when the disaster is in another section.
  const hidden = RESEARCH.filter(u => u.tab === tab && !u.auto && !u.hidden && !has(u.id) && !researchVisible(u));
  const near = u => (u.requires || []).every(id => has(id) || researchVisible(RESEARCH_BY_ID[id]));
  const ahead = hidden.find(u => (u.requires || []).every(has)) || hidden.find(near) || hidden.find(u => !u.ultra);
  if (ahead) entries.push({ kind: 'mystery', item: ahead, next: true });
  return entries;
}

// What a locked research still waits for: the research it requires that is not done yet, by name once that
// research shows in the book (a research not shown yet stays ???).
function lockedBy(u) {
  const missing = (u.requires || []).filter(id => !has(id));
  if (!missing.length) return '';
  return `Requires ${missing.map(id => (researchVisible(RESEARCH_BY_ID[id]) ? RESEARCH_BY_ID[id].name : '???')).join(', ')}`;
}

function meterHtml(label, cls) {
  return `<div class="meter-row"><span>${label}</span><b class="${cls}-v"></b></div><div class="meter"><i class="${cls}"></i></div>`;
}

function headHtml(tab) {
  if (tab === 'sun') {
    return `${seen('sunlit') ? meterHtml('Sun brightness', 'm-sun') : ''}<p class="note m-fusion"></p><p class="note m-taps"></p>`;
  }
  if (tab === 'moon') return '<p class="note m-moon-note"></p>';
  if (tab === 'comets') return '<p class="note m-comets"></p>';
  if (tab === 'atmosphere') {
    return `${state.eruptions ? meterHtml('Aerosols', 'm-aerosol') : ''}
      <p class="note m-air"></p><p class="note m-climate"></p>`;
  }
  if (tab === 'core') return '<p class="note m-core"></p>';
  if (tab === 'land') {
    return `${has('volcano') ? meterHtml('Volcanic activity', 'm-volc') : ''}
      <p class="note m-land"></p>`;
  }
  if (tab === 'ocean') {
    return `
      ${meterHtml('Open ocean', 'm-open')}
      <p class="note m-ice"></p>
      ${seen('storms') ? meterHtml('Primordial soup', 'm-soup') : ''}
      ${seen('ocean') ? '<p class="note m-minerals"></p>' : ''}`;
  }
  return '';
}

function renderTab(tab, force = false) {
  const root = $(`#${tab}`);
  if (!root || tab === 'world' || tab === 'life') return;
  const entries = tabEntries(tab);
  const key =
    `${state.happened.length}|${has('volcano')}|${state.eruptions > 0}|${state.spinLocked}|${entries.map(e => e.kind + e.item.id + pop(e.item.id)).join()}`.replace(
      /0\.\d+/g,
      'a',
    );
  if (force || tabKeys[tab] !== key) {
    tabKeys[tab] = key;
    root.innerHTML = `<div class="domain-head">${headHtml(tab)}</div><ul class="list"></ul>`;
    const list = root.querySelector('.list');
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = 'item';
      li.innerHTML = `
        <div class="icon">${spriteImg(e.item.icon)}</div>
        <div class="info"><div class="name"></div><div class="desc"></div><div class="meta"></div></div>
        <div class="side"><div class="count"></div><div class="cost"></div></div>`;
      if (e.kind === 'researched') within(li, '.meta').innerHTML = '<div class="meter"><i></i></div><span></span>';
      else if (e.kind === 'mystery') {
        // Locked research: a padlock, no name, and what it still needs instead of a progress bar.
        li.className = 'item mystery';
        within(li, '.icon').innerHTML = spriteImg('lock');
        within(li, '.name').textContent = '???';
        within(li, '.meta').innerHTML = '<span class="locked-by"></span>';
      } else li.addEventListener('click', () => choose(e));
      e.li = li;
      list.appendChild(li);
    }
    root._entries = entries;
  }
  updateTab(tab, root);
}

function setMeter(root, cls, value, text) {
  const bar = root.querySelector(`.${cls}`);
  if (!bar) return;
  bar.style.width = pct(clamp01(value));
  root.querySelector(`.${cls}-v`).textContent = text ?? pct(value);
}

// A parent is ready once it is established: half a full population, or half of what its home allows if smaller.
const parentReady = s => pop(s.parent) >= 0.5 * Math.min(1, habitat(SPECIES_BY_ID[s.parent]));
const opened = s => !s.research || has(s.research);

function updateTab(tab, root) {
  const note = (cls, text) => {
    const n = root.querySelector(`.${cls}`);
    if (n) n.textContent = text;
  };
  if (tab === 'sun') {
    setMeter(root, 'm-sun', sunBrightness(), `${pct(sunBrightness())} of today`);
    note('m-fusion', componentDone('sun') ? 'The sun is complete and rests in the background.' : '');
    note('m-taps', `${fmt(state.clicks)} taps on the sun`);
  }
  if (tab === 'comets') {
    const brought = Object.keys(COMET_ATOMS)
      .filter(a => state.matter[a])
      .map(a => `${a} ${state.matter[a]}`)
      .join(' · ');
    note('m-comets', `${fmt(state.comets)} comets caught${brought ? ` · atoms brought: ${brought}` : ''}`);
  }
  if (tab === 'moon') {
    note('m-moon-note', componentDone('moon') ? 'The moon is complete and rests in the background.' : '');
  }
  if (tab === 'atmosphere') {
    const frozen = [state.ch4Ice > 0 && 'methane', state.co2Ice > 0 && 'CO₂', !has('thawN2') && 'nitrogen'].filter(
      Boolean,
    );
    const cool = aerosolCooling();
    setMeter(root, 'm-aerosol', state.aerosols, cool > 0.05 ? `−${cool.toFixed(1)}°C` : 'clear');
    const levels = [
      !has('thawCO2') && `CO₂ ${fmt(state.co2)} ppm`,
      !has('thawCH4') && `methane ${state.ch4.toFixed(1)} ppm`,
    ].filter(Boolean);
    // Gases already researched show their own gauges below, so they are left out here.
    const air = [
      !has('thawN2') && `Air ${state.pressure.toFixed(2)} bar`,
      ...levels,
      `greenhouse +${rates.climate.greenhouse.toFixed(0)}°C`,
    ].filter(Boolean);
    note('m-air', air.join(' · ') + (frozen.length ? ` · still frozen: ${frozen.join(', ')}` : ''));
    note(
      'm-climate',
      `Heading toward ${fmtTemp(rates.climate.target - KELVIN)} · reflects ${pct(rates.climate.albedo)} of sunlight` +
        (state.strikes ? ` · ${fmt(state.strikes)} lightning strikes` : ''),
    );
  }
  if (tab === 'core') {
    note('m-core', '');
  }
  if (tab === 'land') {
    setMeter(root, 'm-volc', state.volcanoActivity);
    const b = Terrain.biomes();
    note(
      'm-land',
      `Land ${pct(state.land)} of the planet · mountains ${pct(state.mountains)}` +
        (b.green + b.desert > 0 ? ` · desert ${pct(b.desert)} of land` : '') +
        (state.eruptions ? ` · ${fmt(state.eruptions)} eruptions` : ''),
    );
  }
  if (tab === 'ocean') {
    setMeter(root, 'm-open', openOcean() / 0.3, pct(openOcean()));
    note('m-ice', `Ice covers ${pct(iceCover())} of the planet`);
    setMeter(root, 'm-soup', state.soup / SOUP_FULL);
    const minerals = root.querySelector('.m-minerals');
    if (minerals)
      minerals.textContent = `Minerals: ${fmt(state.minerals)}, lightning makes x${soupMult().toFixed(2)} soup`;
  }
  for (const e of root._entries || []) {
    const { item, li } = e,
      q = s => li.querySelector(s);
    if (e.kind === 'mystery') {
      q('.locked-by').textContent = lockedBy(item);
      continue;
    }
    if (e.kind === 'researched') {
      const [level, text] = item.gauge ? item.gauge() : [1, ''];
      li.className = `item researched${item.ultra ? ' ultra' : ''}${item.disaster ? ' disaster' : ''}`;
      q('.name').textContent = item.name;
      q('.meta i').style.width = pct(clamp01(level));
      q('.meta span').textContent = text;
      q('.cost').textContent = '';
    } else if (e.kind === 'research') {
      li.className =
        'item' +
        ((item.puzzle ? puzzleReady(item) : canResearch(item)) ? ' affordable' : '') +
        (item.ultra ? ' ultra' : '') +
        (item.disaster ? ' disaster' : '');
      const running = state.researching?.id === item.id ? state.researching : null,
        active = !!running,
        days = item.days || 1;
      q('.name').textContent = `${active ? 'Researching' : 'Research'} ${item.name}`;
      if (running) {
        q('.meta').innerHTML = `<div class="meter"><i style="width:${pct(running.done)}"></i></div>`;
        q('.cost').textContent = pct(running.done);
      } else {
        // What it needs: met conditions get a tick, unmet ones show where the planet is now.
        q('.meta').textContent = (item.needs || [])
          .map(n => {
            const k = NEEDS[n[0]];
            if (needMet(n)) return `✓ ${k.label(n[1])}`;
            if (k.progress) return `${k.label(n[1])} (now ${k.progress(n[1])})`;
            return k.now ? `${k.label(n[1])} (now ${k.show(k.now())})` : k.label(n[1]);
          })
          .join(' · ');
        q('.cost').textContent = item.puzzle ? '' : `${days} ${days === 1 ? 'day' : 'days'}`;
      }
    }
  }
}

/* ================= Researching and evolving ================= */

function choose(e) {
  const { item } = e;
  if (e.kind === 'researched') return;
  if (e.kind === 'research') {
    if (item.puzzle) {
      if (puzzleReady(item)) openPuzzle(item);
      return;
    }
    if (!canResearch(item)) return;
    state.researching = { id: item.id, done: 0 };
  } else {
    // One species evolves at a time, like research: it takes its days.
    if (state.evolving || speciesStatus(item) !== 'available') return;
    state.evolving = { id: item.id, done: 0 };
  }
  buzz(10);
  recalc();
  renderCategory();
}

/* ================= Colors ================= */

// The world starts in black and white shapes. Starlight brings the shades of grey, and each color researched in
// Space › Physics › Spectrum fades into the scene, the book and its icons (Hues, in sprites.js).
// The six colors of the Spectrum collection (data/collections.yaml), found by tapping where nature shows them.
const COLOR_NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'violet'];
const colorFound = name => found('colors').includes(name);
// Where each color shows on the planet: what a tap must hit, and whether that is there now. Old worlds get the
// colors their planet already shows (grantSeenColors).
const COLOR_SOURCES = {
  yellow: () => state.ignition >= 1 || seen('sunlit'), // tap the burning sun
  red: () => has('lava'), // tap a glowing volcano
  orange: () => state.comets > 0, // catch a comet as it burns up
  blue: () => state.pressure >= 0.5, // tap the sky when the air is thick enough to scatter blue
  green: () => evolved('cyano'), // tap the sea where green life lives
  violet: () => state.strikes > 0, // tap a lightning storm
};
// A tap where a color shows finds it, once there is light to see by (Visible light).
function findColor(name, x, y) {
  if (!has('starlight') || colorFound(name) || !COLOR_SOURCES[name]()) return false;
  return collect('colors', x, y, name);
}
const COLOR_FADE_S = 3;
const UI_COLORS = ['--panel', '--panel-2', '--line', '--text', '--muted', '--accent', '--good', '--bad'];
const uiBase = Object.fromEntries(
  UI_COLORS.map(v => [v, getComputedStyle(document.documentElement).getPropertyValue(v).trim()]),
);
/** @type {Record<string, number> | null} */
let colorsShown = null;
/** @type {string | null} */
let paintedKey = null;

function updateColors(dt) {
  const target = Object.fromEntries(COLOR_NAMES.map(name => [name, colorFound(name) ? 1 : 0]));
  colorsShown ??= { ...target };
  for (const name in target) {
    const gap = target[name] - colorsShown[name];
    colorsShown[name] =
      Math.abs(gap) <= dt / COLOR_FADE_S ? target[name] : colorsShown[name] + (Math.sign(gap) * dt) / COLOR_FADE_S;
  }
  Hues.set(colorsShown, target, !has('starlight'));
  document.body.classList.toggle('colors-unseen', !Hues.full());
  if (Hues.key() !== paintedKey) {
    paintedKey = Hues.key();
    paintPage();
  }
}

// Repaint everything outside the scene in the colors found.
function paintPage() {
  UI_COLORS.forEach(v => uiBase[v] && document.documentElement.style.setProperty(v, Hues.css(uiBase[v])));
  $('#book-btn .sprite').src = Sprites.icon('book');
  buildTabs();
  document.querySelectorAll('.group-title').forEach(h => {
    const t = /** @type {HTMLElement} */ (h);
    t.style.color = Hues.css(t.dataset.color);
  });
  if (bookOpen) {
    $('#book-title').style.color = Hues.css(SUBJECT_BY_ID[currentCat].text || SUBJECT_BY_ID[currentCat].color);
    renderCategory(true);
  }
  updateDots();
}

// Worlds from before colors had to be found get Starlight and every color their planet already shows.
// Worlds where the first cell already lives get First Cell.
function grantFirstCell() {
  if (state.species.cell !== undefined) owned.add('firstcell');
}

function grantSeenColors() {
  if (!state.grantColors) return;
  delete state.grantColors;
  if (!state.banged) return;
  owned.add('starlight');
  const colors = new Set(found('colors'));
  for (const name of COLOR_NAMES) if (COLOR_SOURCES[name]()) colors.add(name);
  state.found.colors = [...colors];
}

/* ================= The science book ================= */

let currentCat = 'physics'; // the book first opens at Visible light
let bookOpen = false;

const visibleSections = cat => SUBJECT_BY_ID[cat].sections.filter(sec => SECTIONS[sec].unlocked());

// Build one page per subject, with a titled block per section, and the subject tabs down the right edge.
// Collections are posters: cream paper, or black for the night sky.
const NIGHT_POSTERS = new Set(['phases', 'signs', 'planets', 'meteorites', 'cometcards', 'glow', 'lights']);
const posterClass = sec => `poster${NIGHT_POSTERS.has(sec) ? ' night' : ''}`;

function buildPanels() {
  const world = $('#world');
  for (const c of SUBJECTS) {
    const div = document.createElement('div');
    div.id = `cat-${c.id}`;
    div.className = 'tab';
    const posters = c.id === 'collections';
    const sections = list =>
      list
        .map(sec =>
          posters
            ? `
      <section class="section poster-slide" data-section="${sec}"><div class="${posterClass(sec)}">
        <h3 class="section-title">${SECTIONS[sec].name}</h3>
        <div id="${sec}"></div>
      </div></section>`
            : `
      <section class="section" data-section="${sec}">
        <h3 class="section-title">${SECTIONS[sec].name}</h3>
        ${sec === 'world' ? '' : `<div id="${sec}"></div>`}
      </section>`,
        )
        .join('');
    div.innerHTML = `${
      c.groups
        ? c.groups
            .map(
              g => `
      <div class="group"><h2 class="group-title" data-color="${c.color}" style="color:${Hues.css(c.color)}">${g.name}</h2>${sections(g.sections)}</div>`,
            )
            .join('')
        : posters
          ? `<div class="poster-track">${sections(c.sections)}</div>`
          : sections(c.sections)
    }
      <p class="blank-page">Empty pages.</p>`;
    // The posters lie over the book; a tap beside the poster (or the close button) puts them away.
    if (posters)
      div.addEventListener('click', e => {
        const t = /** @type {HTMLElement} */ (e.target);
        if (t.classList.contains('poster-slide')) openCategory(lastCat);
      });
    if (c.sections.includes('world')) within(div, '[data-section="world"]').appendChild(world);
    // The posters hang on the book itself, not inside the scrolling page (iOS clips fixed layers inside a
    // scroller), so they cover the whole book.
    (posters ? $('#book') : $('#panel')).appendChild(div);
  }
  $('#book-btn').insertAdjacentHTML('afterbegin', spriteImg('book'));
  buildTabs();
}

// The subject tabs, in the colors found so far.
function buildTabs() {
  $('#book-tabs').innerHTML = SUBJECTS.filter(c => !c.hidden)
    .map(
      c => `<button class="book-tab${bookOpen && c.id === currentCat ? ' active' : ''}" data-cat="${c.id}" style="--tab:${Hues.css(c.color)}" aria-label="${c.name}" title="${c.name}">
    ${spriteImg('subject' + c.name)}<i class="dot hidden"></i><i class="ready-badge hidden"></i></button>`,
    )
    .join('');
  $('#book-tabs')
    .querySelectorAll('.book-tab')
    .forEach(t => t.addEventListener('click', () => openCategory(t.dataset.cat)));
}

// How much a subject holds. When it grows past what the player has seen, its tab and the book get a dot.
function subjectSize(cat) {
  return visibleSections(cat).reduce(
    (n, sec) =>
      n +
      (sec === 'elements'
        ? state.atoms.length
        : sec === 'laws'
          ? state.laws.length
          : COLLECTION_BY_SECTION[sec]
            ? (state.found[COLLECTION_BY_SECTION[sec].id] || []).length
            : sec === 'signs'
              ? state.signs.length
              : sec === 'planets'
                ? state.planets.length
                : sec === 'index' || sec === 'life'
                  ? SPECIES.filter(known).length
                  : sec === 'world'
                    ? 0
                    : sec === 'stories'
                      ? STORIES.filter(storyOpen).length + STORIES.reduce((n, st) => n + storyDone(st).length, 0)
                      : sec === 'disasters'
                        ? Object.keys(state.disasters).length
                        : sec === 'ultras'
                          ? ULTRAS.filter(u => has(u.id)).length
                          : tabEntries(sec).length),
    0,
  );
}

// A subject has something to do: research whose conditions hold now (even while other research runs), or an
// ultra whose puzzle can be played. Its tab gets a green badge.
const researchable = u => !u.auto && !has(u.id) && researchVisible(u) && (u.needs || []).every(needMet);
const subjectReady = cat => {
  const secs = visibleSections(cat);
  return RESEARCH.some(u => secs.includes(u.tab) && researchable(u));
};

function updateDots() {
  let any = false;
  for (const c of SUBJECTS.filter(s => !s.hidden)) {
    const size = subjectSize(c.id);
    if (bookOpen && c.id === currentCat) state.bookSeen[c.id] = size;
    const fresh = size > (state.bookSeen[c.id] || 0);
    any ||= fresh;
    $(`.book-tab[data-cat="${c.id}"] .dot`).classList.toggle('hidden', !fresh);
    $(`.book-tab[data-cat="${c.id}"] .ready-badge`).classList.toggle('hidden', !subjectReady(c.id));
    // A subject with nothing open yet is a blank tab with a question mark, until its first section opens.
    const blank = visibleSections(c.id).length === 0,
      tab = $(`.book-tab[data-cat="${c.id}"]`);
    tab.classList.toggle('unknown', blank);
    tab.disabled = blank;
  }
  $('#book-btn .dot').classList.toggle('hidden', !any);
}

// The light update skips the world stats and the tree of life, which have their own slower timers.
function renderCategory(force = false, light = false) {
  if (!bookOpen) return;
  const root = $(`#cat-${currentCat}`),
    visible = visibleSections(currentCat);
  root.querySelectorAll('.section').forEach(n => n.classList.toggle('hidden', !visible.includes(n.dataset.section)));
  root.querySelectorAll('.group').forEach(g => g.classList.toggle('hidden', !g.querySelector('.section:not(.hidden)')));
  root.querySelector('.blank-page').classList.toggle('hidden', visible.length > 0);
  for (const sec of visible) {
    if (sec === 'world' || sec === 'life') {
      if (light) continue;
      if (sec === 'world') renderWorld();
      else renderLife();
    } else if (sec === 'elements') renderElements(force);
    else if (sec === 'laws') renderLaws(force);
    else if (sec === 'stories') renderStories(force);
    else if (COLLECTION_BY_SECTION[sec]) renderCollection(COLLECTION_BY_SECTION[sec], force);
    else if (sec === 'ultras') renderUltras(force);
    else if (sec === 'signs') renderSigns(force);
    else if (sec === 'disasters') renderDisasters(force);
    else if (sec === 'planets') renderPlanets(force);
    else if (sec === 'index') renderIndex(force);
    else renderTab(sec, force);
  }
  // A poster lays its pictures 2, 3 or 4 across, by how many there are, so they spread evenly over the page.
  if (currentCat === 'collections')
    for (const grid of root.querySelectorAll('.law-grid')) {
      // Set on the section's box, which outlives the grid when the section draws itself again.
      const n = grid.children.length;
      /** @type {HTMLElement} */ (grid.parentElement).style.setProperty('--cols', String(n <= 4 ? 2 : n <= 9 ? 3 : 4));
    }
}

let lastCat = 'physics'; // the page under the posters, to go back to
function openCategory(cat) {
  if (cat !== 'collections') lastCat = cat;
  else if (currentCat !== 'collections') {
    // The posters lie over the page that was open: keep it showing underneath.
    $(`#cat-${currentCat}`)?.classList.add('under');
  }
  document.querySelectorAll('#panel > .tab.under').forEach(n => cat !== 'collections' && n.classList.remove('under'));
  currentCat = cat;
  document
    .querySelectorAll('#panel > .tab, #book > .tab')
    .forEach(n => n.classList.toggle('active', n.id === `cat-${cat}`));
  document
    .querySelectorAll('.book-tab')
    .forEach(n => n.classList.toggle('active', /** @type {HTMLElement} */ (n).dataset.cat === cat));
  $('#book-title').textContent = SUBJECT_BY_ID[cat].name;
  $('#book-title').style.color = Hues.css(SUBJECT_BY_ID[cat].text || SUBJECT_BY_ID[cat].color);
  if (cat !== 'collections') $('#panel').scrollTop = 0;
  renderCategory(true);
  updateDots();
}

// The book covers the whole screen, so taps meant for the book never reach the planet.
// The back button or gesture closes it.
function openBook(cat = currentCat) {
  if (!bookOpen) history.pushState({ book: true }, '');
  bookOpen = true;
  $('#book').classList.remove('hidden');
  $('#book-btn').classList.add('hidden');
  openCategory(cat);
}

function hideBook() {
  bookOpen = false;
  $('#book').classList.add('hidden');
  $('#book-btn').classList.remove('hidden');
}

function closeBook() {
  if (history.state?.book) history.back();
  else hideBook();
}

// Open the book at the page that holds a section and bring the section into view.
function openTab(section) {
  openBook(subjectOf(section).id);
  if (visibleSections(currentCat).length > 1)
    $(`[data-section="${section}"]`).scrollIntoView({ block: 'start', inline: 'center' });
}

$('#book-btn').addEventListener('click', () => openBook());
$('#book-close').addEventListener('click', closeBook);
$('#puzzle-close').addEventListener('click', closePuzzle);
$('#splash-close').addEventListener('click', hideSplash);
$('#research-bar').addEventListener('click', () => {
  const u = RESEARCH_BY_ID[$('#research-bar').dataset.id];
  if (u) openTab(u.tab);
});
// Back (and Escape) closes the top layer: an open puzzle first, then the book.
window.addEventListener('popstate', () => (puzzleOpen ? hidePuzzle() : hideBook()));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (puzzleOpen) closePuzzle();
  else if (bookOpen) closeBook();
});

$('#book-game').addEventListener('click', () => openCategory('game'));

/* ================= Astronomy: star signs and planets ================= */

// The zodiac game: one star sign shows each night. The more signs found, the rarer a new one gets:
// the first shows on most nights, the last on about one night in three. Star Signs (research) starts them. Ophiuchus, the hidden 13th, waits until
// all 12 are found and is rarer still. Other nights show a sign already found, or none before the first.
const SIGN_FIRST = 0.8,
  SIGN_LAST = 0.3,
  SIGN_HIDDEN = 0.002;

// A number in [0, 1) fixed for this world, night and purpose, so a reload shows the same sky.
function nightRandom(night, salt) {
  let h = (state.seed ^ Math.imul(night, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

// A night runs from 18:00 to 06:00 and is numbered by the day it ends on. Tonight's sign is picked once.
// The Milky Way opens the zodiac (worlds that researched the old Star Signs keep it). With all twelve signs
// found the seasons can be foretold, and hurricanes hit half as hard.
const zodiacOpen = () => has('starsigns');
// The planets wander among the stars from the start; the first one tapped opens their collection.
const planetsOpen = () => true;
const zodiacComplete = () => Sky.SIGNS.filter(s => !s.hidden).every(s => state.signs.includes(s.id));

function updateTonight() {
  if (!state.spinLocked) return;
  const night = Math.floor((state.clock + 6) / 24);
  if (state.tonight?.night === night && (state.tonight.sign || !zodiacOpen())) return;
  // No signs before the Milky Way; the first night after it, one shows.
  if (!zodiacOpen()) return void (state.tonight = { night, sign: null, planet: tonightPlanet(night) });
  const main = Sky.SIGNS.filter(s => !s.hidden),
    left = main.filter(s => !state.signs.includes(s.id));
  const pool = left.length ? left : Sky.SIGNS.filter(s => s.hidden && !state.signs.includes(s.id));
  const found = main.length - left.length;
  const chance = !found
    ? 1
    : left.length
      ? SIGN_FIRST * (SIGN_LAST / SIGN_FIRST) ** (found / (main.length - 1))
      : SIGN_HIDDEN;
  const known = Sky.SIGNS.filter(s => state.signs.includes(s.id));
  let sign = null;
  if (pool.length && nightRandom(night, 1) < chance) sign = pool[Math.floor(nightRandom(night, 2) * pool.length)].id;
  else if (known.length) sign = known[Math.floor(nightRandom(night, 3) * known.length)].id;
  state.tonight = { night, sign, planet: tonightPlanet(night) };
}

// Planets work like the star signs: at most one a night, each by its own chance (`find` in sky.yaml), so the
// bright ones come often and the far ones rarely. Tried in a random order each night.
function tonightPlanet(night) {
  const order = Sky.PLANETS.map((p, k) => [nightRandom(night, 20 + k), p])
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p);
  return order.find((p, k) => nightRandom(night, 40 + k) < (p.find ?? 0.3))?.id || null;
}

// Tapping a star of a sign, or a planet, in the night sky finds it. Tapping a found one names it.
Scene.onSkyTap((kind, id, x, y) => {
  const list = kind === 'sign' ? state.signs : state.planets;
  const item = (kind === 'sign' ? Sky.SIGNS : Sky.PLANETS).find(o => o.id === id);
  if (list.includes(id)) {
    floatText(x, y - 12, item.name, 'critter good');
    return;
  }
  list.push(id);
  Scene.setSky(state.signs, state.planets);
  floatText(x, y - 12, item.name, 'critter good');
  markNew(`${kind}:${id}`);
});

// A small picture of a star sign: its stars and dotted lines, for the book.
const signPictures = {};
function signPicture(s) {
  if (signPictures[s.id]) return signPictures[s.id];
  const c = document.createElement('canvas');
  c.width = Sky.SIGN_W + 3;
  c.height = Sky.SIGN_H + 3;
  const g = context2d(c);
  g.fillStyle = '#6a8aff';
  for (const [a, b] of s.lines) {
    const [x0, y0] = s.stars[a],
      [x1, y1] = s.stars[b],
      n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 1; k < n; k += 2)
      g.fillRect(1 + Math.round(x0 + ((x1 - x0) * k) / n), 1 + Math.round(y0 + ((y1 - y0) * k) / n), 1, 1);
  }
  g.fillStyle = '#fff8d0';
  for (const [x, y] of s.stars) {
    g.fillRect(x, y + 1, 3, 1);
    g.fillRect(x + 1, y, 1, 3);
  }
  return (signPictures[s.id] = c.toDataURL());
}

// A card per sign; the hidden 13th only shows once found.
function renderSigns(force) {
  const root = $('#signs'),
    key = state.signs.join() + state.unseen.join();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const signs = Sky.SIGNS.filter(s => !s.hidden || state.signs.includes(s.id));
  const main = Sky.SIGNS.filter(s => !s.hidden);
  root.innerHTML = `<p class="note">${state.signs.filter(id => main.some(s => s.id === id)).length} of ${main.length} star signs found</p>
    <div class="law-grid">${signs
      .map(s =>
        state.signs.includes(s.id)
          ? `<button class="law-card sign-card${newClass(`sign:${s.id}`)}" data-id="${s.id}"><img src="${signPicture(s)}" alt=""><span>${s.name}</span></button>`
          : '<div class="law-card unknown"><b>?</b><span></span></div>',
      )
      .join('')}</div>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b =>
    b.addEventListener('click', () => {
      seenNow(`sign:${b.dataset.id}`);
      renderSigns(true);
    }),
  );
}

// The Ultras deck: each story's ultra, once gained, is a sparkling card with its icon; the rest are blanks.
// Tap a card to read it. The full deck is the planned key to what comes after.
const ULTRAS = RESEARCH.filter(u => u.ultra && !u.hidden);
function renderUltras(force) {
  const root = $('#ultras'),
    picked = root.dataset.picked || '',
    key = ULTRAS.map(u => +has(u.id)).join('') + picked + Hues.key() + state.unseen.join();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const got = ULTRAS.filter(u => has(u.id)),
    p = RESEARCH_BY_ID[picked];
  root.innerHTML = `<p class="note">${got.length} of ${ULTRAS.length} cards</p>
    <div class="law-grid">${ULTRAS.map(u =>
      has(u.id)
        ? `<button class="law-card ultra-card${u.id === picked ? ' picked' : ''}${newClass(`ultra:${u.id}`)}" data-id="${u.id}"><img src="${Sprites.icon(u.icon)}" alt=""><span>${u.name}</span></button>`
        : '<button class="law-card unknown" disabled><b>?</b><span></span></button>',
    ).join('')}</div>
    <p class="atom-info">${p ? `<b>${p.name}</b><br>${p.card}` : 'Tap one.'}</p>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b =>
    b.addEventListener('click', () => {
      root.dataset.picked = b.dataset.id;
      seenNow(`ultra:${b.dataset.id}`);
      renderUltras();
    }),
  );
}

// Natural disasters are a collection: each is found the first time it strikes. A card per disaster, blanks for
// the rest; tap one to read what it does and how often it has struck. The full set makes them all rarer.
function renderDisasters(force) {
  const root = $('#disasters'),
    picked = root.dataset.picked || '',
    key = JSON.stringify(state.disasters) + picked + state.unseen.join();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const all = DATA.disasters,
    struck = all.filter(d => state.disasters[d.id]),
    p = DISASTERS[picked];
  root.innerHTML = `<p class="note">${struck.length} of ${all.length} found</p>
    <div class="law-grid">${all
      .map(d =>
        state.disasters[d.id]
          ? `<button class="law-card disaster-card${d.id === picked ? ' picked' : ''}${newClass(`disaster:${d.id}`)}" data-id="${d.id}"><b>×${state.disasters[d.id]}</b><span>${d.name}</span></button>`
          : '<button class="law-card unknown" disabled><b>?</b><span></span></button>',
      )
      .join('')}</div>
    <p class="atom-info">${p ? `<b>${p.name}</b> · ${state.disasters[picked]} ${state.disasters[picked] === 1 ? 'time' : 'times'}<br>${p.how}` : 'Tap one.'}</p>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b =>
    b.addEventListener('click', () => {
      root.dataset.picked = b.dataset.id;
      seenNow(`disaster:${b.dataset.id}`);
      renderDisasters();
    }),
  );
}

function renderPlanets(force) {
  const root = $('#planets'),
    key = state.planets.join() + Hues.key() + state.unseen.join();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  root.innerHTML = `<p class="note">${state.planets.length} of ${Sky.PLANETS.length} planets found</p>
    <div class="law-grid">${Sky.PLANETS.map(p =>
      state.planets.includes(p.id)
        ? `<button class="law-card${newClass(`planet:${p.id}`)}" data-id="${p.id}"><i class="planet-dot" style="background:${Hues.css(p.color)}"></i><span>${p.name}</span></button>`
        : '<div class="law-card unknown"><b>?</b><span></span></div>',
    ).join('')}</div>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b =>
    b.addEventListener('click', () => {
      seenNow(`planet:${b.dataset.id}`);
      renderPlanets(true);
    }),
  );
}

/* ================= Chemistry: the periodic table ================= */

/** @type {string | null} */
let pickedAtom = null;

// Things found together announce themselves one after another.
let nextFoundAt = 0;

function announce(text, x = innerWidth / 2, y = innerHeight * 0.62, cls = 'atom') {
  const now = performance.now(),
    at = Math.max(now, nextFoundAt);
  nextFoundAt = at + 700;
  setTimeout(() => floatText(x, y, text, cls), at - now);
}

function discover(sym, x, y) {
  if (state.atoms.includes(sym)) return;
  state.atoms.push(sym);
  markNew(`atom:${sym}`);
}

function findAtoms() {
  for (const [sym, a] of Object.entries(ATOMS)) if (a.found?.()) discover(sym);
  for (const [id, law] of Object.entries(LAWS)) {
    if (state.laws.includes(id) || !law.found()) continue;
    state.laws.push(id);
    markNew(`law:${id}`);
  }
}

/* ================= Physics: laws of nature ================= */

let pickedLaw = null;

// A card per law; laws not found yet are question marks.
function renderLaws(force) {
  const root = $('#laws'),
    key = state.laws.join() + pickedLaw + state.unseen.join();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const ids = Object.keys(LAWS);
  root.innerHTML = `<p class="note">${state.laws.length} of ${ids.length} laws found</p>
    <div class="law-grid">${ids
      .map(id =>
        state.laws.includes(id)
          ? `<button class="law-card${id === pickedLaw ? ' picked' : ''}${newClass(`law:${id}`)}" data-id="${id}"><b>${LAWS[id].sign}</b><span>${LAWS[id].name}</span></button>`
          : '<button class="law-card unknown" disabled><b>?</b><span></span></button>',
      )
      .join('')}</div>
    <p class="atom-info">${pickedLaw ? `<b>${LAWS[pickedLaw].name}</b><br>${LAWS[pickedLaw].how}` : 'Tap a law.'}</p>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b =>
    b.addEventListener('click', () => {
      pickedLaw = b.dataset.id;
      seenNow(`law:${pickedLaw}`);
      renderLaws();
    }),
  );
}

// Found atoms show their symbol; the rest show only their atomic number, waiting to be found.
function renderElements(force) {
  const root = $('#elements'),
    key = state.atoms.join() + pickedAtom + (state.matter[pickedAtom] || 0) + state.unseen.join();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const cells = ELEMENT_SYMBOLS.map((sym, k) => {
    const [row, col] = elementCell(k + 1),
      found = state.atoms.includes(sym);
    return `<button class="atom${found ? ' found' : ''}${sym === pickedAtom ? ' picked' : ''}${newClass(`atom:${sym}`)}" style="grid-area:${row}/${col}"
      ${found ? `data-sym="${sym}"` : 'disabled'}>${found ? sym : k + 1}</button>`;
  }).join('');
  const a = pickedAtom ? ATOMS[pickedAtom] : null;
  root.innerHTML = `<p class="note">${state.atoms.length} of ${ELEMENT_SYMBOLS.length} atoms found</p>
    <div class="ptable">${cells}</div>
    <p class="atom-info">${a ? `<b>${pickedAtom}</b> ${a.name} · ${ELEMENT_SYMBOLS.indexOf(pickedAtom ?? '') + 1}<br>${a.how}${state.matter[pickedAtom] ? `<br>Brought by comets: ${state.matter[pickedAtom]}` : ''}` : 'Tap an atom.'}</p>`;
  root.querySelectorAll('.atom.found').forEach(b =>
    b.addEventListener('click', () => {
      pickedAtom = b.dataset.sym;
      seenNow(`atom:${pickedAtom}`);
      renderElements();
    }),
  );
}

/* ================= Biology: the species index ================= */

/** @type {string | null} */
let pickedSpecies = null;
const known = s => evolved(s.id) || isExtinct(s.id);

function renderIndex(force) {
  const root = $('#index'),
    found = SPECIES.filter(known);
  const key = found.map(s => s.id + isExtinct(s.id)).join() + pickedSpecies;
  if (force || root.dataset.key !== key) {
    root.dataset.key = key;
    root.innerHTML = `<p class="note">${found.length} species found · <span class="dna"></span></p>
      <div class="species-grid">${found
        .map(
          s => `
        <button class="species-card${isExtinct(s.id) ? ' extinct' : ''}${s.id === pickedSpecies ? ' picked' : ''}" data-id="${s.id}">
          ${spriteImg(s.icon)}<span>${s.name}</span>
        </button>`,
        )
        .join('')}</div>
      <div class="species-info"></div>`;
    root.querySelectorAll('.species-card').forEach(b =>
      b.addEventListener('click', () => {
        pickedSpecies = b.dataset.id;
        renderIndex();
      }),
    );
  }
  const c = tempC(),
    window = `life window ${LIFE_WINDOW[0]} to ${LIFE_WINDOW[1]}°C`;
  root.querySelector('.dna').textContent =
    `${c < LIFE_WINDOW[0] ? `too cold, ${window}` : c > LIFE_WINDOW[1] ? `too hot, ${window}` : window}`;
  const s = pickedSpecies ? SPECIES_BY_ID[pickedSpecies] : null,
    info = root.querySelector('.species-info');
  if (!s) {
    info.innerHTML = '<p class="note">Tap a species.</p>';
    return;
  }
  const rows = [
    ['Status', isExtinct(s.id) ? 'Extinct' : lifeState(s)],
    ...(isExtinct(s.id) ? [] : [['Population', pct(pop(s.id))]]),
    ['Lives at', `${s.temp[0]} to ${s.temp[1]}°C`],
    ['Home', (s.home || ['sea']).join(', ')],
    ...(s.parent ? [['Evolved from', SPECIES_BY_ID[s.parent].name]] : []),
    ...(s.o2 ? [['Makes', 'oxygen']] : []),
  ];
  info.innerHTML = `<div class="species-head">${spriteImg(s.icon)}<div><b>${s.name}</b><p>${s.desc}</p></div></div>
    <dl class="stats">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

/* ================= Life tab: the tree of life ================= */

const STATUS_TEXT = {
  alive: 'Alive',
  extinct: 'Extinct',
  evolving: 'Evolving',
  available: 'Evolve',
  waiting: 'Later',
  blocked: 'Blocked',
};

// Why a species cannot evolve yet, in a few words.
function waitReason(s) {
  if (!evolved(s.parent)) return `after ${SPECIES_BY_ID[s.parent].name}`;
  if (!seen(DOMAIN_OPENS[s.domain]) || !opened(s)) return '???';
  if (!parentReady(s)) return `more ${SPECIES_BY_ID[s.parent].name}`;
  return '???';
}

function lifeNode(s) {
  const status = speciesStatus(s),
    p = pop(s.id);
  // Only species next to the known tree show their name; deeper ones stay a mystery.
  const known = status !== 'waiting' || evolved(s.parent) || isExtinct(s.parent);
  const blockedBy = status === 'blocked' ? [...ancestors(s)].find(a => isExtinct(a.id)) : null;
  let detail = '';
  if (status === 'alive') {
    const dying = fitness(s, tempC()) < 0 || p > habitat(s) + 0.01;
    detail = `<span class="bar"><i style="width:${pct(p)}"></i></span>${dying ? '<em class="warn">dying</em>' : pct(p)}`;
  } else if (status === 'evolving') {
    const done = state.evolving?.done ?? 0;
    detail = `<span class="bar"><i style="width:${pct(done)}"></i></span>${pct(done)}`;
  } else if (status === 'available') detail = state.evolving ? 'after the one evolving' : `${s.days || 1} days`;
  else if (status === 'waiting') detail = known ? waitReason(s) : '';
  else if (status === 'blocked') {
    const below = countDescendants(s);
    detail = `no ${blockedBy.name}${below ? ` · +${below}` : ''}`;
  } else if (status === 'extinct') detail = `${s.temp[0]}–${s.temp[1]}°C`;
  const affordable = status === 'available' && !state.evolving ? ' affordable' : '';
  // A blocked branch collapses into its first species; everything below it is blocked too.
  const kids = status === 'blocked' ? [] : CHILDREN[s.id] || [];
  return `<li>
    <div class="node ${status}${affordable}" data-id="${s.id}"${status === 'available' ? ' role="button" tabindex="0"' : ''}>
      <span class="node-icon">${known ? spriteImg(s.icon) : '<span class="q">?</span>'}</span>
      <span class="node-name">${known ? s.name : '???'}</span>
      <span class="node-detail">${detail}</span>
      <span class="node-status">${STATUS_TEXT[status]}</span>
    </div>
    ${kids.length ? `<ul>${kids.map(lifeNode).join('')}</ul>` : ''}
  </li>`;
}

function countDescendants(s) {
  return (CHILDREN[s.id] || []).reduce((n, k) => n + 1 + countDescendants(k), 0);
}

function* ancestors(s) {
  for (let a = SPECIES_BY_ID[s.parent]; a; a = SPECIES_BY_ID[a.parent]) yield a;
}

// The tree redraws twice a second, but never while a finger is down on it, so a tap on Evolve is never lost
// to a redraw. One listener on the tree handles every node.
let lifePressed = false;
/** @param {Event} e */
const targetEl = e => /** @type {HTMLElement} */ (e.target);
document.addEventListener('pointerdown', e => (lifePressed = !!targetEl(e).closest?.('#life')));
addEventListener('pointerup', () => (lifePressed = false));
addEventListener('pointercancel', () => (lifePressed = false));
document.addEventListener('click', e => {
  const n = /** @type {HTMLElement} */ (targetEl(e).closest?.('#life .node.available'));
  if (!n) return;
  choose({ kind: 'species', item: SPECIES_BY_ID[n.dataset.id ?? ''] });
  renderLife(true);
});

document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && targetEl(e).closest?.('#life .node.available')) {
    e.preventDefault();
    targetEl(e).click();
  }
});

function renderLife(force = false) {
  if (lifePressed && !force) return;
  const root = $('#life'),
    t = treeSummary();
  const scroll = $('#panel').scrollTop;
  root.innerHTML = `
    <p class="note">${state.evolving ? `Evolving: ${SPECIES_BY_ID[state.evolving.id].name}, ${pct(state.evolving.done)}` : 'Nothing evolving now'}</p>
    <div class="tree-summary">
      <span class="alive">${t.alive} alive</span>
      <span class="available">${t.available} ready</span>
      <span class="waiting">${t.waiting} later</span>
      <span class="blocked">${t.blocked} blocked</span>
      <span class="extinct">${t.extinct} extinct</span>
    </div>
    <ul class="tree">${lifeNode(SPECIES[0])}</ul>`;
  $('#panel').scrollTop = scroll;
}

/* ================= World tab ================= */

function renderWorld() {
  $('#stats').innerHTML = `<dt>Time played</dt><dd>${fmtTime((Date.now() - state.start) / 1000)}</dd>`;
}
