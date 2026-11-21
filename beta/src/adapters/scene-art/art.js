// The human era's scenes as the game's screens use them: the raid field (raid-view.js) and the village's own
// screen (village-view.js), each a set of layers drawn still once and moving each frame. Gathered here into two
// frozen toolkits, so the bridge to the old scripts (src/app/core-village.js) takes them in one import.
import { CLOUD_BAND, RAID_LAYERS, RAID_PIC, drawBack } from './raid-back.js';
import { drawFrame, dustAfter } from './raid-front.js';
import { VH, VILLAGE_LAYERS, VW, V_CLOUDS, drawVillageBack, frameOf } from './village-scene.js';
import { drawBuilt } from './village-built.js';
import { drawLive } from './village-live.js';

/** The raid field's layers and how to draw them. */
export const RAID_ART = Object.freeze({ CLOUD_BAND, RAID_LAYERS, RAID_PIC, drawBack, drawFrame, dustAfter });

/** The village screen's layers and how to draw them: the still ones, what is built, and the moving ones. */
export const VILLAGE_ART = Object.freeze({
  LAYERS: VILLAGE_LAYERS,
  PIC: Object.freeze({ w: VW, h: VH }),
  CLOUD_BAND: V_CLOUDS,
  frameOf,
  drawBack: drawVillageBack,
  drawBuilt,
  drawLive,
});
