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
  vocals?: number[];     // sung-melody activity per half second, 0..1 (absent on older analyses)
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
  vocals?: number[];
  sampleRate: number;
}

export type AnalysisStage = "decode" | "waveform" | "key" | "tempo" | "chords" | "vocals" | "done";

export interface LiveFrame {
  chord: string;
  strength: number;
  pitch: number;
  pitchConfidence: number;
  rms: number;
  hpcp: number[];
}
