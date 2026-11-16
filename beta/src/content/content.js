// The game's content: what the data files say, read once into one read-only model that the game, the admin and
// the tools all ask the same questions of. `raw` is the parsed files by name (data/<name>.yaml).
import { bookModel } from './book.js';
import { deepFreeze, indexBy } from './freeze.js';
import { withNeeds } from './needs.js';
import { storyModel } from './stories.js';

/**
 * @typedef {object} RawContent
 * @property {import('./book.js').RawBook} book
 * @property {import('./book.js').Chapter[]} chapters
 * @property {import('./stories.js').RawStory[]} stories
 * @property {import('./needs.js').RawEntry[]} research
 * @property {import('./needs.js').RawEntry[]} species
 * @property {{ id: string, name: string, how?: string, every?: number }[]} disasters
 */

/** @param {RawContent} raw */
export const buildContent = raw => {
  const species = raw.species.map(withNeeds);
  return deepFreeze({
    book: bookModel(raw.book, raw.chapters),
    chapters: raw.chapters,
    stories: storyModel(raw.stories),
    /** The cards, their needs parsed; what a card does once known is still code (RESEARCH_CODE in game.js). */
    research: raw.research.map(withNeeds),
    /** The natural disasters as the player reads of them; what they do is in src/core/disasters. */
    disasters: { list: raw.disasters, byId: indexBy(raw.disasters, one => one.id) },
    species,
    speciesById: indexBy(species, one => one.id),
    microbes: species.filter(one => one['microbe']).map(one => one.id),
  });
};

/** @typedef {ReturnType<typeof buildContent>} Content */
