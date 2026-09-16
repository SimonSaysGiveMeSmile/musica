/**
 * Score parsing for the tutorial player. Turns a user-picked Standard MIDI File (.mid/.midi) or a
 * MusicXML document (.xml/.musicxml, plus the zipped .mxl container) into a flat, time-sorted list
 * of notes in seconds, so the player only ever deals with one simple shape.
 *
 * Browser-only and dependency-free: File, DOMParser, TextDecoder and DecompressionStream are the
 * only platform APIs used, and nothing is imported.
 */

export interface ScoreNote { midi: number; start: number; end: number }

export interface ParsedScore {
  notes: ScoreNote[];        // sorted by start, then midi ascending
  duration: number;          // seconds, = max end
  bpm?: number;              // first tempo found, if any
  title?: string;
  source: "midi" | "musicxml";
}

/** Value for an <input type="file" accept="..."> that offers every format we can read. */
export const SCORE_ACCEPT = ".mid,.midi,.xml,.musicxml,.mxl";

const MIDI_EXTENSION = /\.midi?$/i;
const MUSICXML_EXTENSION = /\.(?:xml|musicxml)$/i;
const MXL_EXTENSION = /\.mxl$/i;

/** True when the file name carries an extension we know how to parse (case-insensitive). */
export function isScoreFile(file: File): boolean {
  const name = file.name ?? "";
  return MIDI_EXTENSION.test(name) || MUSICXML_EXTENSION.test(name) || MXL_EXTENSION.test(name);
}

/** Parse a score file picked by the user. Rejects with a short Error when the file cannot be read. */
export async function parseScoreFile(file: File): Promise<ParsedScore> {
  const name = file.name ?? "";
  if (MIDI_EXTENSION.test(name)) return parseMidi(await file.arrayBuffer());
  if (MXL_EXTENSION.test(name)) return parseMusicXml(await readMxlDocument(await file.arrayBuffer()));
  if (MUSICXML_EXTENSION.test(name)) return parseMusicXml(await file.text());
  throw new Error(`Unsupported score file "${name || "(unnamed)"}"`);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A tempo change expressed as "seconds per timeline unit" (a MIDI tick, or a MusicXML quarter note). */
interface TimeChange { at: number; secondsPerUnit: number }

/** A point on the piecewise-linear tick/quarter -> seconds curve built from the tempo changes. */
interface TimePoint { at: number; seconds: number; secondsPerUnit: number }

/** Fold tempo changes into a monotone map so a position can be converted with one lookup. */
function buildTimeMap(defaultSecondsPerUnit: number, changes: TimeChange[]): TimePoint[] {
  const usable = changes
    .filter((change) => Number.isFinite(change.at) && Number.isFinite(change.secondsPerUnit) && change.secondsPerUnit > 0)
    .sort((a, b) => a.at - b.at);
  const points: TimePoint[] = [{ at: 0, seconds: 0, secondsPerUnit: defaultSecondsPerUnit }];
  for (const change of usable) {
    const last = points[points.length - 1];
    // A change at (or before) the current point just replaces its rate; later entries win.
    if (change.at <= last.at) {
      last.secondsPerUnit = change.secondsPerUnit;
      continue;
    }
    const seconds = last.seconds + (change.at - last.at) * last.secondsPerUnit;
    points.push({ at: change.at, seconds, secondsPerUnit: change.secondsPerUnit });
  }
  return points;
}

/** Convert a timeline position to seconds using the tempo in force at that position. */
function mapTime(points: TimePoint[], at: number): number {
  let low = 0;
  let high = points.length - 1;
  let index = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (points[mid].at <= at) {
      index = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const point = points[index];
  return point.seconds + (at - point.at) * point.secondsPerUnit;
}

/** Decode bytes as UTF-8, dropping a byte-order mark if present. */
function decodeText(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8").decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Drop unusable notes, sort the rest and assemble the public result. */
function finishScore(source: ParsedScore["source"], drafts: ScoreNote[], bpm?: number, title?: string): ParsedScore {
  const notes: ScoreNote[] = [];
  for (const draft of drafts) {
    const midi = Math.round(draft.midi);
    if (!Number.isFinite(midi) || midi < 0 || midi > 127) continue;
    if (!Number.isFinite(draft.start) || !Number.isFinite(draft.end)) continue;
    if (draft.start < 0 || draft.end <= draft.start) continue; // zero-length and inverted notes are dropped
    notes.push({ midi, start: draft.start, end: draft.end });
  }
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  let duration = 0;
  for (const note of notes) if (note.end > duration) duration = note.end;
  const score: ParsedScore = { notes, duration, source };
  if (bpm !== undefined && Number.isFinite(bpm) && bpm > 0) score.bpm = Math.round(bpm * 1000) / 1000;
  if (title) score.title = title;
  return score;
}

// ---------------------------------------------------------------------------
// Standard MIDI File
// ---------------------------------------------------------------------------

const DEFAULT_US_PER_QUARTER = 500_000; // 120 BPM
const PERCUSSION_CHANNEL = 9;           // "channel 10", which carries drums rather than pitches

/** A cursor over a byte range that never reads past its end and never rewinds past its start. */
class Reader {
  private readonly data: Uint8Array;
  private position = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  get remaining(): number {
    return this.data.length - this.position;
  }

  u8(): number {
    if (this.position >= this.data.length) throw new Error("Unexpected end of MIDI data");
    return this.data[this.position++];
  }

  u16(): number {
    return (this.u8() << 8) | this.u8();
  }

  u32(): number {
    return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0;
  }

  /** Take up to `count` bytes, clamped to what is left so a bogus length cannot overrun the buffer. */
  take(count: number): Uint8Array {
    const start = this.position;
    const end = Math.min(start + Math.max(0, count), this.data.length);
    this.position = end;
    return this.data.subarray(start, end);
  }

  skip(count: number): void {
    this.take(count);
  }

  /** Step back over bytes already read (used to re-read a data byte under running status). */
  back(count: number): void {
    this.position = Math.max(0, this.position - count);
  }

  ascii(count: number): string {
    return String.fromCharCode(...this.take(count));
  }

  /** MIDI variable-length quantity: seven bits per byte, at most four bytes. */
  vlq(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.u8();
      value = ((value << 7) | (byte & 0x7f)) >>> 0;
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error("Malformed MIDI variable-length quantity");
  }
}

interface MidiTempo { tick: number; usPerQuarter: number }

interface MidiTrack {
  notes: { midi: number; startTick: number; endTick: number }[];
  tempos: MidiTempo[];
  name?: string;
}

function parseMidi(buffer: ArrayBuffer): ParsedScore {
  const reader = new Reader(new Uint8Array(buffer));
  const tracks: MidiTrack[] = [];
  let division = 0;
  let sawHeader = false;

  // Chunks are self-describing, so unknown ones are skipped by their declared length.
  while (reader.remaining >= 8) {
    const type = reader.ascii(4);
    const declared = reader.u32();
    const chunk = reader.take(declared); // clamped: a truncated final chunk is parsed as far as it goes
    if (type === "MThd") {
      if (chunk.length < 6) throw new Error("MIDI header chunk is too short");
      const header = new Reader(chunk);
      header.u16(); // format: 0, 1 and 2 are all merged onto one timeline
      header.u16(); // track count, only a hint - the chunks themselves are authoritative
      division = header.u16();
      sawHeader = true;
    } else if (type === "MTrk") {
      tracks.push(parseMidiTrack(new Reader(chunk)));
    }
  }

  if (!sawHeader) throw new Error("Not a MIDI file (missing MThd header)");
  if (tracks.length === 0) throw new Error("MIDI file contains no tracks");

  const tempos = tracks.flatMap((track) => track.tempos).sort((a, b) => a.tick - b.tick);
  const points = buildMidiTimeMap(division, tempos);
  const drafts: ScoreNote[] = [];
  for (const track of tracks) {
    for (const note of track.notes) {
      drafts.push({ midi: note.midi, start: mapTime(points, note.startTick), end: mapTime(points, note.endTick) });
    }
  }

  const title = tracks.find((track) => track.name)?.name;
  const bpm = tempos.length > 0 ? 60_000_000 / tempos[0].usPerQuarter : undefined;
  return finishScore("midi", drafts, bpm, title);
}

/** Build the tick -> seconds map, honouring either ticks-per-quarter or SMPTE (absolute) division. */
function buildMidiTimeMap(division: number, tempos: MidiTempo[]): TimePoint[] {
  if ((division & 0x8000) !== 0) {
    // Negative high byte: frames per second, low byte: ticks per frame. Tempo does not affect timing.
    const framesPerSecond = 256 - (division >>> 8);
    const ticksPerFrame = division & 0xff;
    const rate = (framesPerSecond === 29 ? 29.97 : framesPerSecond) * ticksPerFrame;
    if (!(rate > 0)) throw new Error("MIDI file has an invalid SMPTE time division");
    return buildTimeMap(1 / rate, []);
  }
  const ticksPerQuarter = division;
  if (!(ticksPerQuarter > 0)) throw new Error("MIDI file has an invalid time division");
  const changes = tempos.map((tempo) => ({ at: tempo.tick, secondsPerUnit: tempo.usPerQuarter / 1e6 / ticksPerQuarter }));
  return buildTimeMap(DEFAULT_US_PER_QUARTER / 1e6 / ticksPerQuarter, changes);
}

function parseMidiTrack(reader: Reader): MidiTrack {
  const notes: MidiTrack["notes"] = [];
  const tempos: MidiTempo[] = [];
  const open = new Map<number, number[]>(); // (channel, pitch) -> stack of start ticks, so repeats nest
  let name: string | undefined;
  let tick = 0;
  let status = 0;

  const closeNote = (channel: number, pitch: number): void => {
    const key = (channel << 7) | pitch;
    const stack = open.get(key);
    const start = stack?.pop();
    if (start === undefined) return; // a note-off with nothing sounding: ignore it
    if (stack !== undefined && stack.length === 0) open.delete(key);
    notes.push({ midi: pitch, startTick: start, endTick: tick });
  };

  while (reader.remaining > 0) {
    tick += reader.vlq();
    let byte = reader.u8();

    if (byte === 0xff) { // meta event: <type> <length> <data>
      const metaType = reader.u8();
      const data = reader.take(reader.vlq());
      status = 0;
      if (metaType === 0x2f) break; // end of track
      if (metaType === 0x51 && data.length >= 3) {
        const usPerQuarter = (data[0] << 16) | (data[1] << 8) | data[2];
        if (usPerQuarter > 0) tempos.push({ tick, usPerQuarter });
      } else if (metaType === 0x03 && name === undefined) {
        const text = decodeText(data).trim();
        if (text) name = text;
      }
      continue;
    }

    if (byte === 0xf0 || byte === 0xf7) { // sysex: skip by its length field
      reader.skip(reader.vlq());
      status = 0;
      continue;
    }

    if (byte < 0x80) { // running status: this byte is already the first data byte
      if (status === 0) throw new Error("Malformed MIDI event (running status with no status byte)");
      reader.back(1);
      byte = status;
    }
    status = byte;

    const channel = byte & 0x0f;
    switch (byte & 0xf0) {
      case 0x80: { // note off
        const pitch = reader.u8();
        reader.u8(); // release velocity
        closeNote(channel, pitch);
        break;
      }
      case 0x90: { // note on, or note off when the velocity is zero
        const pitch = reader.u8();
        const velocity = reader.u8();
        if (velocity === 0) {
          closeNote(channel, pitch);
        } else if (channel !== PERCUSSION_CHANNEL) {
          const key = (channel << 7) | pitch;
          const stack = open.get(key);
          if (stack) stack.push(tick);
          else open.set(key, [tick]);
        }
        break;
      }
      case 0xa0: // aftertouch
      case 0xb0: // controller
      case 0xe0: // pitch bend
        reader.skip(2);
        break;
      case 0xc0: // program change
      case 0xd0: // channel pressure
        reader.skip(1);
        break;
      default:
        throw new Error(`Unsupported MIDI status byte 0x${byte.toString(16)}`);
    }
  }

  // Notes still sounding at the end of the track are closed there; zero-length ones get dropped later.
  for (const [key, stack] of open) {
    for (const start of stack) notes.push({ midi: key & 0x7f, startTick: start, endTick: tick });
  }
  return { notes, tempos, name };
}

// ---------------------------------------------------------------------------
// MusicXML
// ---------------------------------------------------------------------------

const STEP_SEMITONES: Record<string, number | undefined> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** How many quarter notes one <beat-unit> is worth, for reading <metronome> marks. */
const BEAT_UNIT_QUARTERS: Record<string, number | undefined> = {
  long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5,
  "16th": 0.25, "32nd": 0.125, "64th": 0.0625, "128th": 0.03125,
};

interface XmlTempo { at: number; bpm: number }

/** Direct element children with the given local name (namespace prefixes are ignored). */
function childElements(parent: Element, name: string): Element[] {
  const found: Element[] = [];
  for (const child of Array.from(parent.children)) if (child.localName === name) found.push(child);
  return found;
}

function childElement(parent: Element, name: string): Element | null {
  for (const child of Array.from(parent.children)) if (child.localName === name) return child;
  return null;
}

function childText(parent: Element, name: string): string | null {
  const element = childElement(parent, name);
  return element ? (element.textContent ?? "").trim() : null;
}

function childNumber(parent: Element, name: string): number | null {
  const text = childText(parent, name);
  if (text === null || text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function parseMusicXml(text: string): ParsedScore {
  if (typeof DOMParser === "undefined") throw new Error("MusicXML parsing needs a browser environment");
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) throw new Error("MusicXML file is not valid XML");
  const root = document.documentElement;
  if (!root) throw new Error("MusicXML file is empty");
  if (root.localName === "score-timewise") throw new Error("Timewise MusicXML is not supported; export a partwise score");
  if (root.localName !== "score-partwise") throw new Error(`Not a MusicXML score (root element <${root.localName}>)`);

  const quarterNotes: ScoreNote[] = []; // start/end are quarter-note positions until the tempo map is applied
  const tempos: XmlTempo[] = [];
  const parts = childElements(root, "part");
  parts.forEach((part, index) => parseMusicXmlPart(part, index, quarterNotes, tempos));

  tempos.sort((a, b) => a.at - b.at);
  const bpm = tempos.length > 0 ? tempos[0].bpm : undefined;
  const points = buildTimeMap(60 / 120, tempos.map((tempo) => ({ at: tempo.at, secondsPerUnit: 60 / tempo.bpm })));
  const drafts = quarterNotes.map((note) => ({ midi: note.midi, start: mapTime(points, note.start), end: mapTime(points, note.end) }));
  return finishScore("musicxml", drafts, bpm, musicXmlTitle(root));
}

/**
 * Walk one <part>, keeping a running position measured in quarter notes (divisions are folded in as
 * they are read, so a mid-part change of <divisions> stays consistent). Notes are appended with
 * quarter-note times; the caller converts them to seconds afterwards.
 */
function parseMusicXmlPart(part: Element, partIndex: number, notes: ScoreNote[], tempos: XmlTempo[]): void {
  const openTies = new Map<string, ScoreNote>(); // part|voice|midi -> the note waiting for its tie stop
  let divisions = 1;
  let measureStart = 0;
  let position = 0;
  let furthest = 0;
  let previousDuration = 0; // what the last non-chord note/rest advanced by, so <chord/> can step back

  for (const measure of childElements(part, "measure")) {
    position = measureStart;
    furthest = measureStart;
    previousDuration = 0;
    for (const element of Array.from(measure.children)) {
      switch (element.localName) {
        case "attributes": {
          const value = childNumber(element, "divisions");
          if (value !== null && value > 0) divisions = value; // sticky for the rest of the part
          break;
        }
        case "direction": {
          const bpm = directionTempo(element);
          if (bpm !== null) tempos.push({ at: position, bpm });
          break;
        }
        case "sound": {
          const bpm = soundTempo(element);
          if (bpm !== null) tempos.push({ at: position, bpm });
          break;
        }
        case "backup": {
          position -= durationInQuarters(element, divisions);
          previousDuration = 0;
          break;
        }
        case "forward": {
          position += durationInQuarters(element, divisions);
          previousDuration = 0;
          break;
        }
        case "note": {
          if (childElement(element, "grace") !== null) break; // grace notes carry no duration
          const isChord = childElement(element, "chord") !== null;
          const duration = durationInQuarters(element, divisions);
          const start = isChord ? position - previousDuration : position;
          if (!isChord) {
            position += duration;
            previousDuration = duration;
          }
          const pitch = childElement(element, "pitch");
          if (pitch === null || childElement(element, "rest") !== null) break; // rests only move time along
          const midi = pitchToMidi(pitch);
          if (midi === null) break;
          addMusicXmlNote(notes, openTies, `${partIndex}|${childText(element, "voice") ?? "1"}|${midi}`, element, midi, start, start + duration);
          break;
        }
        default:
          break;
      }
      if (position > furthest) furthest = position;
    }
    // Voices that ended early (after a <backup>) must not pull the next measure back with them.
    measureStart = furthest;
  }
}

/** Append a note, merging it into the note it is tied to when this one stops a tie. */
function addMusicXmlNote(
  notes: ScoreNote[],
  openTies: Map<string, ScoreNote>,
  key: string,
  element: Element,
  midi: number,
  start: number,
  end: number,
): void {
  const tie = tieFlags(element);
  const open = openTies.get(key);
  if (tie.stop && open) {
    if (end > open.end) open.end = end; // extend the held note instead of emitting a second one
    if (!tie.start) openTies.delete(key);
    return;
  }
  const note: ScoreNote = { midi, start, end };
  notes.push(note);
  if (tie.start) openTies.set(key, note);
  else openTies.delete(key);
}

/** Read <tie> elements and the <notations><tied> equivalents. */
function tieFlags(note: Element): { start: boolean; stop: boolean } {
  let start = false;
  let stop = false;
  const apply = (type: string | null): void => {
    if (type === "start") start = true;
    else if (type === "stop") stop = true;
    else if (type === "continue") { start = true; stop = true; }
  };
  for (const tie of childElements(note, "tie")) apply(tie.getAttribute("type"));
  for (const notations of childElements(note, "notations")) {
    for (const tied of childElements(notations, "tied")) apply(tied.getAttribute("type"));
  }
  return { start, stop };
}

function durationInQuarters(element: Element, divisions: number): number {
  const duration = childNumber(element, "duration");
  if (duration === null || !(duration > 0) || !(divisions > 0)) return 0;
  return duration / divisions;
}

function pitchToMidi(pitch: Element): number | null {
  const semitones = STEP_SEMITONES[(childText(pitch, "step") ?? "").toUpperCase()];
  if (semitones === undefined) return null;
  const octave = childNumber(pitch, "octave");
  if (octave === null) return null;
  const alter = childNumber(pitch, "alter") ?? 0; // may be fractional (quarter tones) or negative
  const midi = (octave + 1) * 12 + semitones + Math.round(alter);
  return Number.isFinite(midi) ? midi : null;
}

function soundTempo(sound: Element): number | null {
  const tempo = Number(sound.getAttribute("tempo"));
  return Number.isFinite(tempo) && tempo > 0 ? tempo : null;
}

/** Tempo of a <direction>: a <sound tempo> wins, otherwise a <metronome> mark is converted to quarter BPM. */
function directionTempo(direction: Element): number | null {
  const sound = childElement(direction, "sound");
  const fromSound = sound ? soundTempo(sound) : null;
  if (fromSound !== null) return fromSound;
  for (const directionType of childElements(direction, "direction-type")) {
    const metronome = childElement(directionType, "metronome");
    if (!metronome) continue;
    const perMinute = childNumber(metronome, "per-minute");
    if (perMinute === null || perMinute <= 0) continue;
    let quarters = BEAT_UNIT_QUARTERS[(childText(metronome, "beat-unit") ?? "quarter").toLowerCase()] ?? 1;
    let dot = quarters / 2;
    for (let i = childElements(metronome, "beat-unit-dot").length; i > 0; i--) {
      quarters += dot; // each dot adds half of what the previous one added
      dot /= 2;
    }
    const bpm = perMinute * quarters;
    if (Number.isFinite(bpm) && bpm > 0) return bpm;
  }
  return null;
}

function musicXmlTitle(root: Element): string | undefined {
  const work = childElement(root, "work");
  const workTitle = work ? childText(work, "work-title") : null;
  if (workTitle) return workTitle;
  const movementTitle = childText(root, "movement-title");
  if (movementTitle) return movementTitle;
  for (const credit of childElements(root, "credit")) {
    const words = childText(credit, "credit-words");
    if (words) return words;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// .mxl (zipped MusicXML)
// ---------------------------------------------------------------------------

interface ZipEntry { name: string; method: number; compressedSize: number; localOffset: number }

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function readU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) return -1;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return -1;
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

/** Unwrap an .mxl container and return the text of the MusicXML document inside it. */
async function readMxlDocument(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const entries = readZipDirectory(bytes);
  if (entries.length === 0) throw new Error("The .mxl archive is empty");

  // META-INF/container.xml names the document to open; otherwise fall back to the first XML entry.
  const container = entries.find((entry) => entry.name.toLowerCase() === "meta-inf/container.xml");
  let target: ZipEntry | undefined;
  if (container) {
    const path = containerRootPath(decodeText(await readZipEntry(bytes, container)));
    if (path) {
      const wanted = path.toLowerCase();
      target = entries.find((entry) => entry.name.toLowerCase() === wanted);
    }
  }
  target ??= entries.find((entry) => MUSICXML_EXTENSION.test(entry.name) && !entry.name.toLowerCase().startsWith("meta-inf/"));
  if (!target) throw new Error("No MusicXML document found inside the .mxl archive");
  return decodeText(await readZipEntry(bytes, target));
}

function containerRootPath(xml: string): string | null {
  if (typeof DOMParser === "undefined") return null;
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const rootfile = document.getElementsByTagName("rootfile")[0];
  const path = rootfile?.getAttribute("full-path") ?? "";
  return path ? path.replace(/^\.?\//, "") : null;
}

/** Read the ZIP central directory, which is the only reliable index of an archive's entries. */
function readZipDirectory(bytes: Uint8Array): ZipEntry[] {
  const limit = Math.max(0, bytes.length - 0xffff - 22);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= limit; offset--) {
    if (readU32(bytes, offset) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .mxl archive (no ZIP directory found)");

  const count = readU16(bytes, eocd + 10);
  let offset = readU32(bytes, eocd + 16);
  if (count < 0 || offset < 0) throw new Error("Corrupt .mxl archive directory");
  if (offset === 0xffffffff || count === 0xffff) throw new Error("ZIP64 .mxl archives are not supported");

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || readU32(bytes, offset) !== CENTRAL_SIGNATURE) break;
    const method = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const localOffset = readU32(bytes, offset + 42);
    if (nameLength < 0 || extraLength < 0 || commentLength < 0 || localOffset < 0 || compressedSize < 0) break;
    const name = decodeText(bytes.subarray(offset + 46, Math.min(offset + 46 + nameLength, bytes.length)));
    if (name && !name.endsWith("/")) entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const header = entry.localOffset;
  if (header + 30 > bytes.length || readU32(bytes, header) !== LOCAL_SIGNATURE) throw new Error(`Corrupt entry "${entry.name}" in .mxl archive`);
  const nameLength = readU16(bytes, header + 26);
  const extraLength = readU16(bytes, header + 28);
  if (nameLength < 0 || extraLength < 0) throw new Error(`Corrupt entry "${entry.name}" in .mxl archive`);
  const start = header + 30 + nameLength + extraLength;
  if (start > bytes.length) throw new Error(`Corrupt entry "${entry.name}" in .mxl archive`);
  const end = entry.compressedSize > 0 ? Math.min(start + entry.compressedSize, bytes.length) : bytes.length;
  const data = bytes.subarray(start, end);
  if (entry.method === 0) return data;           // stored
  if (entry.method === 8) return inflateRaw(data); // deflated
  throw new Error(`Unsupported compression (method ${entry.method}) in .mxl archive`);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open .mxl files; please upload the uncompressed MusicXML");
  // Feed the compressed bytes through a one-shot stream (copied so the chunk owns a plain ArrayBuffer).
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new Uint8Array(data));
      controller.close();
    },
  });
  const inflated = source.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(inflated).arrayBuffer());
}
