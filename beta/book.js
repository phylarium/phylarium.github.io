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

// Research is done on the pages of the book: a research whose tab is a section
// is a layer there, tapped to research, instead of a card in a tab's list. The few that stay in the science book
// (the comets; the gases that thaw by themselves) fill in on a
// poster that shows them once known.
// The section a research shows in: its tab, a poster or a page of the science book.
const sectionOf = u => u.tab;

// A page lists what is found on it (every research known, as a note with its gauge) and the research that can be
// started now. Nothing else: no padlocks, no next step (2026-11-10).
function tabEntries(tab) {
  const entries = [];
  const listed = RESEARCH;
  for (const u of listed) if (u.tab === tab && has(u.id)) entries.push({ kind: 'researched', item: u }); // every step stays
  for (const u of listed)
    if (u.tab === tab && !has(u.id) && !u.auto && researchVisible(u)) entries.push({ kind: 'research', item: u });
  return entries;
}

// The book's pages carry no live figures: those are the computer's graphs (CLIMATE in game.js).
function headHtml() {
  return '';
}

function renderTab(tab, force = false) {
  const root = $(`#${tab}`);
  if (!root || tab === 'world' || tab === 'life') return;
  const entries = tabEntries(tab);
  const key = `${state.happened.length}|${has('volcano')}|${has('magnet')}|${state.eruptions > 0}|${state.spinLocked}|${entries.map(e => e.kind + e.item.id).join()}`;
  if (force || tabKeys[tab] !== key) {
    tabKeys[tab] = key;
    root.innerHTML = `<div class="domain-head">${headHtml()}</div><ul class="list"></ul>`;
    const list = root.querySelector('.list');
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = 'item';
      li.innerHTML = `
        <div class="icon">${spriteImg(e.item.icon)}</div>
        <div class="info"><div class="name"></div><div class="desc"></div><div class="meta"></div></div>
        <div class="side"><div class="count"></div><div class="cost"></div></div>`;
      if (e.kind !== 'researched') li.addEventListener('click', () => choose(e));
      e.li = li;
      list.appendChild(li);
    }
    root._entries = entries;
  }
  updateTab(tab, root);
}

// A research node's name in the book, its title first when it has one: "Water H₂O".
const bookName = u => (u.title ? `${u.title} ${u.name}` : u.name);

// A parent is ready once it is established: half a full population, or half of what its home allows if smaller.
const parentReady = s => pop(s.parent) >= 0.5 * Math.min(1, habitat(SPECIES_BY_ID[s.parent]));
const opened = s => !s.research || has(s.research);

function updateTab(tab, root) {
  for (const e of root._entries || []) {
    const { item, li } = e,
      q = s => li.querySelector(s);
    if (e.kind === 'researched') {
      // What is found: its icon and name, nothing live (the computer has the figures).
      li.className = `item researched${item.ultra ? ' ultra' : ''}${item.disaster ? ' disaster' : ''}`;
      q('.name').textContent = bookName(item);
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
  // The burning sun gives the warm colors together, so the molten planet glows in them from the start.
  yellow: () => (state.games.sunrise || 0) > 0 || state.ignition >= 1 || seen('sunlit'), // the rising sun, then the burning one
  red: () => state.ignition >= 1 || has('lava') || (state.banged && state.crust < 1), // the sun, the glowing young planet, a volcano
  orange: () => state.ignition >= 1 || state.comets > 0, // the sun, or a comet burning up
  blue: () => state.pressure >= 0.5, // tap the sky when the air is thick enough to scatter blue
  green: () => state.terminalIn, // log in to the computer: the password is a hex color
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
  $('#computer-btn .sprite').src = Sprites.icon('computer');
  $('#lab-btn .sprite').src = Sprites.icon('lab');
  $('#settings-btn .sprite').src = Sprites.icon('settings');
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

let currentCat = 'book'; // the book, or what else is open behind a button (climate, lab, game)
let bookOpen = false;

// The book is one run of pages, swiped left and right (data/book.yaml `chapters`): each chapter's research pages
// (what is found on them) and card collections, under the chapter's name. The other things behind buttons (the
// computer, the lab, the settings) are the hidden subjects of book.yaml, as before.
// The book and the lab are each one run of pages, swiped left and right (data/book.yaml `pages`): a page is one
// sphere (Space, Atmosphere, Geosphere, Ocean, Life, Stories; Chemistry and Physics in the lab) with its research
// sections (what is found on them) and its card collections stacked down it. The other things behind buttons (the
// computer, the settings) are the hidden subjects of book.yaml, as before.
const PAGES_OF = { book: DATA.book.pages?.book || [], lab: DATA.book.pages?.lab || [] };
const PAGE_SECTIONS = PAGES_OF.book.flatMap(p => p.sections);
const LAB_SECTIONS = PAGES_OF.lab.flatMap(p => p.sections);
const PAGE_OF_SECTION = Object.fromEntries(
  [...PAGES_OF.book, ...PAGES_OF.lab].flatMap(p => p.sections.map(sec => [sec, p.name])),
);
// The old subject ids open the book at their first page (tests and tools still name them).
const PAGE_CATS = new Set(
  SUBJECTS.filter(c => !c.hidden)
    .map(c => c.id)
    .concat('collections'),
);
const visibleSections = cat =>
  PAGES_OF[cat]
    ? PAGES_OF[cat].flatMap(p => p.sections).filter(sec => SECTIONS[sec].unlocked())
    : SUBJECT_BY_ID[cat].sections.filter(sec => SECTIONS[sec].unlocked());

// Card sets of the night sky sit on a dark panel (`night: true` on a collection in collections.yaml, and
// book.yaml's `night` list for the sky sections).
const NIGHT_POSTERS = new Set([
  ...DATA.collections.filter(c => c.section && c.night).map(c => c.section),
  ...(DATA.book.night || []),
]);
// A page: its name at the top, then each of its sections as a part with its own heading.
function pageHtml(page) {
  return `
      <section class="poster-slide" data-page="${page.name}"><div class="poster page-notes"><div class="page-body">
        <h3 class="page-title">${page.name}</h3>
        ${page.sections
          .map(
            sec => `<section class="section part${NIGHT_POSTERS.has(sec) ? ' night' : ''}" data-section="${sec}">
          <h4 class="part-title">${SECTIONS[sec].name}</h4>
          <div id="${sec}"></div>
        </section>`,
          )
          .join('')}
      </div></div></section>`;
}
// One run of pages (the book, the lab), hung on the book itself so it covers the whole screen.
function buildTrack(cat) {
  const div = document.createElement('div');
  div.id = `cat-${cat}`;
  div.className = 'tab';
  div.innerHTML = `<div class="poster-track">${PAGES_OF[cat].map(pageHtml).join('')}</div>
      <p class="blank-page">Empty pages.</p>`;
  // A tap beside a page (or the close button) puts the book away.
  div.addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.classList.contains('poster-slide')) closeBook();
  });
  // The page the book was left open at is remembered.
  const track = /** @type {HTMLElement} */ (div.querySelector('.poster-track'));
  track.addEventListener('scroll', () => {
    const slides = [...track.querySelectorAll('.poster-slide:not(.hidden)')],
      k = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const slide = /** @type {HTMLElement | undefined} */ (slides[k]);
    if (slide && bookOpen && currentCat === 'book' && cat === 'book') state.bookPage = slide.dataset.page || null;
  });
  $('#book').appendChild(div);
}
function buildPanels() {
  const world = $('#world');
  buildTrack('book');
  buildTrack('lab');
  for (const c of SUBJECTS) {
    if (!c.hidden || c.id === 'collections' || c.id === 'lab') continue;
    const div = document.createElement('div');
    div.id = `cat-${c.id}`;
    div.className = 'tab';
    const sections = list =>
      list
        .map(
          sec => `
      <section class="section" data-section="${sec}">
        <h3 class="section-title">${SECTIONS[sec].name}</h3>
        ${sec === 'world' ? '' : `<div id="${sec}"></div>`}
      </section>`,
        )
        .join('');
    div.innerHTML = `${c.id === 'climate' ? '<section class="section login" data-section="login"><div id="login"></div></section>' : ''}${sections(c.sections)}
      <p class="blank-page">Empty pages.</p>`;
    if (c.sections.includes('world')) within(div, '[data-section="world"]').appendChild(world);
    $('#panel').appendChild(div);
  }
  $('#book-btn').insertAdjacentHTML('afterbegin', spriteImg('book'));
  $('#computer-btn').insertAdjacentHTML('afterbegin', spriteImg('computer'));
  $('#lab-btn').insertAdjacentHTML('afterbegin', spriteImg('lab'));
  $('#settings-btn').insertAdjacentHTML('afterbegin', spriteImg('settings'));
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
// ultra whose puzzle can be played. Its tab gets a green badge. The sections with such research are found once
// per update, for every subject.
const researchable = u => !u.auto && !has(u.id) && researchVisible(u) && (u.needs || []).every(needMet);
const readySections = () => new Set(RESEARCH.filter(researchable).map(sectionOf));
const subjectReady = (cat, ready = readySections()) => visibleSections(cat).some(sec => ready.has(sec));

// The book button's dot (more found than seen) and badge (research that can be started), and the other buttons.
function updateDots() {
  const ready = readySections();
  const size = subjectSize('book');
  if (bookOpen && currentCat === 'book') state.bookSeen.book = size;
  $('#book-btn .dot').classList.toggle('hidden', size <= (state.bookSeen.book || 0));
  $('#book-btn .ready-badge')?.classList.toggle('hidden', !subjectReady('book', ready));
  // Each button shows once there is something behind it.
  $('#computer-btn').classList.toggle('none', visibleSections('climate').length === 0);
  $('#lab-btn').classList.toggle('none', visibleSections('lab').length === 0);
  $('#lab-btn .ready-badge').classList.toggle('hidden', !subjectReady('lab', ready));
}

// The light update skips the world stats and the tree of life, which have their own slower timers.
function renderCategory(force = false, light = false) {
  if (!bookOpen) return;
  const root = $(`#cat-${currentCat}`),
    visible = visibleSections(currentCat);
  root
    .querySelectorAll('.section:not(.login)')
    .forEach(n => n.classList.toggle('hidden', !visible.includes(n.dataset.section)));
  if (currentCat === 'climate') renderLogin();
  // A page shows once one of its parts does.
  root
    .querySelectorAll('.poster-slide')
    .forEach(p => p.classList.toggle('hidden', !p.querySelector('.section:not(.hidden)')));
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
    else if (sec === 'calendar') renderCalendar();
    else if (CLIMATE_SECTIONS.has(sec)) renderClimate(sec);
    else renderTab(sec, force);
  }
  // A card set lays its cards 2, 3 or 4 across, by how many there are, so they spread evenly over the page.
  if (PAGES_OF[currentCat])
    for (const grid of root.querySelectorAll('.law-grid')) {
      // Set on the section's box, which outlives the grid when the section draws itself again.
      const n = grid.children.length;
      /** @type {HTMLElement} */ (grid.parentElement).style.setProperty('--cols', String(n <= 4 ? 2 : n <= 9 ? 3 : 4));
    }
}

function openCategory(cat) {
  // An old subject id (Space, Collections, Stories ...) opens the book at that subject's first page.
  let page = null;
  if (PAGE_CATS.has(cat)) {
    const sec = SUBJECT_BY_ID[cat].sections.find(s => PAGE_SECTIONS.includes(s));
    page = sec ? PAGE_OF_SECTION[sec] : null;
    cat = 'book';
  }
  currentCat = cat;
  document
    .querySelectorAll('#panel > .tab, #book > .tab')
    .forEach(n => n.classList.toggle('active', n.id === `cat-${cat}`));
  const subject = SUBJECT_BY_ID[cat];
  $('#book-title').textContent = subject ? subject.name : 'Book';
  $('#book-title').style.color = subject ? Hues.css(subject.text || subject.color) : '';
  if (cat !== 'book') $('#panel').scrollTop = 0;
  renderCategory(true);
  if (cat === 'book') showPage('book', page || state.bookPage || null);
  if (cat === 'lab') showPage('lab', null);
  updateDots();
}
// Bring a page of the book or the lab into view, by its name or one of its sections (the first visible page
// when none is given or it is not shown).
function showPage(cat, name, smooth = false) {
  const track = $(`#cat-${cat} .poster-track`),
    slides = [...track.querySelectorAll('.poster-slide:not(.hidden)')],
    page = name && PAGE_OF_SECTION[name] ? PAGE_OF_SECTION[name] : name;
  const k = Math.max(
    0,
    slides.findIndex(s => /** @type {HTMLElement} */ (s).dataset.page === page),
  );
  track.scrollTo({ left: k * track.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
}

// The book covers the whole screen, so taps meant for the book never reach the planet.
// The back button or gesture closes it.
// One panel, five things, each with its own button: the science book (the research tabs), the poster book
// (Collections: the story posters and the collection posters), the computer (Climate: the running figures), the
// lab (the molecule puzzles and the periodic table, as posters) and the game's settings.
const BOOK_BUTTONS = ['#book-btn', '#computer-btn', '#lab-btn', '#settings-btn'];
// Which button opens what. The book and the computer stand alone (the buttons go while they are open); the lab
// and the settings keep the column beside them, the open one lit, and a tap on the lit one closes it.
const CAT_OF_BUTTON = { '#book-btn': 'book', '#computer-btn': 'climate', '#lab-btn': 'lab', '#settings-btn': 'game' };
const ALONE = new Set(['book', 'climate']);
function markButtons() {
  for (const b of BOOK_BUTTONS) {
    $(b).classList.toggle('active', bookOpen && currentCat === CAT_OF_BUTTON[b]);
    $(b).classList.toggle('hidden', bookOpen && ALONE.has(currentCat));
  }
}
function toggleBook(cat) {
  if (bookOpen && currentCat === cat) closeBook();
  else openBook(cat);
}
const MODE_OF = { book: 'posters', lab: 'posters', climate: 'computer', game: 'settings' };
const bookMode = cat => (PAGE_CATS.has(cat) ? 'posters' : MODE_OF[cat] || 'book');
function openBook(cat = 'book') {
  if (!bookOpen) history.pushState({ book: true }, '');
  bookOpen = true;
  $('#book').dataset.mode = bookMode(cat);
  $('#book').classList.remove('hidden');
  openCategory(cat);
  markButtons();
}

function hideBook() {
  bookOpen = false;
  $('#book').classList.add('hidden');
  markButtons();
}

function closeBook() {
  if (history.state?.book) history.back();
  else hideBook();
}

// Open the book at the page that holds a section and bring the section into view.
function openTab(section) {
  const cat = PAGE_SECTIONS.includes(section) ? 'book' : LAB_SECTIONS.includes(section) ? 'lab' : null;
  if (cat) {
    openBook(cat);
    showPage(cat, section);
    $(`#cat-${cat} .part[data-section="${section}"]`)?.scrollIntoView({ block: 'start' });
    return;
  }
  openBook(subjectOf(section).id);
  if (visibleSections(currentCat).length > 1)
    $(`[data-section="${section}"]`).scrollIntoView({ block: 'start', inline: 'center' });
}

$('#book-btn').addEventListener('click', () => toggleBook('book'));
$('#computer-btn').addEventListener('click', () => toggleBook('climate'));
$('#lab-btn').addEventListener('click', () => toggleBook('lab'));
$('#settings-btn').addEventListener('click', () => toggleBook('game'));
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

/* ================= Astronomy: star signs and planets ================= */

// The zodiac game: from the night the planet spins, a star sign shows: the first night for sure, then a sign
// not yet found on one night in five (SIGN_CHANCE), any of those left with an equal chance. Ophiuchus, the hidden 13th, waits until all 12 are found
// and is rarer still. Other nights show a sign already found, or none before the first.
const SIGN_CHANCE = 0.2,
  SIGN_HIDDEN = 0.002;

// A number in [0, 1) fixed for this world, night and purpose, so a reload shows the same sky.
function nightRandom(night, salt) {
  let h = (state.seed ^ Math.imul(night, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

// A night runs from 18:00 to 06:00 and is numbered by the day it ends on. Tonight's sign is picked once.
// The signs come with the spin, no research needed; all twelve found open the Milky Way.
const zodiacOpen = () => state.spinLocked;
// The planets wander among the stars from the start; the first one tapped opens their collection.
const planetsOpen = () => true;
const zodiacComplete = () => Sky.SIGNS.filter(s => !s.hidden).every(s => state.signs.includes(s.id));

function updateTonight() {
  if (!state.spinLocked) return;
  const night = Math.floor((state.clock + 6) / 24);
  if (state.tonight?.night === night && (state.tonight.sign || !zodiacOpen())) return;
  if (!zodiacOpen()) return void (state.tonight = { night, sign: null, planet: tonightPlanet(night) });
  const main = Sky.SIGNS.filter(s => !s.hidden),
    left = main.filter(s => !state.signs.includes(s.id));
  const pool = left.length ? left : Sky.SIGNS.filter(s => s.hidden && !state.signs.includes(s.id));
  const chance = !state.signs.length ? 1 : left.length ? SIGN_CHANCE : SIGN_HIDDEN;
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
  if (kind === 'sign' && zodiacComplete()) collectionComplete('signs', 'Star signs', 'Opens Milky Way.');
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
    key = state.signs.join();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const signs = Sky.SIGNS.filter(s => !s.hidden || state.signs.includes(s.id));
  const main = Sky.SIGNS.filter(s => !s.hidden);
  root.innerHTML = `<p class="note">${state.signs.filter(id => main.some(s => s.id === id)).length} of ${main.length} star signs found</p>
    <div class="law-grid">${signs
      .map(s =>
        state.signs.includes(s.id)
          ? `<button class="law-card sign-card" data-id="${s.id}"><img src="${signPicture(s)}" alt=""><span>${s.name}</span></button>`
          : '<div class="law-card unknown"><b>?</b><span></span></div>',
      )
      .join('')}</div>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b =>
    b.addEventListener('click', () => {
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
    key = ULTRAS.map(u => +has(u.id)).join('') + picked + Hues.key();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const got = ULTRAS.filter(u => has(u.id)),
    p = RESEARCH_BY_ID[picked];
  root.innerHTML = `<p class="note">${got.length} of ${ULTRAS.length} cards</p>
    <div class="law-grid">${ULTRAS.map(u =>
      has(u.id)
        ? `<button class="law-card ultra-card${u.id === picked ? ' picked' : ''}" data-id="${u.id}"><img src="${Sprites.icon(u.icon)}" alt=""><span>${u.name}</span></button>`
        : '<button class="law-card unknown" disabled><b>?</b><span></span></button>',
    ).join('')}</div>
    <p class="atom-info">${p ? `<b>${p.name}</b><br>${p.card}` : 'Tap one.'}</p>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b =>
    b.addEventListener('click', () => {
      root.dataset.picked = b.dataset.id;
      renderUltras();
    }),
  );
}

// Natural disasters are a collection: each is found the first time it strikes. A card per disaster, blanks for
// the rest; tap one to read what it does and how often it has struck. The full set makes them all rarer.
function renderDisasters(force) {
  const root = $('#disasters'),
    picked = root.dataset.picked || '',
    key = JSON.stringify(state.disasters) + picked;
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const all = DATA.disasters,
    struck = all.filter(d => state.disasters[d.id]),
    p = DISASTERS[picked];
  root.innerHTML = `<p class="note">${struck.length} of ${all.length} found</p>
    <div class="law-grid">${all
      .map(d =>
        state.disasters[d.id]
          ? `<button class="law-card disaster-card${d.id === picked ? ' picked' : ''}" data-id="${d.id}"><b>×${state.disasters[d.id]}</b><span>${d.name}</span></button>`
          : '<button class="law-card unknown" disabled><b>?</b><span></span></button>',
      )
      .join('')}</div>
    <p class="atom-info">${p ? `<b>${p.name}</b> · ${state.disasters[picked]} ${state.disasters[picked] === 1 ? 'time' : 'times'}<br>${p.how}` : 'Tap one.'}</p>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b =>
    b.addEventListener('click', () => {
      root.dataset.picked = b.dataset.id;
      renderDisasters();
    }),
  );
}

function renderPlanets(force) {
  const root = $('#planets'),
    key = state.planets.join() + Hues.key();
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  root.innerHTML = `<p class="note">${state.planets.length} of ${Sky.PLANETS.length} planets found</p>
    <div class="law-grid">${Sky.PLANETS.map(p =>
      state.planets.includes(p.id)
        ? `<button class="law-card" data-id="${p.id}"><i class="planet-dot" style="background:${Hues.css(p.color)}"></i><span>${p.name}</span></button>`
        : '<div class="law-card unknown"><b>?</b><span></span></div>',
    ).join('')}</div>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b =>
    b.addEventListener('click', () => {
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
}

function findAtoms() {
  for (const [sym, a] of Object.entries(ATOMS)) if (a.found?.()) discover(sym);
  for (const [id, law] of Object.entries(LAWS)) {
    if (state.laws.includes(id) || !law.found()) continue;
    state.laws.push(id);
  }
}

/* ================= Physics: laws of nature ================= */

let pickedLaw = null;

// A card per law; laws not found yet are question marks.
function renderLaws(force) {
  const root = $('#laws'),
    key = state.laws.join() + pickedLaw;
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const ids = Object.keys(LAWS);
  root.innerHTML = `<p class="note">${state.laws.length} of ${ids.length} laws found</p>
    <div class="law-grid">${ids
      .map(id =>
        state.laws.includes(id)
          ? `<button class="law-card${id === pickedLaw ? ' picked' : ''}" data-id="${id}"><b>${LAWS[id].sign}</b><span>${LAWS[id].name}</span></button>`
          : '<button class="law-card unknown" disabled><b>?</b><span></span></button>',
      )
      .join('')}</div>
    <p class="atom-info">${pickedLaw ? `<b>${LAWS[pickedLaw].name}</b><br>${LAWS[pickedLaw].how}` : 'Tap a law.'}</p>`;
  root.querySelectorAll('.law-card[data-id]').forEach(b =>
    b.addEventListener('click', () => {
      pickedLaw = b.dataset.id;
      renderLaws();
    }),
  );
}

// The Bohr model of an atom: the nucleus with the symbol, a ring per shell and a dot per electron.
function bohrSvg(z) {
  const shells = ELEMENT_SHELLS[z - 1],
    step = shells.length > 4 ? 6 : 8,
    rings = shells
      .map((n, k) => {
        const r = 18 + step * (k + 1);
        const dots = Array.from({ length: n }, (_, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          return `<circle class="electron" cx="${(r * Math.cos(a)).toFixed(1)}" cy="${(r * Math.sin(a)).toFixed(1)}" r="1.8"/>`;
        }).join('');
        return `<circle class="shell" r="${r}"/>${dots}`;
      })
      .join('');
  return `<svg class="bohr" viewBox="-66 -66 132 132" aria-hidden="true"><circle class="nucleus" r="12"/><text y="3.5">${ELEMENT_SYMBOLS[z - 1]}</text>${rings}</svg>`;
}

// Found atoms show their symbol; the rest show only their atomic number, waiting to be found. The picked atom
// shows its Bohr model and its text under the table.
function renderElements(force) {
  const root = $('#elements'),
    key = state.atoms.join() + pickedAtom;
  if (!force && root.dataset.key === key) return;
  root.dataset.key = key;
  const cells = ELEMENT_SYMBOLS.map((sym, k) => {
    const [row, col] = elementCell(k + 1),
      found = state.atoms.includes(sym);
    return `<button class="atom ${elementGroup(k + 1)}${found ? ' found' : ''}${sym === pickedAtom ? ' picked' : ''}" style="grid-area:${row}/${col}"
      ${found ? `data-sym="${sym}"` : 'disabled'}>${found ? sym : k + 1}</button>`;
  }).join('');
  const a = pickedAtom ? ATOMS[pickedAtom] : null,
    z = ELEMENT_SYMBOLS.indexOf(pickedAtom ?? '') + 1;
  root.innerHTML = `<p class="note">${state.atoms.length} of ${ELEMENT_SYMBOLS.length} atoms found</p>
    <div class="ptable">${cells}</div>
    <p class="atom-info">${a ? `<b>${pickedAtom}</b> ${a.name} · ${z}<br>${a.how}` : 'Tap an atom.'}</p>
    <div class="atom-card">${a ? `${bohrSvg(z)}<div><b>${pickedAtom}</b> ${a.name} · ${z}<br>${a.how}</div>` : ''}</div>`;
  root.querySelectorAll('.atom.found').forEach(b =>
    b.addEventListener('click', () => {
      pickedAtom = b.dataset.sym;
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
  $('#book-time').textContent = fmtTime(state.time); // the time played, on the terminal's status line
  const shown = CLIMATE.filter(c => c.section === sec && c.known()),
    dials = CONTROLS.filter(u => u.control === sec && has(u.id));
  const key = [...shown, ...dials].map(c => c.id).join();
  if (root.dataset.key !== key) {
    root.dataset.key = key;
    root.innerHTML =
      (sec === 'weather' ? '<p class="climate-now"></p>' : '') +
      // The god's dials: a row of four settings for each control card known (CONTROLS in game.js).
      dials
        .map(
          u =>
            `<div class="control-row" data-id="${u.id}"><span>${u.name}</span><div class="dial">${CONTROL_LEVELS.map(
              (l, k) => `<button type="button" data-level="${k}">${l}</button>`,
            ).join('')}</div></div>`,
        )
        .join('') +
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
    for (const row of root.querySelectorAll('.control-row'))
      row.addEventListener('click', e => {
        const b = /** @type {HTMLElement} */ (e.target).closest('button');
        if (!b) return;
        state.controls[/** @type {HTMLElement} */ (row).dataset.id || ''] = Number(b.dataset.level);
        save();
        renderClimate(sec);
      });
  }
  for (const u of dials)
    for (const b of root.querySelectorAll(`.control-row[data-id="${u.id}"] button`))
      b.classList.toggle('on', Number(/** @type {HTMLElement} */ (b).dataset.level) === controlLevel(u.id));
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

// The calendar screen: the planet's age, the day and the hour, the moon and the night sky, and the time played.
// The computer's login: the password is a hex color, guessed like Wordle. Each try is marked slot by slot, a
// digit in its place, a digit in the password elsewhere, or not in it. Logging in finds green: the password is
// pure green, #00ff00, and the terminal lights up in it.
const LOGIN_CODE = '00ff00',
  LOGIN_KEYS = '0123456789abcdef';
let loginTry = '',
  loginRows = /** @type {string[]} */ ([]);
function loginMarks(guess) {
  const marks = Array(6).fill('miss'),
    left = [...LOGIN_CODE];
  for (let k = 0; k < 6; k++)
    if (guess[k] === LOGIN_CODE[k]) {
      marks[k] = 'hit';
      left[k] = '';
    }
  for (let k = 0; k < 6; k++) {
    if (marks[k] === 'hit') continue;
    const i = left.indexOf(guess[k]);
    if (i >= 0) {
      marks[k] = 'near';
      left[i] = '';
    }
  }
  return marks;
}
function renderLogin() {
  const root = $('#login');
  $('#cat-climate').classList.toggle('locked', !state.terminalIn);
  if (state.terminalIn) {
    root.innerHTML = '';
    return;
  }
  const row = (guess, marks) =>
    `<div class="login-row">#${[...Array(6).keys()]
      .map(k => `<span class="login-slot ${marks ? marks[k] : ''}">${guess[k] || '_'}</span>`)
      .join('')}</div>`;
  root.innerHTML = `<p class="login-text">PHYLARIUM OS<br>login: root</p>
    <div class="login-rows">${loginRows.map(g => row(g, loginMarks(g))).join('')}${row(loginTry, null)}</div>
    <div class="login-keys">${[...LOGIN_KEYS].map(k => `<button class="login-key" data-key="${k}">${k}</button>`).join('')}
      <button class="login-key del" data-key="del">←</button>
      <button class="login-key enter" data-key="enter">LOGIN</button></div>`;
  root.querySelectorAll('.login-key').forEach(b =>
    b.addEventListener('click', e => {
      const key = /** @type {HTMLElement} */ (b).dataset.key;
      if (key === 'del') loginTry = loginTry.slice(0, -1);
      else if (key === 'enter') {
        if (loginTry.length < 6) return;
        loginRows.push(loginTry);
        if (loginTry === LOGIN_CODE) {
          state.terminalIn = true;
          loginTry = '';
          loginRows = [];
          findColor('green', e.clientX, e.clientY);
          buzz([20, 40, 20]);
          save();
          renderCategory(true);
          return;
        }
        loginTry = '';
      } else if (loginTry.length < 6) loginTry += key;
      renderLogin();
    }),
  );
}
function renderCalendar() {
  const root = $('#calendar');
  if (!root) return;
  $('#book-time').textContent = fmtTime(state.time);
  const phase = COLLECTION_BY_ID.phases.items.find(it => it.id === moonPhaseId()),
    monthDay = Math.floor((state.clock / 24) % MOON_MONTH_DAYS) + 1,
    tonight = state.tonight,
    sign = tonight?.sign ? Sky.SIGNS.find(s => s.id === tonight.sign) : null,
    planet = tonight?.planet ? Sky.PLANETS.find(p => p.id === tonight.planet) : null;
  const lines = [
    dateText(),
    state.moonBorn && phase
      ? `Moon ${phase.sign} ${phase.name} · day ${monthDay} of ${Math.round(MOON_MONTH_DAYS)}`
      : '',
    sign ? `Tonight ${sign.name}${planet ? ` · ${planet.name}` : ''}` : planet ? `Tonight ${planet.name}` : '',
    `Played ${fmtTime(state.time)}`,
  ].filter(Boolean);
  const html = lines.map(l => `<p class="climate-now">${l}</p>`).join('');
  if (root.innerHTML !== html) root.innerHTML = html;
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
  $('#stats').innerHTML = '';
}
