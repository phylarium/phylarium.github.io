'use strict';

// Pixel sprites drawn as text grids. Each character is a palette color; '.' is transparent.
const SPRITE_COLORS = {
  k: '#1a1420', d: '#4a4a56', g: '#8a8a96', w: '#f0f0f0', s: '#6a7a8a',
  o: '#ff8a1a', y: '#ffd23f', r: '#d83a2a', b: '#7a4a2a', n: '#c8a070',
  u: '#3a6ad8', c: '#8ad8ff', l: '#4aa84a', m: '#2a6a3a', p: '#f0a0d0',
  h: '#9a8a78', j: '#5a4e48',
};

const SPRITES = {
  tree: [
    '...m...',
    '..mlm..',
    '..mll..',
    '.mlllm.',
    '.mllll.',
    'mllllll',
    '...b...',
    '...b...',
  ],
  cell: [
    '.ccc.',
    'cclcc',
    'clklc',
    'cclcc',
    '.ccc.',
  ],
  algae: [
    '.l..l.',
    '.ll.l.',
    '..lll.',
    '.l.ll.',
    '.llll.',
    '..ll..',
  ],
  jelly: [
    '.ppp.',
    'ppppp',
    'p.p.p',
    '.p.p.',
    'p...p',
  ],
  worm: [
    '.rr...',
    'r..r.r',
    '....rr',
  ],
  bug: [
    '..d.d..',
    '.dnnnd.',
    'dnnnnnd',
    '.dnnnd.',
    'd.d.d.d',
  ],
  fish: [
    '....u..',
    '.uuuu.u',
    'uwuuuuu',
    '.uuuu.u',
    '....u..',
  ],
  plant: [
    '.l.l.l.',
    '..lll..',
    '.l.l.l.',
    '..lll..',
    '...m...',
    '...m...',
  ],
  frog: [
    '.w...w.',
    'lkl.lkl',
    'lllllll',
    '.lllll.',
    'l.l.l.l',
  ],
  coral: [
    '.p...p.',
    '.pp.pp.',
    '..ppp..',
    'p..p..p',
    '.ppppp.',
    '...p...',
  ],
  reeffish: [
    '....y..',
    '.yoyo.y',
    'kyoyoyy',
    '.yoyo.y',
    '....y..',
  ],
  fly: [
    'cc.cc',
    '.ckc.',
    '..k..',
    '..k..',
  ],
  wave: [
    '.uu...uu',
    'u..u.u..',
    '....u...',
    '.uu...uu',
    'u..u.u..',
    '....u...',
  ],
  vent: [
    '..o.o..',
    '...o...',
    '..ddd..',
    '.ddodd.',
    'ddddddd',
  ],
  bolt: [
    '...yy',
    '..yy.',
    '.yyyy',
    '..yy.',
    '.yy..',
    'yy...',
  ],
  cloud: [
    '..www..',
    '.wwwww.',
    'wwwwwww',
    '.u.u.u.',
    'u.u.u..',
  ],
  planet: [
    '...........c',
    '.....nnn..c.',
    '...nnbnnnc..',
    '..nbbnnncnn.',
    '..nnnnccnbn.',
    '..nbnccnnnn.',
    '..ncnnnbbn..',
    '.c.nnnnnn...',
    'c....nnn....',
  ],
  volcano: [
    '.....oro.....',
    '....kdrdk....',
    '...kdddddk...',
    '..kdddgdddk..',
    '.kddgddddddk.',
    'kdddddddgdddk',
  ],
  peak: [
    '......k......',
    '.....khk.....',
    '....khjjk....',
    '...khjjjhk...',
    '..khjjhjjjk..',
    '.khjjjjjhjjk.',
    'khjjhjjjjjjjk',
  ],
  peakSnow: [
    '......k......',
    '.....kwk.....',
    '....kwwwk....',
    '...kwwjwwk...',
    '..khjwhjwjk..',
    '.khjjjjjhjjk.',
    'khjjhjjjjjjjk',
  ],
  volcanoCold: [
    '.............',
    '....kdddk....',
    '...kdddddk...',
    '..kdddgdddk..',
    '.kddgddddddk.',
    'kdddddddgdddk',
  ],
  mountain: [
    '.....k.....',
    '....kwk....',
    '...kwwgk...',
    '..kgdgddk..',
    '.kddgdddgk.',
    'kdddddgdddk',
    'ddgddddddgd',
    'ooroooroooo',
  ],
  flask: [
    '..kkkkk..',
    '...kck...',
    '...kck...',
    '...kck...',
    '..kcccck.',
    '.kclllcck',
    'kclllllck',
    'klllllllk',
    'kllllllck',
    '.kkkkkkk.',
  ],
  gear: [
    '...kdk...',
    '.kkdddkk.',
    '.kdgggdk.',
    'kdggkggdk',
    'ddgk.kgdd',
    'kdggkggdk',
    '.kdgggdk.',
    '.kkdddkk.',
    '...kdk...',
  ],
  globe: [
    '..kkkkk..',
    '.kuulluk.',
    'kullluuuk',
    'kuulluulk',
    'kuuuulllk',
    'kluuuullk',
    'kuluuuuuk',
    '.kuulluk.',
    '..kkkkk..',
  ],
  sunicon: [
    'y..y..y',
    '.yyyyy.',
    '.yoooy.',
    'yyoyoyy',
    '.yoooy.',
    '.yyyyy.',
    'y..y..y',
  ],
};

const Sprites = (() => {
  const canvases = {};
  const icons = {};

  function canvas(id) {
    if (canvases[id]) return canvases[id];
    const rows = SPRITES[id];
    const c = document.createElement('canvas');
    c.width = Math.max(...rows.map(r => r.length));
    c.height = rows.length;
    const g = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!SPRITE_COLORS[ch]) return;
      g.fillStyle = SPRITE_COLORS[ch];
      g.fillRect(x, y, 1, 1);
    }));
    return (canvases[id] = c);
  }

  // Square, centered PNG for list icons (scaled up with CSS pixelated rendering).
  function icon(id) {
    if (icons[id]) return icons[id];
    const src = canvas(id);
    const size = Math.max(src.width, src.height) + 2;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(src, Math.floor((size - src.width) / 2), Math.floor((size - src.height) / 2));
    return (icons[id] = c.toDataURL());
  }

  return { canvas, icon };
})();
