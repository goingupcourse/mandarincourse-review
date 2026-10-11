// lesson.schema.ts — Hanyu Jiaocheng lesson content schema (Zod + inferred TS types)
// Put this in /src/content/lesson.schema.ts. Every JSON file in /content/** is
// validated against it at build time, so a typo in your content fails the build
// instead of breaking the page silently.
//
// AUTHORING CONVENTION FOR CHINESE TEXT (the important part)
// ----------------------------------------------------------
// `zh` is written WORD-SEGMENTED with single spaces, and `py` has exactly the
// same number of space-separated chunks, in the same order:
//
//   "zh": "你 明天 去 哪儿 ？"
//   "py": "nǐ míngtiān qù nǎr ?"
//
// The UI strips the spaces for display and renders <ruby> pinyin over each word.
// Why manual instead of auto-generated pinyin: auto tools get 多音字 (行 háng/xíng,
// 了 le/liǎo, 得 de/dé/děi) and tone sandhi (一, 不) wrong often enough that a
// teacher-facing product shouldn't trust them blindly. A helper script can
// pre-fill `py` for you to review (see roadmap, Phase 1).
// Punctuation counts as a chunk: write it the same in both, e.g. "？" ↔ "?".

import { z } from "zod";

// ---------- shared primitives ----------

const Id = z.string().regex(/^[a-z0-9-]+$/, "lowercase, digits, hyphens only");

/** Path relative to /public, e.g. "audio/1a/l11/v-01.mp3". Optional everywhere:
 *  if missing, the player falls back to browser text-to-speech (zh-CN). */
const AudioPath = z.string().regex(/^audio\/.+\.(mp3|m4a|ogg)$/).optional();

/** One line of Chinese with aligned pinyin + Indonesian. Reused by
 *  example sentences, dialogue lines, and grammar examples. */
export const Sentence = z
  .object({
    zh: z.string().min(1),
    py: z.string().min(1),
    id: z.string().min(1), // Indonesian translation
    audio: AudioPath,
    note: z.string().optional(), // optional teacher note, shown on tap
  })
  .refine(
    (s) => s.zh.trim().split(/\s+/).length === s.py.trim().split(/\s+/).length,
    { message: "zh and py must have the same number of space-separated chunks" }
  );

// ---------- 1. 生词 Vocabulary ----------

export const WordType = z.enum([
  "n", "pron", "v", "adj", "adv", "num", "m", "prep", "conj",
  "part", "aux", "int", "pn", "phrase", // pn = proper noun (专名)
]);

export const VocabItem = z.object({
  vid: Id,                       // stable id, e.g. "l11-v01" — used for progress tracking later
  hanzi: z.string().min(1),
  pinyin: z.string().min(1),
  type: z.array(WordType).min(1), // array because some words are e.g. v + n
  meaning: z.string().min(1),     // Indonesian
  audio: AudioPath,
  examples: z.array(Sentence).default([]),
  isProperNoun: z.boolean().default(false), // HJ lists 专名 separately
});

// ---------- 2. 语法 Grammar ----------

/** A formula box, e.g.  Subjek + 去 + Tempat + Verba.
 *  `slot` segments are styled as placeholders, `fixed` as literal Chinese. */
export const PatternSegment = z.object({
  kind: z.enum(["slot", "fixed"]),
  text: z.string(),              // "Subjek" or "去"
  pinyin: z.string().optional(), // only for fixed segments
});

export const GrammarPoint = z.object({
  gid: Id,
  title: z.string(),                 // e.g. "Kalimat Tanya dengan 哪儿"
  explanation: z.string(),           // Markdown, Indonesian
  patterns: z.array(z.array(PatternSegment)).default([]), // one or more formula boxes
  examples: z.array(Sentence).min(1),
  commonMistakes: z
    .array(z.object({ wrong: z.string(), right: z.string(), why: z.string() }))
    .default([]),
});

// ---------- 3. 课文 Text & Dialogue ----------

export const TextLine = Sentence.and(
  z.object({ speaker: z.string().optional() }) // omit for narrative passages
);

export const TextPassage = z.object({
  tid: Id,
  title: z.object({ zh: z.string(), py: z.string(), id: z.string() }),
  kind: z.enum(["dialogue", "narrative"]),
  scene: z.string().optional(),      // short Indonesian context line
  audio: AudioPath,                  // optional full-passage audio
  lines: z.array(TextLine).min(1),
});

// ---------- 4. 练习 Practice & Quiz ----------

const QBase = z.object({
  qid: Id,
  prompt: z.string(),              // instruction in Indonesian
  explanation: z.string().optional(), // shown after answering
  ref: z.string().optional(),      // vid/gid/tid this tests — enables "review this" links
});

export const MultipleChoice = QBase.extend({
  type: z.literal("multiple_choice"),
  // Chinese being asked about, if any. No translation field on purpose —
  // it would give the answer away.
  stem: z.object({ zh: z.string(), py: z.string(), audio: AudioPath }).optional(),
  options: z.array(z.string()).min(2).max(6),
  answer: z.number().int().min(0), // index into options
}).refine((q) => q.answer < q.options.length, { message: "answer index out of range" });

/** Blanks are marked with ___ in `zh`. Each blank has a list of accepted answers. */
export const FillBlank = QBase.extend({
  type: z.literal("fill_blank"),
  zh: z.string().includes("___"),
  id: z.string().optional(),
  answers: z.array(z.array(z.string()).min(1)).min(1), // per blank, accepted variants
  wordBank: z.array(z.string()).optional(), // if present, shown as tap-to-fill chips (easier on mobile)
});

export const PinyinMatch = QBase.extend({
  type: z.literal("pinyin_match"),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).min(2).max(8),
  // left/right are usually hanzi ↔ pinyin, but can be hanzi ↔ Indonesian
});

export const ToneSelect = QBase.extend({
  type: z.literal("tone_select"),   // optional 4th type: pick the correct tone mark
  hanzi: z.string(),
  options: z.array(z.string()).min(2), // ["mā","má","mǎ","mà"]
  answer: z.number().int().min(0),
  audio: AudioPath,
}).refine((q) => q.answer < q.options.length, { message: "answer index out of range" });

// z.union (not discriminatedUnion) because .refine() wraps two of the members
export const Question = z.union([MultipleChoice, FillBlank, PinyinMatch, ToneSelect]);

// ---------- Lesson ----------

export const Lesson = z.object({
  schemaVersion: z.literal(1),
  book: z.enum(["1a", "1b", "2a", "2b", "3a", "3b"]),
  lesson: z.number().int().positive(),
  slug: Id,                                     // e.g. "1a-11" → URL /1a/11
  title: z.object({ zh: z.string(), py: z.string(), id: z.string() }),
  objectives: z.array(z.string()).default([]),  // "Setelah pelajaran ini, kamu bisa…"
  status: z.enum(["draft", "published"]).default("draft"), // drafts hidden in production
  vocabulary: z.array(VocabItem),
  grammar: z.array(GrammarPoint),
  texts: z.array(TextPassage),
  exercises: z.array(Question),
}).superRefine((l, ctx) => {
  // 1) every id unique within the lesson  2) every quiz `ref` points at a real item
  const ids = [
    ...l.vocabulary.map((v) => v.vid), ...l.grammar.map((g) => g.gid),
    ...l.texts.map((t) => t.tid), ...l.exercises.map((q) => q.qid),
  ];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) ctx.addIssue({ code: "custom", message: `duplicate id: ${id}` });
    seen.add(id);
  }
  for (const q of l.exercises) {
    if (q.ref && !seen.has(q.ref))
      ctx.addIssue({ code: "custom", message: `${q.qid}: ref "${q.ref}" not found` });
  }
  // 3) fill_blank: one answer list per ___
  for (const q of l.exercises) {
    if (q.type === "fill_blank") {
      const blanks = q.zh.split("___").length - 1;
      if (blanks !== q.answers.length)
        ctx.addIssue({ code: "custom", message: `${q.qid}: ${blanks} blanks but ${q.answers.length} answer lists` });
    }
  }
});

export type Lesson = z.infer<typeof Lesson>;
export type Sentence = z.infer<typeof Sentence>;
export type Question = z.infer<typeof Question>;
