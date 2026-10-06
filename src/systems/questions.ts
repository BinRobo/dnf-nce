import type { AudioClip, Drill, LessonPair, Word } from '../content/types';
import type { Rank, SaveData } from '../save/schema';
import { mastery } from './srs';
import { pick, shuffle } from './rng';

export interface Speakable {
  text: string;
  clip?: AudioClip;
}

interface QBase {
  itemId: string;
  /** 来自其他关卡、到期复习的“怨念怪” */
  revenge?: boolean;
}
export interface PickQ extends QBase {
  kind: 'pick';
  mode: 'listen' | 'meaning' | 'fill';
  prompt: string;
  sub?: string;
  speak?: Speakable;
  options: string[];
  answer: number;
  reveal: string;
}
export interface SpellQ extends QBase {
  kind: 'spell';
  word: string;
  zh: string;
  speak: Speakable;
  tiles: string[];
}
export interface OrderQ extends QBase {
  kind: 'order';
  zh: string;
  answer: string[];
  chips: string[];
  speak: Speakable;
}
export type Question = PickQ | SpellQ | OrderQ;

export type MonsterKind = 'slime' | 'goblin' | 'ghost' | 'boss' | 'abyss';
export interface Room {
  name: string;
  kind: 'mob' | 'elite' | 'boss';
  monster: MonsterKind;
  questions: Question[];
}
export interface DungeonPlan {
  id: string;
  title: string;
  isAbyss: boolean;
  rooms: Room[];
  /** Boss 前播放的课文动画 */
  video?: AudioClip;
}

// ---------- 内容索引 ----------

export type IndexEntry =
  | { type: 'word'; lesson: LessonPair; word: Word }
  | { type: 'line'; lesson: LessonPair; index: number }
  | { type: 'drill'; lesson: LessonPair; drill: Drill };

export const wordId = (w: Word) => `w:${w.en.toLowerCase()}`;
export const lineId = (l: LessonPair, i: number) => `s:${l.id}:${i}`;
export const drillId = (l: LessonPair, i: number) => `d:${l.id}:${i}`;

export class ContentIndex {
  readonly items = new Map<string, IndexEntry>();
  readonly allWords: Word[] = [];
  readonly lessons: LessonPair[] = [];
  constructor(lessons: LessonPair[]) {
    for (const l of lessons) this.add(l);
  }

  /** 按需加载的课文加入索引（重复加入会忽略） */
  add(l: LessonPair) {
    if (this.lessons.some((x) => x.id === l.id)) return;
    this.lessons.push(l);
    this.lessons.sort((a, b) => a.id.localeCompare(b.id));
    for (const w of l.words) {
      const id = wordId(w);
      if (!this.items.has(id)) {
        this.items.set(id, { type: 'word', lesson: l, word: w });
        this.allWords.push(w);
      }
    }
    l.dialogue.forEach((_, i) => this.items.set(lineId(l, i), { type: 'line', lesson: l, index: i }));
    l.drills.forEach((d, i) => this.items.set(drillId(l, i), { type: 'drill', lesson: l, drill: d }));
  }
  lesson(id: string) {
    return this.lessons.find((l) => l.id === id);
  }
}

// ---------- 题目生成 ----------

const tokenize = (s: string) => s.split(/\s+/).filter(Boolean);
const withIpa = (w: Word) => (w.ipa ? `${w.en} /${w.ipa}/` : w.en);
const bare = (s: string) => s.replace(/[.,!?;:"]/g, '');

function distractors<T>(pool: T[], exclude: (t: T) => boolean, n: number): T[] {
  return shuffle(pool.filter((t) => !exclude(t))).slice(0, n);
}

function wordSpeak(w: Word): Speakable {
  return { text: w.en, clip: w.audio };
}

export function listenQ(w: Word, idx: ContentIndex, lessonWords: Word[]): PickQ {
  const pool = [...lessonWords, ...idx.allWords];
  const others = distractors(pool, (x) => x.zh === w.zh, 12);
  const uniq = [...new Set(others.map((x) => x.zh))].slice(0, 3);
  const options = shuffle([w.zh, ...uniq]);
  return {
    kind: 'pick', mode: 'listen', itemId: wordId(w),
    prompt: '听一听，选出意思', speak: wordSpeak(w),
    options, answer: options.indexOf(w.zh), reveal: `${withIpa(w)} = ${w.zh}`,
  };
}

export function meaningQ(w: Word, idx: ContentIndex, lessonWords: Word[]): PickQ {
  const pool = [...lessonWords, ...idx.allWords];
  // 干扰项不能和正确答案只差大小写（miss / Miss），也不能互相只差大小写
  const seen = new Set([w.en.toLowerCase()]);
  const uniq = distractors(pool, (x) => x.en.toLowerCase() === w.en.toLowerCase(), 12)
    .map((x) => x.en)
    .filter((en) => !seen.has(en.toLowerCase()) && !!seen.add(en.toLowerCase()))
    .slice(0, 3);
  const options = shuffle([w.en, ...uniq]);
  return {
    kind: 'pick', mode: 'meaning', itemId: wordId(w),
    prompt: w.zh, sub: '选出对应的英文单词',
    options, answer: options.indexOf(w.en), reveal: `${w.zh} = ${withIpa(w)}`,
  };
}

export function spellQ(w: Word): SpellQ {
  const letters = w.en.toLowerCase().split('');
  const extra = shuffle('abcdefghijklmnopqrstuvwxyz'.split('').filter((c) => !letters.includes(c))).slice(0, letters.length > 6 ? 2 : 3);
  return {
    kind: 'spell', itemId: wordId(w), word: w.en.toLowerCase(), zh: w.zh,
    speak: wordSpeak(w), tiles: shuffle([...letters, ...extra]),
  };
}

export function drillQ(l: LessonPair, i: number): PickQ {
  const d = l.drills[i];
  const options = shuffle(d.options);
  return {
    kind: 'pick', mode: 'fill', itemId: drillId(l, i),
    prompt: d.en, sub: d.zh, options, answer: options.indexOf(d.answer),
    reveal: d.en.replace('___', d.answer),
  };
}

export function orderQ(l: LessonPair, i: number): OrderQ {
  const line = l.dialogue[i];
  const answer = tokenize(line.en);
  let chips = shuffle(answer);
  for (let t = 0; t < 5 && chips.join(' ') === answer.join(' '); t++) chips = shuffle(answer);
  return { kind: 'order', itemId: lineId(l, i), zh: line.zh, answer, chips, speak: { text: line.en, clip: line.audio } };
}

/** 课文挖空：挖掉句子里一个本课生词 */
export function lineFillQ(l: LessonPair, i: number, idx: ContentIndex): PickQ | null {
  const line = l.dialogue[i];
  const toks = tokenize(line.en);
  const vocab = new Set(l.words.map((w) => w.en.toLowerCase()));
  const cands = toks.map((t, k) => [bare(t), k] as const).filter(([t]) => vocab.has(t.toLowerCase()) || t.length > 3);
  if (!cands.length) return null;
  const [target, k] = pick(cands);
  const blanked = toks.map((t, j) => (j === k ? t.replace(target, '___') : t)).join(' ');
  const pool = [...l.words.map((w) => w.en), ...idx.allWords.map((w) => w.en)];
  // 统一大小写，避免“只有正确答案首字母大写”泄露答案
  const cap = /^[A-Z]/.test(target);
  const fmt = (w: string) => (w === 'I' ? w : cap ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase());
  const others = [...new Set(pool.map(fmt).filter((x) => x !== target && x.toLowerCase() !== target.toLowerCase()))];
  const options = shuffle([target, ...shuffle(others).slice(0, 3)]);
  return {
    kind: 'pick', mode: 'fill', itemId: lineId(l, i),
    prompt: blanked, sub: line.zh, speak: { text: line.en, clip: line.audio },
    options, answer: options.indexOf(target), reveal: line.en,
  };
}

/** 由内容索引里的某一条，生成一道复习题 */
export function questionFor(itemId: string, idx: ContentIndex): Question | null {
  const e = idx.items.get(itemId);
  if (!e) return null;
  if (e.type === 'word') {
    const r = Math.random();
    const canSpell = /^[a-z]{2,10}$/i.test(e.word.en);
    if (r < 0.34) return listenQ(e.word, idx, e.lesson.words);
    if (r < 0.67 || !canSpell) return meaningQ(e.word, idx, e.lesson.words);
    return spellQ(e.word);
  }
  if (e.type === 'drill') return drillQ(e.lesson, e.lesson.drills.indexOf(e.drill));
  const n = tokenize(e.lesson.dialogue[e.index].en).length;
  if (n >= 3 && n <= 8 && Math.random() < 0.6) return orderQ(e.lesson, e.index);
  return lineFillQ(e.lesson, e.index, idx);
}

// ---------- 副本编排 ----------

/** 掌握度低、没见过的优先出题 */
function byNeed(words: Word[], save: SaveData) {
  return shuffle(words).sort((a, b) => mastery(save.srs[wordId(a)]) - mastery(save.srs[wordId(b)]));
}

export function dueItems(save: SaveData, idx: ContentIndex, now = Date.now(), excludeLesson?: string) {
  return Object.entries(save.srs)
    .filter(([id, c]) => c.due <= now && idx.items.has(id) && idx.items.get(id)!.lesson.id !== excludeLesson)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id);
}

export function buildDungeon(lesson: LessonPair, save: SaveData, idx: ContentIndex): DungeonPlan {
  const words = byNeed(lesson.words, save);
  const listenWords = words.slice(0, 4);
  const meaningWords = words.slice(4, 8).length >= 2 ? words.slice(4, 8) : shuffle(words).slice(0, 4);
  const spellable = byNeed(lesson.words.filter((w) => /^[a-z]{2,9}$/i.test(w.en)), save);
  const spellWords = spellable.slice(0, 3);

  const lines = lesson.dialogue.map((_, i) => i);
  const orderable = lines.filter((i) => {
    const n = tokenize(lesson.dialogue[i].en).length;
    return n >= 3 && n <= 8;
  });
  const drills = shuffle(lesson.drills.map((_, i) => i)).slice(0, 2);

  const revenge = shuffle(dueItems(save, idx, Date.now(), lesson.id)).slice(0, 3);
  const withRevenge = (qs: Question[], k: number) => {
    const q = revenge[k] ? questionFor(revenge[k], idx) : null;
    if (q) qs.push({ ...q, revenge: true });
    return qs;
  };

  // Boss：从课文里挑最多 8 句（没学过、掌握度低的优先），按课文顺序推进
  const seen = new Set<string>();
  const unique = lines.filter((i) => {
    const en = lesson.dialogue[i].en;
    if (seen.has(en)) return false;
    seen.add(en);
    return true;
  });
  const need = (i: number) => mastery(save.srs[lineId(lesson, i)]);
  const chosen = shuffle(unique).sort((a, b) => need(a) - need(b)).slice(0, 8).sort((a, b) => a - b);
  const bossQs: Question[] = [];
  chosen.forEach((i, k) => {
    const q = orderable.includes(i) && k % 2 === 1 ? orderQ(lesson, i) : lineFillQ(lesson, i, idx) ?? (orderable.includes(i) ? orderQ(lesson, i) : null);
    if (q) bossQs.push(q);
  });

  return {
    id: lesson.id,
    title: `${lesson.title} ${lesson.titleZh}`,
    isAbyss: false,
    video: lesson.video,
    rooms: [
      { name: '听音辨义', kind: 'mob', monster: 'slime', questions: withRevenge(listenWords.map((w) => listenQ(w, idx, lesson.words)), 0) },
      { name: '见义识词', kind: 'mob', monster: 'goblin', questions: withRevenge(meaningWords.map((w) => meaningQ(w, idx, lesson.words)), 1) },
      { name: '拼写搓招', kind: 'elite', monster: 'goblin', questions: withRevenge(spellWords.map((w) => spellQ(w)), 2) },
      {
        name: '句型试炼', kind: 'mob', monster: 'slime',
        questions: [...drills.map((i) => drillQ(lesson, i)), ...shuffle(orderable).slice(0, 1).map((i) => orderQ(lesson, i))],
      },
      { name: `BOSS · ${lesson.title}`, kind: 'boss', monster: 'boss', questions: bossQs },
    ].filter((r) => r.questions.length > 0) as Room[],
  };
}

/** 每日深渊：全部由到期复习的内容组成 */
export function buildAbyss(save: SaveData, idx: ContentIndex): DungeonPlan {
  const due = dueItems(save, idx).slice(0, 16);
  const qs = due.map((id) => questionFor(id, idx)).filter((q): q is Question => !!q);
  const rooms: Room[] = [];
  for (let i = 0; i < qs.length; i += 4) {
    const last = i + 4 >= qs.length;
    rooms.push({
      name: last ? '深渊之主' : `深渊 ${rooms.length + 1} 层`,
      kind: last ? 'boss' : 'mob',
      monster: last ? 'abyss' : 'ghost',
      questions: qs.slice(i, i + 4),
    });
  }
  return { id: 'abyss', title: '每日深渊 · 复习', isAbyss: true, rooms };
}

// ---------- 评级 ----------

export interface AnswerLog {
  itemId: string;
  firstTry: boolean;
  ms: number;
  /** 在该题型的“流畅时间”内完成（v2） */
  fluent?: boolean;
  /** 题型（v2，家长报告用） */
  type?: string;
}

/**
 * 评级：首次正确率 70% + 流畅率 15% + 连对 15%。速度只体现在“流畅”里，没有倒计时。
 * 旧日志没有 fluent 字段时按 6 秒判断。
 */
export function rate(logs: AnswerLog[], bestCombo = 0): { rank: Rank; score: number; accuracy: number } {
  if (!logs.length) return { rank: 'C', score: 0, accuracy: 0 };
  const accuracy = logs.filter((l) => l.firstTry).length / logs.length;
  const fluent = logs.filter((l) => l.firstTry && (l.fluent ?? l.ms <= 6000)).length / logs.length;
  const combo = Math.min(1, bestCombo / Math.max(3, Math.ceil(logs.length * 0.6)));
  const score = Math.round(accuracy * 70 + fluent * 15 + combo * 15);
  const rank: Rank =
    accuracy === 1 && fluent >= 0.8 ? 'SSS' : score >= 90 ? 'SS' : score >= 80 ? 'S' : score >= 68 ? 'A' : score >= 55 ? 'B' : 'C';
  return { rank, score, accuracy };
}

export const RANK_ORDER: Rank[] = ['C', 'B', 'A', 'S', 'SS', 'SSS'];
