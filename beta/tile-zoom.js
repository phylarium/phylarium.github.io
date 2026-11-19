'use strict';

// Zoom in the close-up (tiles.js), to look closer and find who lives there: two fingers pinch, a mouse wheel
// turns, and one finger or the mouse drags the zoomed square about. A drag or a pinch is no tap: it neither finds
// anyone nor closes the view. Each square opens unzoomed. Loads after tile-life.js.

/** How far in it zooms at most, and how far a finger moves before a touch is a drag (CSS pixels). */
const ZOOM_MAX = 4,
  DRAG_PX = 6;

/**
 * Where each finger is and where it went down; the zoom and how far the square is moved; a pinch's start.
 * @typedef {{ x: number, y: number, sx: number, sy: number }} ZoomFinger
 * @typedef {{ z: number, x: number, y: number, at: Record<string, ZoomFinger>, pinch: { d: number, z: number } | null,
 *   dragged: boolean, square: string }} ZoomState
 */
/** @type {ZoomState} */
const ZOOM_NONE = Object.freeze({ z: 1, x: 0, y: 0, at: {}, pinch: null, dragged: false, square: '' });

/**
 * Keeps the zoomed square on the screen.
 * @param {ZoomState} s
 * @param {{ w: number, h: number }} size the square's size on the screen unzoomed
 */
const zoomClamp = (s, size) => {
  const z = Math.min(ZOOM_MAX, Math.max(1, s.z)),
    mx = ((z - 1) * size.w) / 2,
    my = ((z - 1) * size.h) / 2;
  return { ...s, z, x: Math.max(-mx, Math.min(mx, s.x)), y: Math.max(-my, Math.min(my, s.y)) };
};

/**
 * The zoom set to z, keeping what is under the point (px, py), measured from the middle of the screen, there.
 * @param {ZoomState} s
 * @param {number} z
 * @param {{ x: number, y: number }} p
 * @param {{ w: number, h: number }} size
 */
const zoomAt = (s, z, p, size) => {
  const k = Math.min(ZOOM_MAX, Math.max(1, z)) / s.z;
  return zoomClamp({ ...s, z: s.z * k, x: p.x - (p.x - s.x) * k, y: p.y - (p.y - s.y) * k }, size);
};

/** @param {readonly ZoomFinger[]} f */
const fingerGap = f =>
  f.length < 2 ? 0 : Math.hypot((f[0]?.x ?? 0) - (f[1]?.x ?? 0), (f[0]?.y ?? 0) - (f[1]?.y ?? 0));
/** @param {readonly ZoomFinger[]} f */
const fingerMid = f => ({
  x: f.reduce((n, p) => n + p.x, 0) / Math.max(1, f.length) - innerWidth / 2,
  y: f.reduce((n, p) => n + p.y, 0) / Math.max(1, f.length) - innerHeight / 2,
});

/**
 * The zoom after a finger or the mouse moved to (x, y): a pinch zooms about the fingers' middle, one finger drags.
 * @param {ZoomState} s
 * @param {string} id
 * @param {{ x: number, y: number }} p
 * @param {{ w: number, h: number }} size
 * @returns {ZoomState}
 */
const zoomMoved = (s, id, p, size) => {
  const was = s.at[id];
  if (!was) return s;
  const at = { ...s.at, [id]: { ...was, x: p.x, y: p.y } },
    fingers = Object.values(at);
  if (s.pinch && fingers.length >= 2)
    return {
      ...zoomAt({ ...s, at }, (s.pinch.z * fingerGap(fingers)) / s.pinch.d, fingerMid(fingers), size),
      dragged: true,
    };
  const far = Math.hypot(p.x - was.sx, p.y - was.sy) > DRAG_PX;
  if (s.z <= 1 || !(far || s.dragged)) return { ...s, at };
  return { ...zoomClamp({ ...s, at, x: s.x + p.x - was.x, y: s.y + p.y - was.y }, size), dragged: true };
};

/** @type {ZoomState} */
// oxlint-disable-next-line fp/no-let -- the one zoom of the close-up on show
let tileZoom = ZOOM_NONE;
const zoomSize = () => ({ w: tileCanvas.offsetWidth, h: tileCanvas.offsetHeight });
/** @param {ZoomState} s */
const setZoom = s => {
  tileZoom = s;
  tileCanvas.style.setProperty('transform', s.z > 1 ? `translate(${s.x}px, ${s.y}px) scale(${s.z})` : '');
};

// A square opens unzoomed: a new spot, or the view opening again.
tileLayer.addEventListener('drawn', () => {
  const m = Tiles.model(),
    square = m ? `${m.u},${m.v}` : '';
  if (square !== tileZoom.square || tileLayer.classList.contains('hidden')) setZoom({ ...ZOOM_NONE, square });
});
tileLayer.addEventListener('pointerdown', e => {
  const at = { ...tileZoom.at, [e.pointerId]: { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY } },
    fingers = Object.values(at),
    first = fingers.length === 1;
  setZoom({
    ...tileZoom,
    at,
    dragged: first ? false : tileZoom.dragged,
    pinch: fingers.length === 2 ? { d: Math.max(1, fingerGap(fingers)), z: tileZoom.z } : tileZoom.pinch,
  });
});
tileLayer.addEventListener('pointermove', e =>
  setZoom(zoomMoved(tileZoom, String(e.pointerId), { x: e.clientX, y: e.clientY }, zoomSize())),
);
/** @param {PointerEvent} e */
const fingerUp = e => {
  const at = Object.fromEntries(Object.entries(tileZoom.at).filter(([id]) => id !== String(e.pointerId)));
  setZoom({ ...tileZoom, at, pinch: Object.keys(at).length >= 2 ? tileZoom.pinch : null });
};
tileLayer.addEventListener('pointerup', fingerUp);
tileLayer.addEventListener('pointercancel', fingerUp);
// The click that ends a drag or a pinch goes no further: not to the tiles (closing) nor to who lives there.
tileLayer.addEventListener(
  'click',
  e => {
    if (!tileZoom.dragged) return;
    e.stopImmediatePropagation();
    setZoom({ ...tileZoom, dragged: false });
  },
  true,
);
tileLayer.addEventListener(
  'wheel',
  e => {
    e.preventDefault();
    const p = { x: e.clientX - innerWidth / 2, y: e.clientY - innerHeight / 2 };
    setZoom(zoomAt(tileZoom, tileZoom.z * Math.exp(-e.deltaY * 0.0015), p, zoomSize()));
  },
  { passive: false },
);
