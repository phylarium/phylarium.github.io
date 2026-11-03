'use strict';

// Loads the game's content from data/*.yaml into DATA, then starts the scripts that use it.
// A file that does not load or parse shows its error on screen, with a retry, instead of a broken game.
// sw.js caches the same files: the smoke test checks the two lists agree.
const DATA_FILES = ['book', 'research', 'species', 'stories', 'disasters', 'atoms', 'laws', 'sky', 'collections'];
const GAME_SCRIPTS = ['sky.js', 'scene.js', 'puzzles.js', 'game.js', 'play.js', 'book.js', 'main.js'];
const DATA = {};
// Every file of one build asks for that build, so a new file is never run with an old one from a cache.
const BUILD_QUERY = `?v=${BUILD}`;

function showBootError(message) {
  if (document.querySelector('.data-error.boot')) return;   // the first problem is enough
  const box = document.createElement('pre');
  box.className = 'data-error boot';
  box.textContent = `${message}\n\n`;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => location.reload());
  box.appendChild(retry);
  document.body.appendChild(box);
}

(async () => {
  try {
    await Promise.all(DATA_FILES.map(async name => {
      const res = await fetch(`data/${name}.yaml${BUILD_QUERY}`);
      if (!res.ok) throw new Error(`data/${name}.yaml: ${res.status}`);
      try {
        DATA[name] = jsyaml.load(await res.text());
      } catch (e) {
        throw new Error(`data/${name}.yaml: ${e.message}`, { cause: e });
      }
    }));
  } catch (e) {
    showBootError(`Could not load the game data.\n\n${e.message}`);
    console.error(e);
    return;
  }
  for (const src of GAME_SCRIPTS) {
    const s = document.createElement('script');
    s.src = src + BUILD_QUERY;
    s.async = false;   // run in order
    s.onerror = () => {
      showBootError(`Could not load the game (${src}).\nCheck the connection and try again.`);
      console.error(`Could not load ${src}`);
    };
    document.body.appendChild(s);
  }
})();
