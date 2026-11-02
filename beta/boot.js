'use strict';

// Loads the game's content from data/*.yaml into DATA, then starts the scripts that use it.
// A file that does not parse shows its error on screen instead of a broken game.
const DATA_FILES = ['book', 'research', 'species', 'stories', 'disasters', 'atoms', 'laws', 'sky', 'collections'];
const GAME_SCRIPTS = ['sky.js', 'scene.js', 'game.js'];
const DATA = {};

(async () => {
  try {
    await Promise.all(DATA_FILES.map(async name => {
      const res = await fetch(`data/${name}.yaml`);
      if (!res.ok) throw new Error(`data/${name}.yaml: ${res.status}`);
      try {
        DATA[name] = jsyaml.load(await res.text());
      } catch (e) {
        throw new Error(`data/${name}.yaml: ${e.message}`);
      }
    }));
  } catch (e) {
    const box = document.createElement('pre');
    box.className = 'data-error';
    box.textContent = `Could not load the game data.\n\n${e.message}`;
    document.body.appendChild(box);
    console.error(e);
    return;
  }
  for (const src of GAME_SCRIPTS) {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;   // run in order
    document.body.appendChild(s);
  }
})();
