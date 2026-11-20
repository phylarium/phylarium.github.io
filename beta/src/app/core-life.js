// The life part of CORE: who lives on a square of the close-up, and the tree of life (where each species sits,
// and the tree drawn as HTML), and how many people the planet feeds.
import { treeCentre, treeHtml } from '../adapters/tree-view.js';
import { dweller } from '../core/life/habitat.js';
import { treeLayout } from '../core/life/tree-layout.js';
import { carrying, peopleStep, settlement, wildShares } from '../core/humans/people.js';

export const LIFE = Object.freeze({
  dweller,
  treeLayout,
  treeHtml,
  treeCentre,
  carrying,
  peopleStep,
  settlement,
  wildShares,
});
