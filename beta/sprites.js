'use strict';

// Pixel sprites drawn as text grids. Each character is a palette color; '.' is transparent.
const SPRITE_COLORS = {
  k: '#1a1420', d: '#4a4a56', g: '#8a8a96', w: '#f0f0f0', s: '#6a7a8a',
  o: '#ff8a1a', y: '#ffd23f', r: '#d83a2a', b: '#7a4a2a', n: '#c8a070',
  u: '#3a6ad8', c: '#8ad8ff', l: '#4aa84a', m: '#2a6a3a', p: '#f0a0d0',
  h: '#9a8a78', j: '#5a4e48',
  v: '#b07aff', i: '#7af0a0', e: '#ff6a3a',
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
  book: [
    '.kkkkkkkkkk.',
    'krrrrrrrrrwk',
    'kryyyyyyrrwk',
    'krrrrrrrrrwk',
    'krryyyyrrrwk',
    'krrrrrrrrrwk',
    'krrrrrrrrrwk',
    'krrrrrrrrrwk',
    'krrrrrrrrrwk',
    'kkkkkkkkkkwk',
    '.kwwwwwwwwwk',
    '..kkkkkkkkk.',
  ],
  // Science book tab icons: dark glyphs drawn on the chapter's color (light on the black Space tab).
  subjectSpace: [
    'g...wwww...',
    '..www...wwc',
    '..w..www...',
    '.ww.ww.ww..',
    '.ww.yyy.ww.',
    '..ww.ww.ww.',
    '...www..w..',
    'cww...www..',
    '...wwww...g',
  ],
  subjectAtmosphere: [
    '...kk....',
    '..kkkk.k.',
    '.kkkkkkkk',
    'kkkkkkkkk',
    '.........',
    '.k..k..k.',
    'k..k..k..',
  ],
  subjectMountains: [
    '...k....',
    '..kkk...',
    '..kkk.k.',
    '.kkkkkkk',
    '.kkkkkkk',
    'kkkkkkkk',
  ],
  subjectLand: [
    '..kkk..',
    '.kkkkk.',
    'kkkkkkk',
    '.kkkkk.',
    '...k...',
    '...k...',
    'kkkkkkk',
  ],
  subjectOcean: [
    '.kk..kk..',
    'k..kk..kk',
    '.........',
    '.kk..kk..',
    'k..kk..kk',
    '.........',
    '.kk..kk..',
    'k..kk..kk',
  ],
  subjectCore: [
    '..kkk..',
    '.k...k.',
    'k.kkk.k',
    'k.kkk.k',
    'k.kkk.k',
    '.k...k.',
    '..kkk..',
  ],
  subjectStories: [
    '.kkkkk.',
    'kk...kk',
    'k.kkk.k',
    'k.....k',
    'k.kkk.k',
    'k.....k',
    'kkkkkkk',
  ],
  subjectScience: [
    '..kkk..',
    '...k...',
    '...k...',
    '..kkk..',
    '.kkkkk.',
    'kkkkkkk',
    'kkkkkkk',
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
  // Noble gases: discharge tubes in their glow colors.
  gasHelium: [
    '..ddd..',
    '..gpg..',
    '.gpppg.',
    '.gpwpg.',
    '.gpppg.',
    '.gpppg.',
    '.gpwpg.',
    '.gpppg.',
    '..gpg..',
    '..ddd..',
  ],
  gasNeon: [
    '..ddd..',
    '..geg..',
    '.geeeg.',
    '.geweg.',
    '.geeeg.',
    '.geeeg.',
    '.geweg.',
    '.geeeg.',
    '..geg..',
    '..ddd..',
  ],
  gasArgon: [
    '..ddd..',
    '..gvg..',
    '.gvvvg.',
    '.gvwvg.',
    '.gvvvg.',
    '.gvvvg.',
    '.gvwvg.',
    '.gvvvg.',
    '..gvg..',
    '..ddd..',
  ],
  gasKrypton: [
    '..ddd..',
    '..gcg..',
    '.gcccg.',
    '.gcwcg.',
    '.gcccg.',
    '.gcccg.',
    '.gcwcg.',
    '.gcccg.',
    '..gcg..',
    '..ddd..',
  ],
  gasXenon: [
    '..ddd..',
    '..gug..',
    '.guuug.',
    '.guwug.',
    '.guuug.',
    '.guuug.',
    '.guwug.',
    '.guuug.',
    '..gug..',
    '..ddd..',
  ],
  gasRadon: [
    '..ddd..',
    '..gig..',
    '.giiig.',
    '.giwig.',
    '.giiig.',
    '.giiig.',
    '.giwig.',
    '.giiig.',
    '..gig..',
    '..ddd..',
  ],
  // Molecules: atoms as balls, bonds in grey.
  molN2: [
    '.uu....uu.',
    'uwuugguwuu',
    'uuuugguuuu',
    '.uu....uu.',
  ],
  molH2: [
    '.ww..ww.',
    'wwwggwww',
    'wwwggwww',
    '.ww..ww.',
  ],
  molNH3: [
    'ww....ww',
    'ww.uu.ww',
    '..guug..',
    '.uuuuuu.',
    '..uuuu..',
    '...gg...',
    '...ww...',
    '...ww...',
  ],
  rnaStrand: [
    'r.....',
    '.ryy..',
    '..r...',
    '..ul..',
    '...r..',
    '..yr..',
    '...r..',
    '..lu..',
    '..r...',
  ],
  molO2: [
    '.rr....rr.',
    'rwrrggrwrr',
    'rrrrggrrrr',
    '.rr....rr.',
  ],
  molO3: [
    '....rr.....',
    '...rwrr....',
    '...rrrr....',
    '.rrgrr.grr.',
    'rwrr...rwrr',
    'rrrr...rrrr',
    '.rr.....rr.',
  ],
  molH2O: [
    '...rr....',
    '..rwrr...',
    '..rrrr...',
    '.w.rr.w..',
    'wcw..wcw.',
    '.w....w..',
  ],
  molCO2: [
    '.rr...dd...rr.',
    'rwrrgdwddgrwrr',
    'rrrrgddddgrrrr',
    '.rr...dd...rr.',
  ],
  molCH4: [
    'ww....ww',
    'ww....ww',
    '..gddg..',
    '..dwdd..',
    '..dddd..',
    '..gddg..',
    'ww....ww',
    'ww....ww',
  ],
  // Gases in the air: the molecule above a curved horizon.
  airN2: [
    '............',
    '..uu....uu..',
    '.uwuugguwuu.',
    '.uuuugguuuu.',
    '..uu....uu..',
    '............',
    '............',
    '....cccc....',
    '..cc....cc..',
    '.c........c.',
    'c..........c',
  ],
  airCH4: [
    '............',
    '....w..w....',
    '.....dd.....',
    '....dddd....',
    '.....dd.....',
    '....w..w....',
    '............',
    '....cccc....',
    '..cc....cc..',
    '.c........c.',
    'c..........c',
  ],
  airCO2: [
    '................',
    '..rr...dd...rr..',
    '.rwrrgdwddgrwrr.',
    '.rrrrgddddgrrrr.',
    '..rr...dd...rr..',
    '................',
    '................',
    '......cccc......',
    '....cc....cc....',
    '...c........c...',
    '..c..........c..',
  ],
  // The ozone layer stops sunlight above the planet.
  ozone: [
    'y...y...y..',
    '.y..y..y...',
    '..y.y.y....',
    'vvvvvvvvvvv',
    'v.v.v.v.v.v',
    '...........',
    '....lll....',
    '..llmllll..',
    '.llllllmll.',
  ],
  // The water cycle.
  puff: [
    '...www....',
    '..wwwww.w.',
    '.wwwwwwwww',
    'wwwwwwwwww',
    '.cccccccc.',
  ],
  steam: [
    '.w...w...w.',
    'w...w...w..',
    '.w...w...w.',
    '..w...w...w',
    '...........',
    'uuuuuuuuuuu',
    'ucuuucuuucu',
    'uuuuuuuuuuu',
  ],
  rain: [
    '..www....',
    '.wwwwwww.',
    'wwwwwwwww',
    '.u..u..u.',
    'u..u..u..',
    '..u..u..u',
  ],
  downpour: [
    '..ggg....',
    '.ggggggg.',
    'gdgggggdg',
    'ddddddddd',
    'u.u.u.u.u',
    '.u.u.u.u.',
    'u.u.u.u.u',
    '.u.u.u.u.',
  ],
  // The night sky and space.
  star: [
    '....y....',
    '....y....',
    '...yyy...',
    'yyyywyyyy',
    '...yyy...',
    '....y....',
    '....y....',
    '.w.....w.',
  ],
  comet: [
    '........ww',
    '......cwww',
    '.....ccww.',
    '...cccc...',
    '..ccc.....',
    '.cc.......',
    'c.........',
  ],
  constellation: [
    'w.........',
    '.u........',
    '..u....w..',
    '...w..u...',
    '...u.u....',
    '...uw.....',
    '..u..u....',
    '.w....w...',
  ],
  wanderer: [
    '.w.......w',
    '......w...',
    '..w.......',
    '....oo...w',
    '...oooo...',
    'w..oooo..w',
    '....oo....',
    '.w.....w..',
  ],
  cometpath: [
    '...c.c.c..',
    '.c.......c',
    'c...yy....',
    '...yyyy..w',
    'c..yyyy.ww',
    '....yy....',
    '.c.......c',
    '...c.c.c..',
  ],
  orbit: [
    '...g.g.g....',
    '.g.......g..',
    'g...g.g...g.',
    '..g..yy..g.o',
    'g...yyyy...g',
    '.g..yyyy..g.',
    'u.g..yy..g.g',
    '.g..g.g..g..',
    '...g.g.g.g..',
  ],
  asteroid: [
    '.hhh......',
    'hjhhh..hh.',
    'hhhjh.hjh.',
    '.hhh..hh..',
    '....hh....',
    '...hjhh..h',
    '...hhhh.hj',
    '....hh..h.',
  ],
  // One sprite per species and research node.
  cyano: [
    '.l.l.l.',
    'lmlmlml',
    '.l.l.l.',
  ],
  sponge: [
    '.o.o.',
    'ooooo',
    'oyoyo',
    'ooooo',
    'oyoyo',
    '.ooo.',
  ],
  plankton: [
    'l...c.',
    '..l...',
    'c...l.',
    '.l..c.',
    '...l..',
  ],
  moss: [
    '.l.l.l.',
    'lmlmlml',
    'mmmmmmm',
  ],
  chordate: [
    '..nnnn..',
    'nknnnnnn',
    '..nnnn.n',
  ],
  lobefin: [
    '....h..',
    '.hhhh.h',
    'hwhhhhh',
    '.hhhh.h',
    '.h.h...',
  ],
  shark: [
    '...g....',
    '..gg...g',
    '.gggggg.',
    'gkggwwgg',
    '.gwwww.g',
  ],
  trilobite: [
    '.hhh.',
    'hjhjh',
    'hhhhh',
    'hjhjh',
    'hhhhh',
    '.h.h.',
  ],
  insect: [
    '.g...g.',
    '..gbg..',
    'g.bbb.g',
    '.gbbbg.',
    'g.bbb.g',
    '..bbb..',
  ],
  lizard: [
    '......mm',
    '.mmmmmmk',
    'm.m..m..',
    '.m......',
  ],
  sunYoung: [
    'o..o..o',
    '.ooooo.',
    '.orrro.',
    'oororoo',
    '.orrro.',
    '.ooooo.',
    'o..o..o',
  ],
  sunMain: [
    'y...y...y',
    '.y.yyy.y.',
    '..yyyyy..',
    '.yyyoyyy.',
    'yyyowoyyy',
    '.yyyoyyy.',
    '..yyyyy..',
    '.y.yyy.y.',
    'y...y...y',
  ],
  sunMature: [
    '....y....',
    '.y.yyy.y.',
    '..yywyy..',
    '.yywwwyy.',
    'yywwwwwyy',
    '.yywwwyy.',
    '..yywyy..',
    '.y.yyy.y.',
    '....y....',
  ],
  uv: [
    '..yyy..',
    '.yyyyy.',
    '..yyy..',
    '.v.v.v.',
    'v..v..v',
    '..v.v..',
    'v..v..v',
  ],
  solarWind: [
    '.yy......',
    'yyyy.c.c.',
    'yyyy..c.c',
    '.yy.c.c..',
  ],
  tide: [
    '....ww..',
    '...w....',
    '...w....',
    '....ww..',
    '.uu...uu',
    'u..u.u..',
  ],
  pool: [
    '.hhh.hh.',
    'h.cccc.h',
    'hccuccch',
    'h.cccc.h',
    '.hhhhhh.',
  ],
  tilt: [
    '.......w',
    '...uuuw.',
    '..uulwuu',
    '.uulwluu',
    '.uuwluu.',
    '..wuuu..',
    '.w......',
  ],
  river: [
    'llllucll',
    'lllucll.',
    'llucllll',
    'lluclll.',
    'lllucll.',
    'llllucl.',
  ],
  lake: [
    '.llllll.',
    'llucccll',
    'lucccccl',
    'llucccll',
    '.llllll.',
  ],
  shallows: [
    'cucucucu',
    'cccccccc',
    'ccpccccc',
    'cpppccpc',
    'nnnnnnnn',
  ],
  rainbow: [
    '...rrrrrrr...',
    '..rooooooor..',
    '.rooyyyyyoor.',
    '.royylllyyor.',
    'roylluuullyor',
    'roylu...ulyor',
    'wwwlu...ulwww',
  ],
  lightRed: [
    '...r...',
    '.r.r.r.',
    '..rrr..',
    'rrrwrrr',
    '..rrr..',
    '.r.r.r.',
    '...r...',
  ],
  lightOrange: [
    '...o...',
    '.o.o.o.',
    '..ooo..',
    'ooowooo',
    '..ooo..',
    '.o.o.o.',
    '...o...',
  ],
  lightYellow: [
    '...y...',
    '.y.y.y.',
    '..yyy..',
    'yyywyyy',
    '..yyy..',
    '.y.y.y.',
    '...y...',
  ],
  lightGreen: [
    '...l...',
    '.l.l.l.',
    '..lll..',
    'lllwlll',
    '..lll..',
    '.l.l.l.',
    '...l...',
  ],
  lightBlue: [
    '...u...',
    '.u.u.u.',
    '..uuu..',
    'uuuwuuu',
    '..uuu..',
    '.u.u.u.',
    '...u...',
  ],
  lightViolet: [
    '...v...',
    '.v.v.v.',
    '..vvv..',
    'vvvwvvv',
    '..vvv..',
    '.v.v.v.',
    '...v...',
  ],
  moonlight: [
    '..wwg....',
    '.wwg.....',
    'wwg...g..',
    'wwg......',
    'wwg..g...',
    '.wwg.....',
    '..wwg..g.',
    'cc.c.c.cc',
  ],
  circadian: [
    '..yyy..',
    '.y.y.yy',
    'y..y..y',
    'y..yyyy',
    'g.....g',
    '.g...g.',
    '..ggg..',
  ],
  predator: [
    '....d.....',
    '...dd.....',
    '.dddddddd.',
    'ddwdddddds',
    '.ggggggg..',
    '...g......',
  ],
  eclipse: [
    '..y.y.y..',
    '.yykkkyy.',
    'y.kkkkk.y',
    '.ykkkkky.',
    'y.kkkkk.y',
    '.yykkkyy.',
    '..y.y.y..',
  ],
  waves: [
    '...ww.....',
    '..wccw....',
    '.wcuucw..w',
    'wcuuuucwwc',
    'uuuuuuuucu',
    'uuuuuuuuuu',
  ],
  bloom: [
    'cc.cc.cc',
    'crrcrrcr',
    'rrerrere',
    'erreerrr',
    'uerrruer',
    'uuuueuuu',
  ],
  dnaHelix: [
    'v....u',
    '.v..u.',
    '..vu..',
    '..uv..',
    '.uyyv.',
    'u.ll.v',
    'u....v',
    '.uyyv.',
    '..uv..',
  ],
  aurora: [
    'i.v..i.v.',
    'iiv.ii.vv',
    '.iivvi.iv',
    '..ii.iii.',
    '...i..i..',
    'd.......d',
    'ddd.d.ddd',
  ],
  richSoil: [
    '..l...l..',
    '.lml.lml.',
    '..m...m..',
    'bbbbbbbbb',
    'bnbbnbbnb',
    'bbbjbbbbb',
    'jbbbbbjbb',
  ],
  meteors: [
    'w........',
    '.g...w...',
    '..y...g..',
    '...o...y.',
    'w...e...o',
    '.g.......',
    '..y.....w',
  ],
  delta: [
    'uu.......',
    '.uu......',
    '..uul....',
    '.lluulll.',
    'lluluulll',
    'luulluuul',
    'uulluluuu',
    'uuuuuuuuu',
  ],
  superbloom: [
    '.p..y..v.',
    'pyp.yyvyv',
    '.p.yoy.v.',
    '.l..y..l.',
    'p.l.l.l.y',
    'ypylllyoy',
    '.n.nlnn..',
    'nnnnnnnnn',
  ],
  seasons: [
    '..l...y..',
    '.lll.yyy.',
    'lllllyyyy',
    'b.b..bob.',
    'wwww.ooo.',
    'wwww.ooo.',
    '.b....b..',
  ],
  glowSea: [
    '..c...c...',
    '.c.c.c.c..',
    '..c...c...',
    '........c.',
    '.cc..cc.cc',
    'cuuccuuccu',
    'uuuuuuuuuu',
  ],
  magma: [
    '......o..',
    '.o...oyo.',
    'oyo...o..',
    'do......d',
    'dooyyoood',
    'doyyrroyd',
    'droorryod',
    'ddrroordd',
    '.ddddddd.',
  ],
  lava: [
    '..o.....',
    '.oro..o.',
    'oorroooo',
    'rrooorro',
    'dddddddd',
  ],
  supervolcano: [
    '...ooo...',
    '..oorroo.',
    '...oro...',
    '....r....',
    '..kdrdk..',
    '.kdddddk.',
    'kdddddddk',
  ],
  magnet: [
    'rr..gg',
    'rr..gg',
    'rr..gg',
    '.rrgg.',
  ],
  smoker: [
    '.g.g..',
    'g.gg.g',
    '..gg..',
    '..hh..',
    '..jh..',
    '.hjhh.',
    'hhohjh',
  ],
  plates: [
    'c......c',
    '.c....c.',
    'c......c',
    'hhhhjjjj',
    'hhhhjjjj',
    'oooooooo',
  ],
  fault: [
    'llllllll',
    'lll.llll',
    'hhh.khhh',
    'hh.khhhh',
    'hhhk.hhh',
    'hhkhhhhh',
  ],
  soil: [
    '.l.l.l.l',
    'llllllll',
    'bbbbbbbb',
    'bnbbbrbb',
    'bbbbrrbb',
    'hhhhhhhh',
  ],
  grass: [
    'l..l..l.',
    'l.ll.ll.',
    'llllllll',
    'mlmlmlml',
  ],
  reeds: [
    '.n...n..',
    '.m.n.m..',
    '.m.m.m.n',
    '.m.m.m.m',
    'uumumumu',
    'uuuuuuuu',
  ],
  roots: [
    '..lml..',
    '.lllll.',
    '...b...',
    'nnnbnnn',
    '.b.b.b.',
    'b..b..b',
    '.b...b.',
  ],
  forest: [
    '.m..m..m.',
    'mlmmlmmlm',
    'mllmllmll',
    '.b..b..b.',
  ],
  storm: [
    '.ggg...',
    'gdddgg.',
    'ddddddd',
    '..yy...',
    '.yy....',
    '..y....',
  ],
  bigBolt: [
    '...yy..yy',
    '..yy..yy.',
    '.yyyy.yyy',
    '..yy..yy.',
    '.yy..yy..',
    'yy..yy...',
  ],
};

// The colors the player has discovered (Science › Physics › Spectrum). Each visible color band owns a stretch
// of hues; a hue between two bands is as colored as the bands around it. Hues not discovered yet are drawn in
// grey. Before Starlight there is not even grey: only black, dim grey and white.
const Hues = (() => {
  // Blue sits at 210°, the hue of a clear sky, so finding blue turns the sky fully blue.
  const BANDS = [['red', 0], ['orange', 30], ['yellow', 60], ['green', 120], ['blue', 210], ['violet', 275], ['red', 360]];
  const NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'violet'];
  const lut = new Uint8Array(32768);   // per 5-bit RGB color, how much of its color shows (0..255)
  // Until the game sets them, everything is in full color (the wiki uses the same sprites).
  const ALL = { red: 1, orange: 1, yellow: 1, green: 1, blue: 1, violet: 1 };
  let shown = ALL, target = ALL, dark = false, full = true, key = 'full';

  function hueOf(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }
  function share(levels, h) {
    for (let i = 0; i < BANDS.length - 1; i++) {
      const [a, ha] = BANDS[i], [b, hb] = BANDS[i + 1];
      if (h <= hb) return (levels[a] || 0) + ((levels[b] || 0) - (levels[a] || 0)) * (h - ha) / (hb - ha);
    }
    return 0;
  }
  const grey = (r, g, b) => (r * 77 + g * 150 + b * 29) >> 8;
  const silhouette = l => (l < 80 ? 0 : l < 160 ? 70 : 235);

  // One color through the discovered palette, for the page around the scene.
  function tint(r, g, b, levels = target) {
    const l = grey(r, g, b);
    if (dark) return [silhouette(l), silhouette(l), silhouette(l)];
    const u = share(levels, hueOf(r, g, b));
    return [l + (r - l) * u, l + (g - l) * u, l + (b - l) * u].map(Math.round);
  }

  return {
    NAMES,
    // shownLevels fade in on the scene; targetLevels are the colors found, used for the page and its icons.
    set(shownLevels, targetLevels, beforeStarlight) {
      const k = NAMES.map(n => (shownLevels[n] || 0).toFixed(2)).join() + beforeStarlight;
      const t = NAMES.map(n => (targetLevels[n] || 0)).join() + beforeStarlight;
      key = t;
      if (k === this._k) return;
      this._k = k;
      shown = shownLevels;
      target = targetLevels;
      dark = beforeStarlight;
      full = !dark && NAMES.every(n => shown[n] >= 0.99);
      for (let i = 0; i < 32768; i++) {
        const r = (i >> 10) << 3, g = ((i >> 5) & 31) << 3, b = (i & 31) << 3;
        lut[i] = Math.round(255 * share(shown, hueOf(r, g, b)));
      }
    },
    full: () => full,
    key: () => key,
    // Recolor RGBA pixels in place.
    apply(data) {
      if (full) return;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], l = grey(r, g, b);
        if (dark) {
          data[i] = data[i + 1] = data[i + 2] = silhouette(l);
          continue;
        }
        const u = lut[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
        data[i] = l + (((r - l) * u) >> 8);
        data[i + 1] = l + (((g - l) * u) >> 8);
        data[i + 2] = l + (((b - l) * u) >> 8);
      }
    },
    tint,
    // A CSS color (#rgb, #rrggbb or rgb()/rgba()) through the discovered palette.
    css(color) {
      let r, g, b, a = 1;
      if (color[0] === '#') {
        const h = color.length === 4 ? [...color.slice(1)].map(c => c + c).join('') : color.slice(1);
        [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
      } else [r, g, b, a = 1] = color.match(/[\d.]+/g).map(Number);
      const [x, y, z] = tint(r, g, b);
      return a < 1 ? `rgba(${x}, ${y}, ${z}, ${a})` : `rgb(${x}, ${y}, ${z})`;
    },
  };
})();

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
  // Drawn in the colors discovered so far.
  function icon(id) {
    const k = `${id}|${Hues.key()}`;
    if (icons[k]) return icons[k];
    const src = canvas(id);
    const size = Math.max(src.width, src.height) + 2;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = c.height = size;
    g.drawImage(src, Math.floor((size - src.width) / 2), Math.floor((size - src.height) / 2));
    const img = g.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]) [d[i], d[i + 1], d[i + 2]] = Hues.tint(d[i], d[i + 1], d[i + 2]);
    g.putImageData(img, 0, 0);
    return (icons[k] = c.toDataURL());
  }

  return { canvas, icon };
})();
