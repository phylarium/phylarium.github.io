'use strict';

// The wave game (the lab's Physics page): the physics counterpart of the molecule puzzles. The spectrum lies in
// a row from the longest waves (radio) to the shortest (gamma rays), with visible light in the middle. Somewhere
// on it hides a band not found yet. A tap on a place is a try: right, and the band is found (collection
// `bands`); wrong, and the place says whether the hidden wave is longer or shorter, and everything on the wrong
// side goes out. Three tries a game day, as in the molecule puzzles; today's tries stay when the screen is
// closed and opened again. The band that hides is picked when the day's game begins.
// Loads after disasters.js (it writes the saved state through WORLD). The Tune button under the bands opens it
// (renderCollection, play.js); the screen is the puzzle screen (#puzzle), closed the same way.

const WAVE_TRIES = 3;
const WAVE_ID = 'wave'; // its key in state.tries, and what the puzzle screen holds while it is open
/** @typedef {{ id: string, name: string, sign: string }} WavePlace */
/** The places on the spectrum, longest wave first: the bands, and visible light before ultraviolet. @returns {WavePlace[]} */
const wavePlaces = () => {
  const bands = /** @type {WavePlace[]} */ (COLLECTION_BY_ID['bands'].items);
  const at = bands.findIndex(band => band.id === 'ultraviolet');
  return [...bands.slice(0, at), { id: 'visible', name: 'Visible light', sign: '500 nm' }, ...bands.slice(at)];
};
/** @typedef {{ day: number, target: string, rows: number[] }} WaveLog */
/** Today's game: the band that hides and the places tried. A new day, or a band found, starts a new one. @returns {WaveLog} */
const waveLog = () => {
  const kept = /** @type {Record<string, WaveLog | undefined>} */ (state.tries)[WAVE_ID];
  const hidden = wavePlaces().filter(place => place.id !== 'visible' && !found('bands').includes(place.id));
  if (kept && kept.day === gameDay() && hidden.some(place => place.id === kept.target)) return kept;
  const pick = hidden[Math.floor(randomOf(Math.random) * hidden.length)];
  return { day: gameDay(), target: pick ? pick.id : '', rows: kept && kept.day === gameDay() ? kept.rows : [] };
};
/** A number from a source of chance, which the caller hands in. @param {() => number} random */
const randomOf = random => random();
/** @param {WaveLog} log */
const keepWaveLog = log => WORLD.write({ tries: { ...state.tries, [WAVE_ID]: log } });

/**
 * What a place shows: 'found' (a band already known, or visible light), 'longer' or 'shorter' (a wrong try: the
 * hidden wave is longer or shorter than this one), 'out' (ruled out by a try), or '' (still open).
 * @param {number} k
 * @param {WavePlace[]} places
 * @param {WaveLog} log
 */
const waveMark = (k, places, log) => {
  const place = /** @type {WavePlace} */ (places[k]);
  if (place.id === 'visible' || found('bands').includes(place.id)) return 'found';
  const at = places.findIndex(one => one.id === log.target);
  if (log.rows.includes(k)) return at < k ? 'longer' : 'shorter';
  return log.rows.some(tried => (at < tried ? k > tried : k < tried)) ? 'out' : '';
};

/** A wave as a picture: more crests the shorter the wave. @param {number} crests */
const wavePicture = crests => {
  const points = Array.from(
    { length: 37 },
    (_, x) => `${x},${(8 - 5 * Math.sin((2 * Math.PI * crests * x) / 36)).toFixed(1)}`,
  );
  return `<svg viewBox="0 0 36 16" aria-hidden="true"><polyline points="${points.join(' ')}"/></svg>`;
};
const WAVE_ARROW = { longer: '&lt;', shorter: '&gt;' };

function drawWaveGame() {
  const places = wavePlaces(),
    log = waveLog(),
    out = log.rows.length >= WAVE_TRIES,
    done = !log.target;
  const cells = places.map((place, k) => {
    const mark = waveMark(k, places, log),
      known = mark === 'found';
    const label = known ? place.name : mark === 'longer' || mark === 'shorter' ? WAVE_ARROW[mark] : '';
    return `<button class="wave-place ${mark}${place.id === 'visible' ? ' visible' : ''}" data-k="${k}"${mark || out || done ? ' disabled' : ''}>${wavePicture(k + 1)}<b>${place.sign}</b><span>${label}</span></button>`;
  });
  const html = `<div class="wave-scale">${cells.join('')}</div>
    ${out && !done ? '<p class="note tries-out">Try again tomorrow.</p>' : ''}
    <p class="tries">${Array.from({ length: WAVE_TRIES }, (_, k) => `<i class="${k < log.rows.length ? 'used' : ''}"></i>`).join('')}</p>`;
  $('#puzzle-body').replaceChildren();
  $('#puzzle-body').insertAdjacentHTML('beforeend', html);
  const buttons = [...document.querySelectorAll('#puzzle-body .wave-place:not([disabled])')];
  // oxlint-disable-next-line unicorn/no-array-for-each -- wiring the buttons is an effect
  buttons.forEach(button =>
    button.addEventListener('click', () =>
      tryWave(Number(/** @type {HTMLElement} */ (button).dataset['k']), places, log),
    ),
  );
}

/**
 * A try at place `k`: the hidden band is found there, or the place is marked and a try is spent.
 * @param {number} k
 * @param {WavePlace[]} places
 * @param {WaveLog} log
 */
function tryWave(k, places, log) {
  const place = /** @type {WavePlace} */ (places[k]);
  if (place.id !== log.target) {
    keepWaveLog({ ...log, rows: [...log.rows, k] });
    return drawWaveGame();
  }
  keepWaveLog({ ...log, target: '', rows: [] });
  collect('bands', innerWidth / 2, innerHeight / 2, place.id);
  buzz([20, 40, 20, 40, 80]);
  save();
  drawWaveGame();
  setTimeout(() => {
    if (puzzleOpen === WAVE_ID) closePuzzle();
    renderCategory(true);
  }, 1400);
}

// Opens the puzzle screen on the wave game, as openPuzzle (play.js) does for a card's puzzle.
function openWaveGame() {
  if (!puzzleOpen) history.pushState({ puzzle: true, book: !!history.state?.book }, '');
  puzzleOpen = WAVE_ID;
  $('#puzzle-title').replaceChildren('Waves');
  $('#puzzle').classList.toggle('hidden', false);
  keepWaveLog(waveLog());
  drawWaveGame();
}

/**
 * The button under the bands that opens the game, while there is a band left to find and Rainbow is known; any
 * other collection gets none.
 * @param {{ id: string }} collection
 */
const waveButton = collection =>
  collection.id === 'bands' && !setDone('bands') && has('rainbow')
    ? '<button id="wave-game" class="view-toggle">Tune</button>'
    : '';
// The Tune button is drawn anew with the bands: one listener on the page catches every one of them.
document.addEventListener('click', event => {
  if (/** @type {HTMLElement} */ (event.target).closest('#wave-game')) openWaveGame();
});
