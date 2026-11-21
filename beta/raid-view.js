'use strict';

// A raid on the village, played as tower defense (the rules: src/core/humans/raid.js): the road winds down from the
// top to the village at the bottom, waves of creatures walk it, and people stand beside it where the player taps,
// with what the bar below holds (stones, and torches and spears once the village has built for them). Leaving
// before the end lets the raid play itself out. Loads after village-view.js.

const RAID_CELL = 16;
const RAID_SHOT_COLORS = /** @type {const} */ ({ stones: '#9a9a9a', torch: '#ff9a3c', spear: '#e0c890' });

const RaidView = (() => {
  const box = document.createElement('div');
  // oxlint-disable-next-line fp/no-mutating-methods -- the DOM, built once at load
  Object.assign(box, { className: 'raid hidden', role: 'dialog' });
  // oxlint-disable-next-line fp/no-mutation -- the DOM, built once at load
  box.innerHTML =
    '<div class="village-head"><span class="raid-stock"></span>' +
    '<button class="book-close raid-close" aria-label="Leave the raid">✕</button></div>' +
    '<canvas class="raid-field"></canvas><div class="raid-bar"></div><div class="raid-end hidden"></div>';
  document.body.append(box);
  const field = /** @type {HTMLCanvasElement} */ (box.querySelector('.raid-field')),
    q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (box.querySelector(s)),
    W = VILLAGE.RAID_W * RAID_CELL,
    H = (VILLAGE.RAID_H + 2) * RAID_CELL;
  // oxlint-disable-next-line fp/no-mutating-methods -- the canvas's size, once
  Object.assign(field, { width: W, height: H });

  /** The raid being played, what is picked to stand, and who to tell when it ends. */
  const play = {
    raid: /** @type {Raid | null} */ (null),
    pick: /** @type {RaidDefender} */ ('stones'),
    last: 0,
    onEnd: /** @type {() => void} */ (() => undefined),
  };
  const isOpen = () => !box.classList.contains('hidden');
  const img = (/** @type {string} */ id) => `<img class="sprite" src="${Sprites.icon(id)}" alt="">`;
  const iconOf = (/** @type {string} */ id) => String(SPECIES_BY_ID[id]?.['icon'] ?? 'spSpider');
  const put = (/** @type {string} */ sel, /** @type {string} */ html) => {
    // oxlint-disable-next-line fp/no-mutation -- the DOM, redrawn only when it changes
    if (q(sel).innerHTML !== html) q(sel).innerHTML = html;
  };

  /** A sprite standing on a point of the field, in cells. @param {CanvasRenderingContext2D} g @param {string} id @param {number} x @param {number} y */
  const stand = (g, id, x, y) => {
    const s = Sprites.canvas(id);
    g.drawImage(s, Math.round((x + 0.5) * RAID_CELL - s.width / 2), Math.round((y + 0.9) * RAID_CELL - s.height));
  };
  const ROAD_POINTS = Array.from({ length: VILLAGE.ROAD_LEN * 4 + 1 }, (_, n) => VILLAGE.roadAt(n / 4));

  /** The field: ground, the road, the spots, the village, the people, the creatures and the blows. @param {Raid} raid */
  const draw = raid => {
    const g = context2d(field),
      village = theVillage();
    // oxlint-disable-next-line fp/no-mutation -- the canvas, drawn once a frame while the raid is open
    g.fillStyle = (village?.land.forest ?? 0) > 0.4 ? '#3f6b2a' : '#6f9a3c';
    g.fillRect(0, 0, W, H);
    // oxlint-disable-next-line fp/no-mutation -- the canvas
    g.fillStyle = '#8a6a44';
    ROAD_POINTS.map(p => g.fillRect(Math.round(p.x) * RAID_CELL, Math.round(p.y) * RAID_CELL, RAID_CELL, RAID_CELL));
    // oxlint-disable-next-line fp/no-mutation -- the canvas
    g.fillStyle = 'rgba(0, 0, 0, 0.18)';
    VILLAGE.SPOTS.map(s => g.fillRect(s.x * RAID_CELL + 3, s.y * RAID_CELL + 3, RAID_CELL - 6, RAID_CELL - 6));
    [1, 3, 5].map((x, n) => stand(g, n === 1 ? 'village' : 'hut', x, VILLAGE.RAID_H + 0.6));
    raid.men.map(m => {
      const s = VILLAGE.SPOTS[m.spot];
      return s && stand(g, VILLAGE.DEFENDERS[m.kind].icon, s.x, s.y);
    });
    raid.foes.map(o => {
      const p = VILLAGE.roadAt(o.d);
      stand(g, iconOf(o.id), p.x, p.y);
      // oxlint-disable-next-line fp/no-mutation -- the canvas
      g.fillStyle = '#e04040';
      return g.fillRect(
        Math.round(p.x * RAID_CELL + 2),
        Math.round((p.y + 1) * RAID_CELL - 2),
        Math.round(12 * (o.hp / o.max)),
        1,
      );
    });
    raid.shots.map(s => {
      const from = VILLAGE.SPOTS[s.spot] ?? { x: 0, y: 0 };
      // oxlint-disable-next-line fp/no-mutation -- the canvas
      g.strokeStyle = RAID_SHOT_COLORS[s.kind];
      g.beginPath();
      g.moveTo((from.x + 0.5) * RAID_CELL, (from.y + 0.5) * RAID_CELL);
      g.lineTo((s.x + 0.5) * RAID_CELL, (s.y + 0.5) * RAID_CELL);
      return g.stroke();
    });
    const data = g.getImageData(0, 0, W, H);
    Hues.apply(data.data); // in the colors found so far, like the planet
    g.putImageData(data, 0, 0);
  };

  /** The bar and the head as the raid is now. @param {Raid} raid */
  const fill = raid => {
    put(
      '.raid-stock',
      `${img('hut')}${raid.lives} ${img('thumb')}${Math.floor(raid.hands)} ` +
        `${img(iconOf(raid.top))}${VILLAGE.waveNow(raid)}/${raid.waves}`,
    );
    put(
      '.raid-bar',
      raid.kinds
        .map(
          k =>
            `<button class="camp-pick${play.pick === k ? ' on' : ''}" data-kind="${k}"` +
            `${raid.hands >= VILLAGE.DEFENDERS[k].cost ? '' : ' disabled'}>${img(VILLAGE.DEFENDERS[k].icon)}` +
            `<span>${VILLAGE.DEFENDERS[k].cost}</span></button>`,
        )
        .join(''),
    );
  };

  /** The raid is over: the village takes what it brought, and the end shows. @param {Raid} raid @param {boolean} auto */
  const end = (raid, auto) => {
    villageRaidDone(raid, auto);
    const held = raid.done === 'held';
    put(
      '.raid-end',
      `<div class="raid-result ${held ? 'held' : 'fell'}">${img(iconOf(raid.top))}` +
        `<p>${held ? 'Held off' : 'The village fell'}</p><button class="raid-back">${img('village')}</button></div>`,
    );
    q('.raid-end').classList.toggle('hidden', false);
    buzz(held ? [20, 40, 20, 40, 60] : [60, 40, 60]);
  };

  const loop = (/** @type {number} */ now) => {
    const raid = play.raid;
    if (!raid || !isOpen()) return;
    const dt = Math.min(0.1, play.last ? (now - play.last) / 1000 : 0),
      next = VILLAGE.raidStep(raid, dt);
    // oxlint-disable-next-line fp/no-mutating-methods -- the one raid being played, moved on once a frame
    Object.assign(play, { raid: next, last: now });
    if (next.lives < raid.lives) buzz(30);
    draw(next);
    fill(next);
    if (next.done) return end(next, false);
    return requestAnimationFrame(loop);
  };

  const close = () => {
    box.classList.toggle('hidden', true);
    // oxlint-disable-next-line fp/no-mutation -- the game's flag: no raid is being played
    raidPlaying.on = false;
    play.onEnd();
  };
  /** Opens a new raid on the village; `onEnd` hears when the screen closes. @param {() => void} onEnd */
  const open = onEnd => {
    const raid = villageRaid();
    if (!raid) return;
    // oxlint-disable-next-line fp/no-mutating-methods -- the one raid being played, begun
    Object.assign(play, { raid, pick: raid.kinds[0] ?? 'stones', last: 0, onEnd });
    // oxlint-disable-next-line fp/no-mutation -- the game's flag: a raid is being played
    raidPlaying.on = true;
    q('.raid-end').classList.toggle('hidden', true);
    box.classList.toggle('hidden', false);
    requestAnimationFrame(loop);
  };

  box.addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target),
      raid = play.raid,
      kind = /** @type {RaidDefender | undefined} */ (t.closest('[data-kind]')?.getAttribute('data-kind') ?? undefined);
    if (t.closest('.raid-back')) return close();
    if (t.closest('.raid-close')) {
      if (raid && !raid.done) end(VILLAGE.autoRaid(raid), true); // left alone, it plays itself out
      return close();
    }
    if (kind && raid) {
      // oxlint-disable-next-line fp/no-mutation -- the one choice the bar holds
      play.pick = kind;
      buzz(6);
      return fill(raid);
    }
    return t === field && raid && !raid.done ? tapField(e, raid) : undefined;
  });

  /** A tap on the field stands the picked person on the spot there, if one may stand. @param {MouseEvent} e @param {Raid} raid */
  const tapField = (e, raid) => {
    const r = field.getBoundingClientRect(),
      x = Math.floor(((e.clientX - r.left) / r.width) * VILLAGE.RAID_W),
      y = Math.floor(((e.clientY - r.top) / r.height) * (VILLAGE.RAID_H + 2)),
      spot = VILLAGE.SPOTS.findIndex((/** @type {{ x: number, y: number }} */ s) => s.x === x && s.y === y);
    if (spot < 0 || !VILLAGE.canPlace(raid, spot, play.pick)) return undefined;
    // oxlint-disable-next-line fp/no-mutation -- the one raid being played
    play.raid = VILLAGE.place(raid, spot, play.pick);
    return buzz([10, 20, 10]);
  };

  return { open, isOpen };
})();
