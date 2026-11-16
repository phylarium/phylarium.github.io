// The book (data/book.yaml): screens (the book, the lab, the computer, the settings), each a run of pages, each
// page a list of sections. That file alone says what is where, under which heading and in which chapter
// (data/chapters.yaml). This module turns the two files into the shapes the game and the tools ask for.
import { indexBy } from './freeze.js';

/**
 * @typedef {{ id: string, name: string, chapter?: string | undefined, night?: boolean | undefined }} Section
 * @typedef {{ id: string, name: string, sections: Section[] }} Page
 * @typedef {{ id: string, name: string, color?: string | undefined, pages: Page[] }} Screen
 * @typedef {{ screens: Screen[] }} RawBook
 * @typedef {{ id: string, name: string, gate: string[] }} Chapter
 */
/**
 * A section with where it stands: the name of its page and the id of its screen.
 * @typedef {Section & { page: string, screen: string }} PlacedSection
 */
/**
 * Something the book can be opened at: each page of the book, and each other screen whole (hidden: it has a
 * button of its own).
 * @typedef {{ id: string, name: string, color?: string | undefined, hidden?: boolean | undefined, sections: string[] }} Subject
 */

/** @param {readonly Page[]} pages @returns {string[]} */
const sectionIds = pages => pages.flatMap(page => page.sections.map(section => section.id));

/** @param {Screen} screen @returns {Subject[]} */
const subjectsOf = screen =>
  screen.id === 'book'
    ? screen.pages.map(page => ({ id: page.id, name: page.name, sections: sectionIds([page]) }))
    : [{ id: screen.id, name: screen.name, color: screen.color, hidden: true, sections: sectionIds(screen.pages) }];

/** @param {Screen} screen @returns {PlacedSection[]} */
const placed = screen =>
  screen.pages.flatMap(page => page.sections.map(section => ({ ...section, page: page.name, screen: screen.id })));

/**
 * @param {RawBook} book
 * @param {readonly Chapter[]} chapters
 */
export const bookModel = (book, chapters) => {
  const sections = book.screens.flatMap(placed);
  const subjects = book.screens.flatMap(subjectsOf);
  const chapterById = indexBy(chapters, chapter => chapter.id);
  return {
    screens: book.screens,
    /** Every section, in the order of the book. */
    sections,
    sectionById: indexBy(sections, section => section.id),
    subjects,
    subjectById: indexBy(subjects, subject => subject.id),
    /** The subject a section belongs to, by the section's id. */
    subjectOfSection: Object.fromEntries(subjects.flatMap(subject => subject.sections.map(id => [id, subject]))),
    /** The chapter that gates a section, by the section's id; sections in no chapter are not listed. */
    chapterOfSection: Object.fromEntries(
      sections.flatMap(section => {
        const chapter = section.chapter === undefined ? undefined : chapterById[section.chapter];
        return chapter ? [[section.id, chapter]] : [];
      }),
    ),
  };
};
