'use strict';

// The bar at the foot of every menu (the book, the lab, the computer, the settings): a button to the page before
// and one to the page after, with the page's number between them. Pages can still be swiped; the buttons are for
// when a swipe is awkward. This file also keeps a story's tree (Stories page) as wide as the page and no wider,
// so nothing in a menu scrolls sideways by itself and takes the swipe.
// And it dresses the puzzle screen like the place it was opened from: paper for the lab's games (the molecules,
// the waves), the dark page for the book's.
// Loads after book.js. It only reads the menu's boxes: whichever row of pages is on screen is the one it turns.

/** The row of pages on screen now: the book's or the lab's pages, or the computer's screens. */
const menuTrack = () =>
  /** @type {HTMLElement | undefined} */ (
    [...document.querySelectorAll('#book .poster-track, #book #cat-climate.active')].find(
      el => /** @type {HTMLElement} */ (el).offsetParent !== null,
    )
  );
/** How many pages the row shows. @param {HTMLElement} track */
const menuPages = track =>
  [...track.children].filter(
    el => el.matches('.poster-slide, .section') && /** @type {HTMLElement} */ (el).offsetParent !== null,
  ).length;
/** The number of the page in view, from 0. @param {HTMLElement} track */
const menuAt = track => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));

/** To the page before (-1) or after (1). @param {number} by */
function turnMenuPage(by) {
  const track = menuTrack();
  if (track) track.scrollTo({ left: (menuAt(track) + by) * track.clientWidth, behavior: 'smooth' });
}

// A story's tree is drawn at a fixed width: shrink it to the page when the page is narrower.
function fitStoryTrees() {
  // oxlint-disable-next-line unicorn/no-array-for-each -- sizing boxes on the page is an effect
  document.querySelectorAll('#book .story-tree').forEach(tree => {
    const box = /** @type {HTMLElement} */ (tree),
      room = box.parentElement?.clientWidth ?? 0,
      width = Number.parseFloat(box.style.width);
    if (room > 0 && width > 0) box.style.setProperty('zoom', String(Math.min(1, room / width)));
  });
}

// The buttons go dim at the first and the last page, and the count says where the page is.
function updateMenuNav() {
  const track = menuTrack(),
    pages = track ? menuPages(track) : 1,
    at = track ? Math.min(menuAt(track), pages - 1) : 0;
  $('#page-prev').toggleAttribute('disabled', at <= 0);
  $('#page-next').toggleAttribute('disabled', at >= pages - 1);
  // Written only when it changes: this runs on every change inside the menu, its own included.
  const count = pages > 1 ? `${at + 1} / ${pages}` : '';
  if ($('#page-count').textContent !== count) $('#page-count').replaceChildren(count);
  fitStoryTrees();
}

$('#page-prev').addEventListener('click', () => turnMenuPage(-1));
$('#page-next').addEventListener('click', () => turnMenuPage(1));
// Scrolling does not bubble: listen on the way down, for whichever row is turned.
$('#book').addEventListener('scroll', updateMenuNav, true);
// A menu opening, closing or changing kind, and a page drawn anew, change what the bar should say.
new MutationObserver(updateMenuNav).observe($('#book'), {
  attributes: true,
  attributeFilter: ['class', 'data-mode'],
  childList: true,
  subtree: true,
});

// The puzzle screen wears the lab's paper when its game belongs to the lab, the book's dark page otherwise.
function dressPuzzle() {
  const card = RESEARCH_BY_ID[puzzleOpen ?? ''];
  const lab = !!puzzleOpen && (!card || LAB_SECTIONS.includes(card['tab']));
  if ($('#puzzle').getAttribute('data-skin') !== (lab ? 'lab' : 'book'))
    $('#puzzle').setAttribute('data-skin', lab ? 'lab' : 'book');
}
new MutationObserver(dressPuzzle).observe($('#puzzle'), { attributes: true, attributeFilter: ['class'] });
