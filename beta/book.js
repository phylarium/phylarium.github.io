'use strict';

// The page around the scene: DOM helpers, the colors found, and three books, each with its own button: the
// science book (the research tabs, species, the tree of life, the world), the poster book (story posters in
// layers, and every collection as a poster) and the computer (the Climate page).

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

// Research is done on the posters (data/posters.yaml, POSTER_BY_ID in game.js): a research whose tab is a poster
// is a layer there, tapped to research, instead of a card in a tab's list. The few that stay in the science book
// (the comets; the gases that thaw by themselves) fill in on a
// poster that shows them once known.
const onPoster = u => !!POSTER_BY_ID[u.tab];
// The section a research shows in: its tab, a poster or a page of the science book.
const sectionOf = u => u.tab;

function tabEntries(tab) {
  const entries = [];
  const listed = RESEARCH.filter(u => !onPoster(u)); // poster research is not listed
  for (const u of listed) if (u.tab === tab && has(u.id)) entries.push({ kind: 'researched', item: u }); // every step stays
  for (const u of listed)
    if (u.tab === tab && !has(u.id) && !u.auto && researchVisible(u)) entries.push({ kind: 'research', item: u });
  // A gas not yet known shows as a blank: "?" and an empty gauge.
  for (const u of listed) if (u.tab === tab && u.auto && !has(u.id)) entries.push({ kind: 'mystery', item: u });
  // One blank card when more research waits in this section: there is always a next step. It is the nearest one:
  // research whose required research is done (only waiting for an event or atoms), then research one step away.
  // An ultra shows only once its disaster does, even when the disaster is in another section.
  const hidden = listed.filter(u => u.tab === tab && !u.auto && !u.hidden && !has(u.id) && !researchVisible(u));
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
  if (tab === 'comets') return '<p class="note m-comets"></p>';
  if (tab === 'atmosphere') {
    return `${state.eruptions ? meterHtml('Aerosols', 'm-aerosol') : ''}
      <p class="note m-air"></p><p class="note m-climate"></p>`;
  }
  // Land and sea (Climate tab): the land once the Magnetic Field holds, the sea once it has thawed.
  if (tab === 'surface') {
    return `${has('volcano') ? meterHtml('Volcanic activity', 'm-volc') : ''}
      ${has('magnet') ? '<p class="note m-land"></p>' : ''}
      ${seen('thaw') ? meterHtml('Open ocean', 'm-open') : ''}
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
  const key = `${state.happened.length}|${has('volcano')}|${has('magnet')}|${state.eruptions > 0}|${state.spinLocked}|${entries.map(e => e.kind + e.item.id).join()}`;
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

// A research node's name in the book, its title first when it has one: "Water H₂O".
const bookName = u => (u.title ? `${u.title} ${u.name}` : u.name);

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
  if (tab === 'comets') {
    note('m-comets', `${fmt(state.comets)} comets caught`);
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
  if (tab === 'surface') {
    setMeter(root, 'm-volc', state.volcanoActivity);
    const b = Terrain.biomes();
    note(
      'm-land',
      `Land ${pct(state.land)} of the planet · mountains ${pct(state.mountains)}` +
        (b.green + b.desert > 0 ? ` · desert ${pct(b.desert)} of land` : '') +
        (state.eruptions ? ` · ${fmt(state.eruptions)} eruptions` : ''),
    );
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
      q('.name').textContent = bookName(item);
      q('.meta i').style.width = pct(clamp01(level));
      q('.meta span').textContent = text;
      q('.cost').textContent = '';
    } else if (e.kind === 'research') {
      li.className =
        'item' +
        ((item.puzzle ? puzzleReady(item) : canResearch(item)) ? ' affordable' : '') +
        (item.ultra ? ' ultra' : '') +
        (item.disaster ? ' disaster' : '');
      const running = researchingNow(item.id),
        active = !!running,
        days = item.days || 1;
      q('.name').textContent = `${active ? 'Researching' : 'Research'} ${bookName(item)}`;
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
    state.researching.push({ id: item.id, done: 0 });
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
const UI_COLORS = [
  '--panel',
  '--panel-2',
  '--line',
  '--text',
  '--muted',
  '--accent',
  '--good',
  '--bad',
  '--paper',
  '--paper-line',
];
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
  $('#posters-btn .sprite').src = Sprites.icon('posterBook');
  $('#computer-btn .sprite').src = Sprites.icon('computer');
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

let currentCat = 'space'; // the book first opens at Space
let bookOpen = false;

const visibleSections = cat => SUBJECT_BY_ID[cat].sections.filter(sec => SECTIONS[sec].unlocked());

// Build one page per subject, with a titled block per section, and the subject tabs down the right edge.
// Posters are cream paper, or black for the night sky (`night: true` on a poster in posters.yaml, on a card
// collection in collections.yaml, and book.yaml's `night` list for the sky sections).
const NIGHT_POSTERS = new Set([
  ...POSTERS.filter(p => p.night).map(p => p.id),
  ...DATA.collections.filter(c => c.section && c.night).map(c => c.section),
  ...(DATA.book.night || []),
]);
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
        if (t.classList.contains('poster-slide')) closeBook();
      });
    if (c.sections.includes('world')) within(div, '[data-section="world"]').appendChild(world);
    // The posters hang on the book itself, not inside the scrolling page (iOS clips fixed layers inside a
    // scroller), so they cover the whole book.
    (posters ? $('#book') : $('#panel')).appendChild(div);
  }
  $('#book-btn').insertAdjacentHTML('afterbegin', spriteImg('book'));
  $('#posters-btn').insertAdjacentHTML('afterbegin', spriteImg('posterBook'));
  $('#computer-btn').insertAdjacentHTML('afterbegin', spriteImg('computer'));
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
  tabEls = {};
  $('#book-tabs')
    .querySelectorAll('.book-tab')
    .forEach(t => {
      t.addEventListener('click', () => openCategory(t.dataset.cat));
      tabEls[t.dataset.cat || ''] = {
        tab: /** @type {HTMLButtonElement} */ (t),
        dot: /** @type {Element} */ (t.querySelector('.dot')),
        badge: /** @type {Element} */ (t.querySelector('.ready-badge')),
      };
    });
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
                    : POSTER_BY_ID[sec]
                      ? POSTER_BY_ID[sec].slots.filter(sl => slotKnown(sl.id)).length
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
// ultra whose puzzle can be played. Its tab gets a green badge. The sections with such research are found once
// per update, for every subject.
const researchable = u => !u.auto && !has(u.id) && researchVisible(u) && (u.needs || []).every(needMet);
const readySections = () => new Set(RESEARCH.filter(researchable).map(sectionOf));
const subjectReady = (cat, ready = readySections()) => visibleSections(cat).some(sec => ready.has(sec));

// The tab buttons and their marks, looked up once per build (buildTabs).
/** @type {Record<string, { tab: HTMLButtonElement, dot: Element, badge: Element }>} */
let tabEls = {};
function updateDots() {
  let any = false;
  const ready = readySections();
  for (const c of SUBJECTS.filter(s => !s.hidden)) {
    const size = subjectSize(c.id);
    if (bookOpen && c.id === currentCat) state.bookSeen[c.id] = size;
    const fresh = size > (state.bookSeen[c.id] || 0);
    any ||= fresh;
    const { tab, dot, badge } = tabEls[c.id];
    dot.classList.toggle('hidden', !fresh);
    badge.classList.toggle('hidden', !subjectReady(c.id, ready));
    // A subject with nothing open yet is a blank tab with a question mark, until its first section opens.
    const blank = visibleSections(c.id).length === 0;
    tab.classList.toggle('unknown', blank);
    tab.disabled = blank;
  }
  $('#book-btn .dot').classList.toggle('hidden', !any);
  const posters = subjectSize('collections');
  if (bookOpen && currentCat === 'collections') state.bookSeen.collections = posters;
  $('#posters-btn .dot').classList.toggle('hidden', posters <= (state.bookSeen.collections || 0));
  $('#posters-btn .ready-badge').classList.toggle('hidden', !subjectReady('collections', ready));
  // Each button shows once there is something behind it.
  $('#posters-btn').classList.toggle('none', visibleSections('collections').length === 0);
  $('#computer-btn').classList.toggle('none', visibleSections('climate').length === 0);
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
    else if (POSTER_BY_ID[sec]) renderPoster(POSTER_BY_ID[sec], force);
    else if (COLLECTION_BY_SECTION[sec]) {
      // A card collection with art is drawn in layers once its art is there; the usual way until then.
      const c = COLLECTION_BY_SECTION[sec],
        found = state.found[c.id] || [];
      const items = c.items.map(it => ({ id: it.id, name: it.name, found: found.includes(it.id) }));
      if (!SECTION_ART[sec] || !renderCollectionArt(sec, items, force)) renderCollection(c, force);
    } else if (sec === 'ultras') renderUltras(force);
    else if (sec === 'signs') renderSigns(force);
    else if (sec === 'disasters') renderDisasters(force);
    else if (sec === 'planets') renderPlanets(force);
    else if (sec === 'index') renderIndex(force);
    else if (CLIMATE_SECTIONS.has(sec)) renderClimate(sec);
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

function openCategory(cat) {
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
// One panel, three things, each with its own button: the science book (the research tabs), the poster book
// (Collections: the story posters and the collection posters) and the computer (Climate: the running figures).
const BOOK_BUTTONS = ['#book-btn', '#posters-btn', '#computer-btn'];
const bookMode = cat => (cat === 'collections' ? 'posters' : cat === 'climate' ? 'computer' : 'book');
let scienceCat = 'space'; // the science book's page, to go back to
function openBook(cat = scienceCat) {
  if (!bookOpen) history.pushState({ book: true }, '');
  bookOpen = true;
  $('#book').dataset.mode = bookMode(cat);
  if (bookMode(cat) === 'book') scienceCat = cat;
  $('#book').classList.remove('hidden');
  BOOK_BUTTONS.forEach(b => $(b).classList.add('hidden'));
  openCategory(cat);
}

function hideBook() {
  bookOpen = false;
  $('#book').classList.add('hidden');
  BOOK_BUTTONS.forEach(b => $(b).classList.remove('hidden'));
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

$('#book-btn').addEventListener('click', () => openBook(scienceCat));
$('#posters-btn').addEventListener('click', () => openBook('collections'));
$('#computer-btn').addEventListener('click', () => openBook('climate'));
$('#book-close').addEventListener('click', closeBook);
$('#puzzle-close').addEventListener('click', closePuzzle);
$('#splash-close').addEventListener('click', hideSplash);
$('#research-bars').addEventListener('click', e => {
  const bar = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.research-bar'));
  const u = bar && RESEARCH_BY_ID[bar.dataset.id || ''];
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
  Scene.setSky(state.signs);
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
  // With its art, the zodiac is a wheel in layers: each sign shows once found.
  const wheel = Sky.SIGNS.filter(sg => !sg.hidden).map(sg => ({
    id: sg.id,
    name: sg.name,
    found: state.signs.includes(sg.id),
  }));
  if (renderCollectionArt('signs', wheel, force)) return;
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
    key = state.atoms.join() + pickedAtom + state.unseen.join();
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
    <p class="atom-info">${a ? `<b>${pickedAtom}</b> ${a.name} · ${ELEMENT_SYMBOLS.indexOf(pickedAtom ?? '') + 1}<br>${a.how}` : 'Tap an atom.'}</p>`;
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

/* ================= Climate ================= */

// Each known series as a card: its name and number, and a line graph of the last hour under it. Touching the
// graph reads off the value at that moment.
const CLIMATE_SECTIONS = new Set(CLIMATE.map(c => c.section));
const inside = (el, sel) => /** @type {HTMLElement} */ (el.querySelector(sel));
const GRAPH_W = 200,
  GRAPH_H = 48;

function graphPoints(values, least = 0) {
  if (values.length < 2) return '';
  let lo = Math.min(...values),
    hi = Math.max(...values);
  const span = Math.max(hi - lo, least, 0.1 * Math.max(Math.abs(hi), Math.abs(lo)), 1e-6),
    mid = (hi + lo) / 2;
  lo = mid - span * 0.6;
  hi = mid + span * 0.6;
  return values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * GRAPH_W).toFixed(1)},${(GRAPH_H - ((v - lo) / (hi - lo)) * GRAPH_H).toFixed(1)}`,
    )
    .join(' ');
}

function climateSpan(log) {
  const t = log.t || [];
  return t.length > 1 ? `${Math.max(1, Math.round((t[t.length - 1] - t[0]) / 60))} min ago` : '';
}

function renderClimate(sec) {
  const root = $(`#${sec}`);
  if (!root) return;
  const shown = CLIMATE.filter(c => c.section === sec && c.known());
  const key = shown.map(c => c.id).join();
  if (root.dataset.key !== key) {
    root.dataset.key = key;
    root.innerHTML =
      (sec === 'weather' ? '<p class="climate-now"></p>' : '') +
      shown
        .map(
          c => `<div class="climate-card" data-id="${c.id}">
        <div class="climate-head"><span>${c.name}</span><b></b></div>
        <svg class="climate-graph" viewBox="0 0 ${GRAPH_W} ${GRAPH_H}" preserveAspectRatio="none">
          <polyline vector-effect="non-scaling-stroke" points=""/><line class="cursor hidden" y1="0" y2="${GRAPH_H}" vector-effect="non-scaling-stroke"/>
        </svg>
        <div class="climate-axis"><span></span><span class="range"></span><span>now</span></div>
      </div>`,
        )
        .join('');
    for (const card of root.querySelectorAll('.climate-card')) climateTouch(/** @type {HTMLElement} */ (card));
  }
  const log = state.climateLog || {};
  if (sec === 'weather') {
    const now = WEATHER_NOW.filter(w => w.now()).map(w => w.name);
    inside(root, '.climate-now').textContent = now.join(' · ');
  }
  for (const c of shown) {
    const card = inside(root, `.climate-card[data-id="${c.id}"]`);
    if (card.dataset.reading) continue; // the player is reading off an older value
    inside(card, 'b').textContent = c.show(c.now());
    const values = log[c.id] || [];
    const pts = graphPoints(values, c.span);
    const line = inside(card, 'polyline');
    if (line.getAttribute('points') !== pts) line.setAttribute('points', pts);
    inside(card, '.climate-axis span').textContent = climateSpan(log);
    inside(card, '.range').textContent =
      values.length > 1 ? `${c.show(Math.min(...values))} – ${c.show(Math.max(...values))}` : '';
  }
}

// Touch or hover a graph: a line marks the moment and the number shows the value then.
function climateTouch(card) {
  const svg = inside(card, 'svg'),
    cursor = inside(card, '.cursor');
  const read = e => {
    const c = CLIMATE.find(o => o.id === card.dataset.id),
      log = state.climateLog || {},
      values = log[card.dataset.id] || [];
    if (!c || values.length < 2) return;
    const box = svg.getBoundingClientRect(),
      f = clamp01((e.clientX - box.left) / box.width),
      i = Math.round(f * (values.length - 1));
    card.dataset.reading = '1';
    const x = (i / (values.length - 1)) * GRAPH_W;
    cursor.setAttribute('x1', String(x));
    cursor.setAttribute('x2', String(x));
    cursor.classList.remove('hidden');
    const ago = (log.t[log.t.length - 1] || 0) - (log.t[i] || 0);
    inside(card, 'b').textContent = `${c.show(values[i])}${ago >= 1 ? ` · ${fmtTime(ago)} ago` : ''}`;
  };
  const done = () => {
    delete card.dataset.reading;
    cursor.classList.add('hidden');
  };
  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId);
    read(e);
  });
  svg.addEventListener('pointermove', e => (e.pointerType === 'mouse' || card.dataset.reading) && read(e));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) svg.addEventListener(ev, done);
}

/* ================= World tab ================= */

function renderWorld() {
  $('#stats').innerHTML = `<dt>Time played</dt><dd>${fmtTime(state.time)}</dd>`;
}

/* ================= Posters in layers ================= */

// A poster drawn as a picture in layers (posters/<art>/): a base, and one layer per thing on it, placed by
// layers.json. Story posters (stories.yaml `posters`) show a story's research, done by tapping: a layer is hidden
// behind a "?" until its research can be done, then shows faded; a tap starts the research; once researched it
// shows clearly, with its name. A layer for research from another story fills in once that research is done
// there. Collection posters with art (SECTION_ART) show each item clearly, named, once found.

// Each art's layers.json, loaded once, in the art's pixels: { size: [w, h], layers: { id: [x, y, w, h, cx, cy] },
// names?: { id: [x, y] } }. (cx, cy) is the layer's centre of mass: its "?" goes there. A name hangs under its
// layer, or sits where `names` puts it by hand (rings nested inside one another share one box and one centre).
/** @type {Record<string, { size: number[], layers: Record<string, number[]>, names?: Record<string, number[]> } | 'loading' | 'missing'>} */
const posterArt = {};
function loadPosterArt(art) {
  const a = posterArt[art];
  if (a) return typeof a === 'string' ? null : a;
  posterArt[art] = 'loading';
  fetch(`posters/${art}/layers.json?v=${BUILD}`)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then(j => {
      posterArt[art] = j;
      renderCategory(true);
    })
    .catch(e => {
      // No such art: cards instead, for good. A failed connection: try again at the next render after a while.
      if (e instanceof Error && e.message === '404') posterArt[art] = 'missing';
      else setTimeout(() => delete posterArt[art], 10000);
    });
  return null;
}

// Poster pictures in the colors found so far, like the planet and the icons (Hues, in sprites.js): each file is
// recolored once per set of colors found, then kept as a data URL. Until its copy is ready a file is left out, so
// a poster never shows a color the player has not found.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
/** @type {Record<string, string>} */
let tintedArt = {},
  tintedKey = '',
  tintRedraw = 0;
function posterFile(art, id) {
  const src = `posters/${art}/${id}.png?v=${BUILD}`;
  if (Hues.key() === 'full') return src; // colors not set up (the wiki)
  if (tintedKey !== Hues.key()) {
    tintedArt = {};
    tintedKey = Hues.key();
  }
  const k = `${art}/${id}`;
  if (k in tintedArt) return tintedArt[k] || BLANK;
  tintedArt[k] = '';
  const img = new Image(),
    key = tintedKey;
  img.onload = () => {
    if (key !== tintedKey) return;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.drawImage(img, 0, 0);
    const pic = g.getImageData(0, 0, c.width, c.height),
      d = pic.data,
      seen = new Map(); // pixel art has few colors: each is worked out once
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const rgb = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      let t = seen.get(rgb);
      if (!t) seen.set(rgb, (t = Hues.tint(d[i], d[i + 1], d[i + 2])));
      [d[i], d[i + 1], d[i + 2]] = t;
    }
    g.putImageData(pic, 0, 0);
    tintedArt[k] = c.toDataURL();
    // One redraw for all the files that come in together.
    tintRedraw ||= requestAnimationFrame(() => {
      tintRedraw = 0;
      if (bookOpen) renderCategory(true);
    });
  };
  img.src = src;
  return BLANK;
}

// Card posters drawn in layers, by section, and their art: `art` on a card collection (collections.yaml); the
// star signs are not a collection, so their art is named here.
const SECTION_ART = {
  signs: 'zodiac',
  ...Object.fromEntries(DATA.collections.filter(c => c.section && c.art).map(c => [c.section, c.art])),
};

/**
 * Draws a poster in layers into root.
 * @param {HTMLElement} root
 * @param {string} artId
 * @param {{ id: string, state: string, name: string, done?: number }[]} slots
 */
function drawLayered(root, artId, slots) {
  const art = /** @type {{ size: number[], layers: Record<string, number[]>, names?: Record<string, number[]> }} */ (
      posterArt[artId]
    ),
    [aw, ah] = art.size,
    file = id => posterFile(artId, id);
  const html = slots
    .filter(sl => sl.state !== 'gone') // not drawn at all, not even as "?"
    .map(sl => {
      const [x, y, w, h, cx = x + w / 2, cy = y + h / 2] = art.layers[sl.id] || [0, 0, 0, 0],
        k = sl.state,
        box = `left:${(x / aw) * 100}%;top:${(y / ah) * 100}%;width:${(w / aw) * 100}%;height:${(h / ah) * 100}%`,
        // The centre of mass within the layer's box, for the "?" and for a name set on the layer.
        at = `left:${((cx - x) / w) * 100}%;top:${((cy - y) / h) * 100}%`,
        [nx, ny] = art.names?.[sl.id] || [],
        place =
          nx === undefined
            ? `left:${((cx - x) / w) * 100}%`
            : `left:${((nx - x) / w) * 100}%;top:${((ny - y) / h) * 100}%`,
        name =
          k === 'done' && sl.name
            ? `<span class="${nx === undefined ? '' : 'on'}" style="${place}">${sl.name}</span>`
            : '';
      return `<button class="pslot ${k}" data-id="${sl.id}" style="${box}"${k === 'ready' ? '' : ' tabindex="-1"'}>
        ${k === 'unknown' ? `<b style="${at}">?</b>` : `<img src="${file(sl.id)}" alt="">`}${name}</button>`;
    })
    .join('');
  // Research under way: one bar per concept, the full width of the poster, under the picture and above the title.
  const bars = slots
    .filter(sl => sl.state === 'running')
    .map(sl => `<i class="pslot-bar"><i style="width:${pct(sl.done || 0)}"></i></i>`)
    .join('');
  root.innerHTML = `<div class="story-poster" style="aspect-ratio:${aw}/${ah}">
    <img class="poster-base" src="${file('base')}" alt="">${html}</div>${bars}`;
}

// A poster's slots: research, done here (ready: tap to start) or elsewhere (fills in once known), and items of a
// collection (fill in once found).
function posterSlotState(poster, id) {
  if (slotKnown(id)) return 'done';
  const u = slotResearch(id);
  if (!u || u.auto || u.tab !== poster.id) return 'unknown'; // an item, happens by itself, or researched elsewhere
  if (researchingNow(id)) return 'running';
  return researchVisible(u) && (u.needs || []).every(needMet) ? 'ready' : 'unknown';
}

function renderPoster(poster, force) {
  const root = $(`#${poster.id}`);
  if (!root || !loadPosterArt(poster.art)) return;
  const picked = root.dataset.picked || '';
  const slots = poster.slots.map(sl => ({
    id: sl.id,
    state: posterSlotState(poster, sl.id),
    name: ITEM_BY_ID[sl.id] ? ITEM_BY_ID[sl.id].item.name : bookName(RESEARCH_BY_ID[sl.id]),
    done: researchingNow(sl.id)?.done,
  }));
  // Rebuilt only when a slot changes how it looks.
  const key =
    slots.map(sl => (sl.state === 'running' ? `r${Math.floor((sl.done || 0) * 20)}` : sl.state[0])).join('') +
    Object.values(tintedArt).filter(Boolean).length +
    tintedKey +
    picked +
    (poster.id === 'spectrum' ? `${setDone('bands')}${state.heatView}` : '');
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  drawLayered(root, poster.art, slots);
  // A tap on a concept whose picture shows starts its research (or opens its puzzle).
  root.querySelectorAll('.pslot.ready').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      choose({ kind: 'research', item: RESEARCH_BY_ID[/** @type {HTMLElement} */ (b).dataset.id || ''] });
    }),
  );
  // A tap on an item found tells how it was found, under the poster.
  const pickedItem = ITEM_BY_ID[picked]?.item;
  if (poster.slots.some(sl => ITEM_BY_ID[sl.id] && itemFound(sl.id)))
    root.insertAdjacentHTML(
      'beforeend',
      `<p class="atom-info">${pickedItem && itemFound(picked) ? `<b>${pickedItem.name}</b><br>${pickedItem.how}` : 'Tap one.'}</p>`,
    );
  root.querySelectorAll('.pslot.done').forEach(b => {
    const id = /** @type {HTMLElement} */ (b).dataset.id || '';
    if (!ITEM_BY_ID[id]) return;
    b.classList.add('found');
    b.addEventListener('click', e => {
      e.stopPropagation();
      root.dataset.picked = id;
      seenNow(`${ITEM_BY_ID[id].collection.id}:${id}`);
      renderPoster(poster);
    });
  });
  // Every band found lets the planet be seen in infrared: the switch hangs under the spectrum.
  if (poster.id === 'spectrum' && setDone('bands')) {
    root.insertAdjacentHTML(
      'beforeend',
      `<button id="heat-view" class="view-toggle${state.heatView ? ' on' : ''}">Infrared</button>`,
    );
    within(root, '#heat-view').addEventListener('click', e => {
      e.stopPropagation();
      state.heatView = !state.heatView;
      Scene.setHeatView(state.heatView);
      renderPoster(poster, true);
    });
  }
}

// A collection poster with art: each item clearly, named, once found; "?" until then. Returns false while the art
// is not there (loading, or none made), so the poster is drawn the usual way meanwhile.
function renderCollectionArt(sec, items, force, extra = '') {
  const root = $(`#${sec}`),
    artId = SECTION_ART[sec];
  if (!root || !loadPosterArt(artId)) return false;
  const key = `art|${items.map(it => (it.found ? it.id : '')).join()}|${extra}|${tintedKey}|${Object.values(tintedArt).filter(Boolean).length}`;
  if (!force && root.dataset.key === key) return true;
  root.dataset.key = key;
  drawLayered(
    root,
    artId,
    items.map(it => ({ id: it.id, state: it.found ? 'done' : it.quiet ? 'gone' : 'unknown', name: it.name })),
  );
  return true;
}
