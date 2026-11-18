'use strict';

// Updates. The service worker (sw.js) looks for a new build every 30 minutes and whenever the app comes back to
// the front, and once it has cached one it takes over. The game does not swap builds by itself: a dot on the
// settings button and the Update button's label say a new version is ready. Update shows the Updating splash,
// whose bar fills as the worker caches the new build's files (it sends a message for each), then starts it.

/** How long the Updating splash waits for a new worker before it reloads anyway (a slow or broken network). */
const UPDATE_WAIT_MS = 20000;
/** Whether a worker ran this page when it opened: a first install taking over is no update. */
const hadWorker = !!navigator.serviceWorker?.controller;

/** @param {string} id */
const updateEl = id => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * The version a version.js names, when its build is not the one running; '' when it is the same build.
 * @param {string} src
 */
const newVersionIn = src => {
  const build = /BUILD = '([^']+)'/.exec(src)?.[1],
    version = /VERSION = '([^']+)'/.exec(src)?.[1];
  return build && build !== BUILD ? version || build : '';
};

/**
 * Marks the settings button and the Update button: a new version is ready to start.
 * @param {string} version
 */
const showUpdateReady = version => {
  updateEl('settings-btn').querySelector('.dot')?.classList.remove('hidden');
  updateEl('update-btn').classList.toggle('ready', true);
  updateEl('update-btn').replaceChildren(version === VERSION ? 'Update ready' : `Update to ${version}`);
};

// A new worker has taken over: ask it which version it brought.
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (!hadWorker || !updateEl('updating').classList.contains('hidden')) return;
  fetch('version.js', { cache: 'no-store' })
    .then(r => r.text())
    .then(src => newVersionIn(src) && showUpdateReady(newVersionIn(src)))
    .catch(() => showUpdateReady(VERSION));
});

/** @param {number} f 0 to 1 */
const updateBar = f => updateEl('update-fill').style.setProperty('width', `${Math.round(Math.min(1, f) * 100)}%`);

// Update: save, show the splash, fetch the newest build (the bar follows the worker's files), then start it.
const startUpdate = () => {
  save();
  saveThumb(true);
  updateEl('updating').classList.remove('hidden');
  updateBar(0.05);
  const sw = navigator.serviceWorker;
  sw?.addEventListener('message', e => typeof e.data?.updating === 'number' && updateBar(0.05 + 0.9 * e.data.updating));
  const swapped = new Promise(resolve => {
    sw?.addEventListener('controllerchange', resolve);
    setTimeout(resolve, UPDATE_WAIT_MS);
  });
  (sw ? sw.getRegistration() : Promise.resolve(undefined))
    .then(r => r?.update().then(() => (r.installing || r.waiting ? swapped : undefined)))
    .catch(() => {})
    .finally(() => {
      updateBar(1);
      setTimeout(() => location.reload(), 400);
    });
};
updateEl('update-btn').addEventListener('click', startUpdate);
