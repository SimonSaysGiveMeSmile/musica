import { createStore, get, set, del, keys, getMany } from "idb-keyval";
import type { Analysis } from "@/lib/analysis/types";
import type { Lyrics } from "@/lib/lyrics/lrclib";
import type { Instrument } from "@/lib/theory/coverage";

export type SongSource = "youtube" | "spotify" | "file";

export interface Song {
  id: string;
  source: SongSource;
  title: string;
  artist?: string;
  durationSec: number;
  thumbnail?: string;
  sourceUrl?: string;
  hasAudio: boolean;
  analysis?: Analysis;
  peaks?: number[];
  lyrics?: Lyrics;
  lyricsOffset?: number; // seconds added to lyric timestamps to match this recording
  lyricsAutoSynced?: boolean; // the offset was estimated from the audio
  lyricAnchors?: Record<number, number>; // for unsynced lyrics: line index → time set by the user
  transpose: number;
  capo: number;
  instrument?: Instrument;
  createdAt: number;
  updatedAt: number;
}

const songs = typeof indexedDB !== "undefined" ? createStore("musica", "songs") : undefined;
const audio = typeof indexedDB !== "undefined" ? createStore("musica-audio", "blobs") : undefined;

export async function saveSong(s: Song) { s.updatedAt = Date.now(); await set(s.id, s, songs); }
export async function getSong(id: string) { return get<Song>(id, songs); }
export async function deleteSong(id: string) { await del(id, songs); await del(id, audio); }
export async function listSongs(): Promise<Song[]> {
  const ks = await keys(songs);
  const all = await getMany<Song>(ks as string[], songs);
  return all.filter((s): s is Song => !!s).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function saveAudio(id: string, blob: Blob) { await set(id, blob, audio); }
export async function getAudio(id: string) { return get<Blob>(id, audio); }
