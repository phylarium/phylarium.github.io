// Stories (data/stories.yaml): cards in a logical order (the chapters), then the story's natural disaster as a
// card of its own, then its ultra. This module answers the questions asked about them: which story a minigame
// opens, which story holds a card, which card waits for a minigame.
import { indexBy } from './freeze.js';

/**
 * A story as the file writes it; `chapters` may be missing in a story just added.
 * @typedef {{ id: string, name: string, minigame?: string | undefined, quiet?: boolean | undefined, chapters?: string[] | undefined, disaster?: string | undefined, ultra?: string | undefined, note?: string | undefined }} RawStory
 */
/** @typedef {Omit<RawStory, 'chapters'> & { chapters: string[] }} Story */

/** @param {RawStory} story @returns {Story} */
const complete = story => ({ ...story, chapters: story.chapters ?? [] });

/**
 * Every card of a story: its chapters, then its disaster, then its ultra.
 * @param {Pick<Story, 'chapters' | 'disaster' | 'ultra'>} story
 * @returns {string[]}
 */
export const cardsOf = story => [...story.chapters, story.disaster, story.ultra].flatMap(id => (id ? [id] : []));

/** @param {readonly RawStory[]} raw */
export const storyModel = raw => {
  const list = raw.map(complete);
  return {
    list,
    byId: indexBy(list, story => story.id),
    /** The story a minigame opens, by the minigame's id. */
    ofGame: indexBy(list, story => story.minigame),
    /** The story that holds a card, by the card's id. */
    ofCard: Object.fromEntries(list.flatMap(story => cardsOf(story).map(id => [id, story]))),
    /** The minigame a card waits for, by the card's id: the first chapter of a story a minigame opens. */
    gateOfCard: Object.fromEntries(
      list.flatMap(story => {
        const [first] = story.chapters;
        return story.minigame && first ? [[first, story.minigame]] : [];
      }),
    ),
  };
};
