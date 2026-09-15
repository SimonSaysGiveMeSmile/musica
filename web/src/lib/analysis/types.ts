export interface ChordSegment {
  chord: string;
  start: number;
  end: number;
  beatIndex: number;
  strength: number;
}

export interface Analysis {
  version: 1;
  key: string;
  scale: "major" | "minor";
  keyStrength: number;
  bpm: number;
  beats: number[];
  chords: ChordSegment[];
  chroma: number[];
  duration: number;
  downbeatPhase: number; // beat index mod 4 that falls on a bar line
}

export interface RawAnalysis {
  version: 1;
  key: string;
  scale: "major" | "minor";
  keyStrength: number;
  bpm: number;
  beats: number[];
  beatChords: string[];
  beatStrengths: number[];
  chroma: number[];
  duration: number;
  downbeatPhase: number;
  sampleRate: number;
}

export type AnalysisStage = "decode" | "waveform" | "key" | "tempo" | "chords" | "done";

export interface LiveFrame {
  chord: string;
  strength: number;
  pitch: number;
  pitchConfidence: number;
  rms: number;
  hpcp: number[];
}
