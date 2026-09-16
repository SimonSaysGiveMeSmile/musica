"use client";
/** Turning a song into a tutorial: get notes (from the recording or a score file),
 *  then hand them to the playability pass. */
import { buildTutorialNotes } from "@/lib/analysis/client";
import { decodeToMono } from "@/lib/audio/decode";
import type { Analysis } from "@/lib/analysis/types";
import { makePlayable } from "./playability";
import { sectionStarts } from "./sections";
import type { ParsedScore } from "./score";
import type { RawNote, Tutorial, TutorialSource } from "./types";

/** Section marks for music we have no beat grid for: a new one at the first note after each gap. */
export function sectionsFromNotes(notes: RawNote[], duration: number): number[] {
  const out = [0];
  const step = Math.max(8, Math.min(24, duration / 12));
  for (const n of notes) {
    if (n.start - out[out.length - 1] >= step) out.push(Math.round(n.start * 100) / 100);
  }
  return out;
}

export interface GenerateOptions {
  mode: Exclude<TutorialSource, "score">;
  analysis?: Analysis;
  onProgress?: (pct: number) => void;
}

export async function generateTutorial(audioBlob: Blob, { mode, analysis, onProgress }: GenerateOptions): Promise<Tutorial> {
  const { audio, sampleRate, duration } = await decodeToMono(await audioBlob.arrayBuffer());
  const raw = await buildTutorialNotes(audio, sampleRate, mode, {
    chords: analysis?.chords.map((c) => ({ chord: c.chord, start: c.start, end: c.end })),
    beats: analysis?.beats,
    phase: analysis?.downbeatPhase,
  }, onProgress);
  const { notes, dropped } = makePlayable(raw);
  return {
    version: 1,
    source: mode,
    notes,
    sections: analysis ? sectionStarts(analysis) : sectionsFromNotes(notes, duration),
    dropped,
    createdAt: Date.now(),
  };
}

export function tutorialFromScore(score: ParsedScore, analysis?: Analysis): Tutorial {
  const { notes, dropped } = makePlayable(score.notes);
  return {
    version: 1,
    source: "score",
    notes,
    sections: analysis && Math.abs(analysis.duration - score.duration) < 3 ? sectionStarts(analysis) : sectionsFromNotes(notes, score.duration),
    dropped,
    scoreTitle: score.title,
    createdAt: Date.now(),
  };
}
