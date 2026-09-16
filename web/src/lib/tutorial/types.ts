/** Shared shapes for tutorials: what a note is, and what a generated tutorial holds. */

export type Hand = "l" | "r";
/** A finger of the hand. 0 means no finger is needed — an open string. */
export type Finger = 0 | 1 | 2 | 3 | 4 | 5;

/** A note before hands and fingers are worked out. */
export interface RawNote { midi: number; start: number; end: number }

/** A note as the tutorial plays it: one hand and one finger, plus where it sits on a
 *  fretboard when the tutorial is for a guitar or ukulele. */
export interface TutorialNote extends RawNote {
  hand: Hand;
  finger: Finger;
  string?: number;   // 0 = lowest string
  fret?: number;     // 0 = open
}

export type TutorialSource = "arrange" | "transcribe" | "score";

export interface Tutorial {
  version: 1;
  source: TutorialSource;
  /** The instrument these notes were laid out for. Older tutorials were piano-only. */
  instrument?: "guitar" | "piano" | "ukulele";
  notes: TutorialNote[];
  /** Section start times in seconds, ascending, always starting at 0. */
  sections: number[];
  /** How many notes the playability pass had to leave out. */
  dropped: number;
  /** Title of the imported score, when the tutorial came from a file. */
  scoreTitle?: string;
  createdAt: number;
}

/** The hard limits that make an arrangement playable by two human hands. */
export const MAX_PER_HAND = 5;   // five fingers
export const MAX_SPAN = 12;      // one octave from thumb to little finger

export const isBlackKey = (midi: number) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
