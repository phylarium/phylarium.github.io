'use strict';

// A raid on the village, played as tower defense (the rules: src/core/humans/raid.js): the road winds down from the
// top to the village at the bottom, waves of creatures walk it, and people stand beside it where the player taps,
// with what the bar below holds (stones, torches, and spears once the village has built for them). Leaving before
// the end lets those already standing fight it out alone. Held, the end shows the buildings to pick one from; lost,
// the village burns. Loads after village-view.js.

const RAID_ART = VILLAGE.art;

const RaidView = (() => {
  const box = document.createElement('div');
  // oxlint-disable-next-line fp/no-mutating-methods -- the DOM, built once at load
  Object.assign(box, { className: 'raid hidden', role: 'dialog' });
  // oxlint-disable-next-line fp/no-mutation -- the DOM, built once at load
  box.innerHTML =
    '<div class="village-head"><span class="raid-stock"></span>' +
    '<button class="book-close raid-close" aria-label="Leave the raid">✕</button></div>' +
    '<div class="raid-field"></div><div class="raid-bar"></div><div class="raid-end hidden"></div>';
  document.body.append(box);
  const field = /** @type {HTMLElement} */ (box.querySelector('.raid-field')),
    q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (box.querySelector(s)),
    sized = (/** @type {number} */ h) => {
      const c = document.createElement('canvas');
      // oxlint-disable-next-line fp/no-mutating-methods -- a new canvas's size, once
      Object.assign(c, { width: RAID_ART.RAID_PIC.w, height: h });
      return c;
    };
  /** The field's layers, back to front (src/adapters/scene-art), and the band of clouds that slides across. */
  const layers = /** @type {Record<import('./src/adapters/scene-art/raid-back.js').RaidLayer, HTMLCanvasElement>} */ (
      Object.fromEntries(RAID_ART.RAID_LAYERS.map(id => [id, sized(RAID_ART.RAID_PIC.h)]))
    ),
    clouds = sized(RAID_ART.CLOUD_BAND);
  field.append(...Object.values(layers));

  /** The raid being played, what is picked to stand, who to tell when it ends, and how the field looks. */
  const play = {
    raid: /** @type {Raid | null} */ (null),
    pick: /** @type {RaidDefender} */ ('stones'),
    last: 0,
    onEnd: /** @type {() => void} */ (() => undefined),
    look: /** @type {ReturnType<typeof RAID_ART.drawBack> | null} */ (null),
    dust: /** @type {readonly import('./src/adapters/scene-art/raid-people.js').Puff[]} */ ([]),
  };
  const isOpen = () => !box.classList.contains('hidden');
  const img = (/** @type {string} */ id) => `<img class="sprite" src="${Sprites.icon(id)}" alt="">`;
  const iconOf = (/** @type {string} */ id) => String(SPECIES_BY_ID[id]?.['icon'] ?? 'spSpider');
  const put = (/** @type {string} */ sel, /** @type {string} */ html) => {
    // oxlint-disable-next-line fp/no-mutation -- the DOM, redrawn only when it changes
    if (q(sel).innerHTML !== html) q(sel).innerHTML = html;
  };

  /** The still layers, at the planet's hour as the raid begins, in the colors found so far. */
  const drawBack = () => {
    const village = theVillage(),
      look = RAID_ART.drawBack(layers, clouds, {
        hour: state.spinLocked ? state.clock % 24 : 12,
        seed: village ? village.u * 31 + village.v : 1,
      });
    [layers.sky, layers.far, layers.edge, layers.ground, clouds].map(c => {
      const g = context2d(c),
        data = g.getImageData(0, 0, c.width, c.height);
      Hues.apply(data.data); // like the planet
      return g.putImageData(data, 0, 0);
    });
    return look;
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

  /** The end of a raid: held, the buildings to pick from (or the way back, with none to pick); lost, the fire. */
  const endHtml = (/** @type {Raid} */ raid) => {
    const village = theVillage(),
      held = raid.done === 'held',
      picks = village?.owed ? villageButtons(village) : '';
    return (
      `<div class="raid-result ${held ? 'held' : 'fell'}">${img(held ? iconOf(raid.top) : 'campfire')}` +
      `<p>${held ? 'Held off' : 'The village burned'}</p>` +
      (picks ? `<div class="village-builds">${picks}</div>` : `<button class="raid-back">${img('village')}</button>`) +
      '</div>'
    );
  };
  /** The raid is over: the village takes what it brought, and the end shows. @param {Raid} raid */
  const end = raid => {
    villageRaidDone(raid);
    const held = raid.done === 'held';
    put('.raid-end', endHtml(raid));
    q('.raid-end').classList.toggle('hidden', false);
    buzz(held ? [20, 40, 20, 40, 60] : [60, 40, 60]);
  };

  const loop = (/** @type {number} */ now) => {
    const raid = play.raid;
    if (!raid || !isOpen()) return;
    const dt = Math.min(0.1, play.last ? (now - play.last) / 1000 : 0),
      next = VILLAGE.raidStep(raid, dt);
    // oxlint-disable-next-line fp/no-mutating-methods -- the one raid being played, moved on once a frame
    Object.assign(play, { raid: next, last: now, dust: RAID_ART.dustAfter(play.dust, raid, next, dt) });
    if (next.lives < raid.lives) buzz(30);
    if (play.look) RAID_ART.drawFrame(layers, clouds, next, { ...play.look, puffs: play.dust, pick: play.pick, now });
    fill(next);
    if (next.done) return end(next);
    return requestAnimationFrame(loop);
  };

  const close = () => {
    box.classList.toggle('hidden', true);
    play.onEnd();
  };
  /** Opens a new raid on the village; `onEnd` hears when the screen closes. @param {() => void} onEnd */
  const open = onEnd => {
    const raid = villageRaid();
    if (!raid) return;
    // oxlint-disable-next-line fp/no-mutating-methods -- the one raid being played, begun
    Object.assign(play, { raid, pick: raid.kinds[0] ?? 'stones', last: 0, onEnd, dust: [], look: drawBack() });
    q('.raid-end').classList.toggle('hidden', true);
    box.classList.toggle('hidden', false);
    requestAnimationFrame(loop);
  };

  /** A tap on the end of a raid: back to the village, with the building picked, if one was. @param {HTMLElement} t */
  const tapEnd = t => {
    const b = /** @type {VillageBuilding | undefined} */ (
      t.closest('[data-build]')?.getAttribute('data-build') ?? undefined
    );
    if (b && villagePick(b)) buzz([10, 20, 10]);
    return b ? theVillage()?.owed || close() : close();
  };

  box.addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target),
      raid = play.raid,
      kind = /** @type {RaidDefender | undefined} */ (t.closest('[data-kind]')?.getAttribute('data-kind') ?? undefined);
    if (t.closest('.raid-back, [data-build]')) return tapEnd(t);
    if (t.closest('.raid-close')) {
      if (raid && !raid.done) end(VILLAGE.playOut(raid)); // left, those standing fight on alone
      return close();
    }
    if (kind && raid) {
      // oxlint-disable-next-line fp/no-mutation -- the one choice the bar holds
      play.pick = kind;
      buzz(6);
      return fill(raid);
    }
    return field.contains(t) && raid && !raid.done ? tapField(e, raid) : undefined;
  });

  /** A tap on the field stands the picked person on the spot there, if one may stand. @param {MouseEvent} e @param {Raid} raid */
  const tapField = (e, raid) => {
    const r = field.getBoundingClientRect(),
      spot = RAID_ART.RAID_PIC.spotAt(
        ((e.clientX - r.left) / r.width) * RAID_ART.RAID_PIC.w,
        ((e.clientY - r.top) / r.height) * RAID_ART.RAID_PIC.h,
      );
    if (spot < 0 || !VILLAGE.canPlace(raid, spot, play.pick)) return undefined;
    // oxlint-disable-next-line fp/no-mutation -- the one raid being played
    play.raid = VILLAGE.place(raid, spot, play.pick);
    return buzz([10, 20, 10]);
  };

  return { open, isOpen };
})();
