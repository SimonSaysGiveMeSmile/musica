/** Language heuristics for song titles and lyrics. Script-based, no network, good enough to pick
 *  the right title clean-up and to tag lyric text for correct typography. */

export type SongLang = "en" | "zh" | "ja" | "ko" | "ru" | "de" | "fr" | "es" | "az" | "pt" | "it" | "tr" | "und";

export const LANG_NAMES: Record<SongLang, string> = {
  en: "English", zh: "中文", ja: "日本語", ko: "한국어", ru: "Русский", de: "Deutsch", fr: "Français", es: "Español",
  az: "Azərbaycanca", pt: "Português", it: "Italiano", tr: "Türkçe", und: "",
};

const RE = {
  han: /[一-鿿㐀-䶿]/,
  kana: /[぀-ヿ]/,
  hangul: /[가-힯ᄀ-ᇿ]/,
  cyr: /[Ѐ-ӿ]/,
  az: /[əƏğĞıİşŞ]/,
  de: /[äöüÄÖÜß]/,
  fr: /[éèêëàâîïôûùçœÉÈÊÀÂÇŒ]/,
  es: /[ñÑ¿¡]/,
  pt: /[ãõÃÕ]/,
  tr: /[ğĞşŞıİ]/,
};

export function detectLang(text: string): SongLang {
  const t = text || "";
  if (RE.kana.test(t)) return "ja";
  if (RE.hangul.test(t)) return "ko";
  if (RE.han.test(t)) return "zh";
  if (RE.cyr.test(t)) return "ru";
  if (RE.az.test(t)) return "az";
  if (RE.de.test(t)) return "de";
  if (RE.pt.test(t)) return "pt";
  if (RE.es.test(t)) return "es";
  if (RE.fr.test(t)) return "fr";
  if (RE.tr.test(t)) return "tr";
  // Latin script with no diacritics: look for very common function words
  const w = ` ${t.toLowerCase()} `;
  const score = (words: string[]) => words.reduce((n, x) => n + (w.includes(` ${x} `) ? 1 : 0), 0);
  const cands: [SongLang, number][] = [
    ["en", score(["the", "you", "and", "love", "my", "of", "me", "your", "with", "is"])],
    ["es", score(["el", "la", "de", "que", "y", "tu", "mi", "amor", "no", "con"])],
    ["fr", score(["le", "la", "les", "je", "tu", "de", "et", "mon", "ma", "pas"])],
    ["de", score(["der", "die", "das", "und", "ich", "du", "nicht", "ein", "mit", "ist"])],
    ["it", score(["il", "che", "non", "di", "e", "la", "un", "per", "mi", "sono"])],
    ["pt", score(["o", "a", "de", "que", "não", "eu", "você", "com", "um", "meu"])],
  ];
  cands.sort((a, b) => b[1] - a[1]);
  return cands[0][1] > 0 ? cands[0][0] : "und";
}

/** BCP-47 tag for the lang attribute. */
export function langTag(l: SongLang): string {
  return l === "zh" ? "zh-Hans" : l === "und" ? "" : l;
}

/* Words video uploaders add to titles, by language. Removed before searching lyric databases. */
const NOISE: Record<string, RegExp[]> = {
  common: [
    /\b(official|offic\.|music|lyric|lyrics|video|audio|visuali[sz]er|hd|hq|4k|8k|remaster(ed)?|live|acoustic|version|ver\.?|mv|m\/v|cover|karaoke|instrumental|clip|full|hi-?res|feat\.?|ft\.?)\b/gi,
  ],
  zh: [/(官方|完整|高清|動態|动态|歌詞|歌词|字幕|純音樂|纯音乐|伴奏|翻唱|現場|现场|演唱會|演唱会|版|MV|正式|首播|主題曲|主题曲|插曲|片尾曲|片頭曲)/g],
  ja: [/(公式|歌詞|歌詞付き|フル|ミュージックビデオ|カバー|歌ってみた|弾いてみた|ver\.?|バージョン)/g],
  ko: [/(공식|가사|뮤직비디오|커버|라이브|풀버전)/g],
  ru: [/(официальн\w*|клип|текст песни|текст|лирик\w*|премьера( клипа)?|live|кавер|минус|караоке|видео)/gi],
  de: [/(offizielles?|liedtext|songtext|musikvideo)/gi],
  fr: [/(officiel(le)?|paroles|clip)/gi],
  es: [/(oficial|letra|videoclip|vídeo|video)/gi],
  az: [/(rəsmi|sözləri|klip|mahnı)/gi],
  pt: [/(oficial|letra|videoclipe|clipe)/gi],
  tr: [/(resmi|sözleri|klip|şarkı)/gi],
};

/** Strip brackets of every script and the uploader noise for the detected language. */
export function cleanTitle(raw: string, lang: SongLang): string {
  let t = raw
    .replace(/[\(\[（【「『《〈][^\)\]）】」』》〉]*[\)\]）】」』》〉]/g, " ")   // any bracketed tail
    .replace(/[｜|]/g, " | ");
  for (const re of NOISE.common) t = t.replace(re, " ");
  for (const re of NOISE[lang] ?? []) t = t.replace(re, " ");
  t = t.replace(/[　]/g, " ").replace(/\s*[-–—~〜]\s*$/g, "").replace(/\s{2,}/g, " ").trim();
  return t.replace(/^[\s\-–—|:：]+|[\s\-–—|:：]+$/g, "").trim();
}

export interface TitleGuess { title: string; artist?: string }

/** Candidate (title, artist) pairs from a video title, most likely first. Handles "Artist - Title",
 *  "Title - Artist", "Artist《Title》", "Artist「Title」", "Title / Artist", "Title | Artist". */
export function titleVariants(raw: string, artistHint?: string, channel?: string): TitleGuess[] {
  const lang = detectLang(raw);
  const out: TitleGuess[] = [];
  const push = (title: string, artist?: string) => {
    title = cleanTitle(title, lang); artist = artist ? cleanTitle(artist, lang) : undefined;
    if (!title) return;
    if (!out.some((o) => o.title === title && (o.artist ?? "") === (artist ?? ""))) out.push({ title, artist: artist || undefined });
  };
  const chan = channel?.replace(/\s*-\s*topic$/i, "").replace(/\s*VEVO$/i, "").replace(/official/i, "").trim() || undefined;

  // mixed-script names ("周杰倫 Jay Chou", "晴天 Sunny Day"): also try each script on its own
  const scripts = (x: string): string[] => {
    const cjk = x.replace(/[A-Za-z0-9'’&.,!?\-\s]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const latin = x.replace(/[^A-Za-z0-9'’&.,!?\-\s]+/g, " ").replace(/\s{2,}/g, " ").trim();
    return cjk && latin && cjk !== x && latin !== x ? [cjk, latin] : [];
  };
  const pushAll = (title: string, artist?: string) => {
    const ts = [title, ...scripts(title)], as = artist ? [artist, ...scripts(artist)] : [undefined];
    for (const tt of ts) for (const aa of as) push(tt, aa);
  };

  // quoted CJK titles: Artist《Title》 / Artist「Title」 / Artist【Title】
  const q = raw.match(/^(.*?)[《「『【]([^》」』】]+)[》」』】]/);
  if (q) { pushAll(q[2], q[1].trim() || artistHint || chan); pushAll(q[2]); }

  const sep = raw.split(/\s+[-–—|/]\s+|\s*[｜]\s*/);
  if (sep.length >= 2) {
    const [a, b] = [sep[0], sep.slice(1).join(" ")];
    pushAll(b, artistHint ?? a);   // Artist - Title (most common)
    pushAll(a, artistHint ?? b);   // Title - Artist
    pushAll(b); pushAll(a);
  }
  pushAll(raw, artistHint ?? chan);
  pushAll(raw);
  return out.slice(0, 8);
}
