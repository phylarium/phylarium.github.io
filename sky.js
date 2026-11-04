'use strict';

// The night sky: star signs along the ecliptic band and the planets that wander through them.
// Shared by the scene (drawing, tapping) and the game (the Astronomy pages). No DOM.

// Star signs and planets are in data/sky.yaml.
const STAR_SIGNS = DATA.sky.signs;
const PLANETS = DATA.sky.planets;

const Sky = {
  SIGNS: STAR_SIGNS,
  PLANETS,
  SIGN_W: 24,
  SIGN_H: 16,
  // Is a planet in the sky at this time? `days` is game days since the spin locked, `hour` the time of day.
  planetUp(p, days, hour) {
    if (p.rare && Math.floor(days) % p.rare !== 3) return false;
    if (p.twilight) return (hour >= 18 && hour <= 20.5) || (hour >= 3.5 && hour <= 6);
    return hour >= 18 || hour <= 6;
  },
};

if (typeof module !== 'undefined') Object.assign(module, { exports: Sky }); // for Node (tests and tools)
