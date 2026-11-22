'use strict';

// The close-up's line about the square in its middle, the one tapped: its biome (data/biomes.yaml, by what covers
// it) and its climate (how warm it is through the year, and wet or dry). Loads after tile-life.js.

/** The biome's name for each cover of the map. */
const BIOME_NAMES = new Map(
  /** @type {{ name: string, cover?: string }[]} */ (DATA.biomes)
    .filter(b => b.cover)
    .map(b => [Terrain.COVER[/** @type {keyof typeof Terrain.COVER} */ (b.cover)], b.name]),
);
/** How warm a square is, by name: from the hot belt round the equator to the poles. */
const WARMTH = /** @type {const} */ ([
  [22, 'Tropical'],
  [14, 'Warm'],
  [4, 'Temperate'],
  [-6, 'Cold'],
]);
/**
 * A square's climate in words: its warmth, and on land whether it is wet or dry.
 * @param {number} temp °C
 * @param {number} zones its climate zones, as bits (Terrain.homes.bit)
 */
const climateOf = (temp, zones) => {
  const bit = Terrain.homes.bit,
    warmth = WARMTH.find(([t]) => temp >= t)?.[1] ?? 'Polar',
    wet = zones & bit.wet ? 'wet' : zones & bit.dry ? 'dry' : '';
  return [warmth, zones & bit.sea ? '' : wet].filter(Boolean).join(', ');
};
/** The line for a square of the map. @param {{ i: number, cover: number }} tile */
const tileInfo = tile => {
  const temp = Terrain.homes.temps[tile.i] ?? 0;
  return [
    BIOME_NAMES.get(tile.cover) ?? 'Land',
    climateOf(temp, Terrain.homes.zones[tile.i] ?? 0),
    `${Math.round(temp)}°C`,
  ].join(' · ');
};

const tileInfoLine = (() => {
  const line = document.createElement('div');
  // oxlint-disable-next-line fp/no-mutation -- the DOM, built once at load
  line.className = 'tiles-info';
  /** @type {HTMLElement} */ (document.getElementById('tiles')).append(line);
  return line;
})();
/** @type {HTMLElement} */ (document.getElementById('tiles')).addEventListener('drawn', () => {
  const model = Tiles.model(),
    middle = model?.tiles.find(t => t.u === model.u % Terrain.TEX_W && t.v === model.v),
    text = middle ? tileInfo(middle) : '';
  // oxlint-disable-next-line fp/no-mutation -- the DOM: set only when the square changes
  if (tileInfoLine.textContent !== text) tileInfoLine.textContent = text;
});
