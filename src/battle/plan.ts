import { dungeonNo, levelCurve } from '../config';
import type { LessonPair, Word } from '../content/types';
import type { SaveData } from '../save/schema';
import { pick, shuffle } from '../systems/rng';
import { mastery } from '../systems/srs';
import {
  ContentIndex, drillQ, dueItems, lineFillQ, lineId, listenQ, meaningQ, orderQ, questionFor, spellQ, wordId,
  type OrderQ, type PickQ, type Question,
} from '../systems/questions';

/** 题型：怪物种类与技能都按它区分 */
export type QType = 'listen' | 'meaning' | 'fill' | 'spell' | 'order';

export const qtype = (q: Question): QType => (q.kind === 'pick' ? q.mode : q.kind);

/** 小怪种类 = 题型，孩子一看怪就知道要做什么 */
export const MOB_FOR: Record<QType, string> = { listen: 'bat', meaning: 'slime', spell: 'goblin', order: 'golem', fill: 'imp' };
/** 第二套小怪（隔一课换一套，同题型同职责）：学舌鹦鹉 / 翻页书怪 / 铅笔小兵 */
export const MOB_FOR_B: Record<QType, string> = { listen: 'parrot', meaning: 'bookworm', spell: 'pencil', order: 'golem', fill: 'imp' };
/** 新小怪暂用相近怪物的音效 */
export const MOB_SFX: Record<string, string> = { parrot: 'bat', bookworm: 'slime', pencil: 'goblin' };
/** 静默军团：名字与剧情绑定（见 docs/slice/SPEC2.md） */
export const MOB_NAME: Record<string, string> = {
  parrot: '学舌鹦鹉', bookworm: '翻页书怪', pencil: '铅笔小兵',
  bat: '噤声蝙蝠', slime: '迷镜史莱姆', goblin: '拆字哥布林', golem: '乱序魔像', imp: '空格小恶魔', fog: '怨念雾灵',
  echo: '吞音骑士 · 埃可', boss_pardon: '吞声领主 · 帕顿', boss_whomist: '夺名迷雾 · 胡迷斯', boss_generic: '静默化身',
};
/** 每课的精英与 Boss（标题 + 名字）；未配置的课用通用名 */
const ELITE: Record<string, string> = { 'L001-002': '吞音骑士 · 埃可', 'L005-006': '名牌窃贼 · 诺曼' };
export const BOSS_TITLE: Record<string, { title: string; name: string; tagline: string }> = {
  'L001-002': { title: '吞声领主', name: '帕顿', tagline: '吞掉了整条街的 “Excuse me!”' },
  'L005-006': { title: '夺名迷雾', name: '胡迷斯', tagline: '偷走了全班同学的名字' },
};
// ---------------- 全书 6 章的数据（content-src/chapters.json，Boot 时载入） ----------------

export interface ChapterData {
  bosses: Record<string, { title: string; name: string; color: string; moves: string[]; moveNames: string[]; line: string }>;
  mobs: Record<string, { name: string; qtype: 'listen' | 'meaning' | 'spell' }>;
  chapters: { ch: number; mobs: { listen: string; meaning: string; spell: string }; elite: string }[];
  dungeons: Record<string, { boss: string; tagline: string; elite?: string }>;
}
let CH: ChapterData | null = null;
const QTYPE_SFX = { listen: 'bat', meaning: 'slime', spell: 'goblin' };

export function registerChapters(d: ChapterData) {
  CH = d;
  for (const [k, m] of Object.entries(d.mobs)) {
    MOB_NAME[k] = m.name;
    MOB_SFX[k] = QTYPE_SFX[m.qtype];
  }
  for (const [k, b] of Object.entries(d.bosses)) MOB_NAME[k] = `${b.title} · ${b.name}`;
}
export const bossDef = (kind: string) => CH?.bosses[kind];

/** 副本 Boss 横幅：头衔、名字、这一课它干的坏事 */
export function bossBannerInfo(id: string, kind: string) {
  if (BOSS_TITLE[id]) return BOSS_TITLE[id];
  const b = CH?.bosses[kind];
  const tagline = CH?.dungeons[id]?.tagline ?? '';
  if (b) return { title: b.title, name: b.name, tagline };
  if (kind === 'duke') return { title: '静默军团首领', name: '缄默公爵 · 赫什', tagline };
  return undefined;
}

/** 每章“领主”所在副本（第 12、24、36、48、60 个；第 6 章是第 71 个，第 72 个是赫什） */
const lordDungeon = (ch: number) => (ch < 6 ? ch * 12 : 71);

/** 敌人等级：按课序递增（第 n 对课 ≈ Lv.n），精英 +1，Boss +2 */
export function enemyLevel(lessonIdx: number, tier: Enemy['tier']) {
  return levelCurve(lessonIdx + 1) + (tier === 'elite' ? 1 : tier === 'boss' ? 2 : 0);
}

/** Boss 专用题目附加信息 */
export interface BossTag {
  /** 第 2 阶段的“吞音”题：原声被截断，可点 Pardon? 重听 */
  muffled?: boolean;
  /** 解救的同学（Who-Mist） */
  rescue?: string;
  /** 终结技台词（播放该句原声） */
  finale?: boolean;
}

export interface Enemy {
  uid: string;
  kind: string; // 纹理名：bat / slime / … / boss_pardon
  name: string;
  tier: 'mob' | 'elite' | 'boss';
  level: number;
  /** 该敌人携带的题目，全部答对才倒下；血量 = 题数 */
  questions: (Question & { boss?: BossTag })[];
  revenge?: boolean;
}

export type RoomType = 'battle' | 'elite' | 'story' | 'chest' | 'review' | 'boss';

export interface Room {
  id: string;
  type: RoomType;
  /** 小地图 3x3 网格坐标 */
  cell: [number, number];
  optional: boolean;
  enemies: Enemy[];
  /** 剧情房：一句被雾吃掉的课文原句（听音题） */
  storyLine?: number;
}

export type BossMech = 'pardon' | 'whomist' | 'generic';

export interface BattlePlan {
  id: string;
  lesson: LessonPair | null;
  title: string;
  isAbyss: boolean;
  rooms: Room[];
  bossMech: BossMech;
  /** 剧本 id */
  story?: { intro?: string; boss?: string; clear?: string };
  video?: LessonPair['video'];
  /** 第一次通关前是否在 Boss 前播放课文动画 */
  showVideo: boolean;
}

let seq = 0;
const euid = () => `e${++seq}`;

/** 换一种题型再考同一个知识点（答错后用） */
export function altQuestion(q: Question, idx: ContentIndex): Question | null {
  const e = idx.items.get(q.itemId);
  if (!e) return null;
  if (e.type === 'word') {
    const t = qtype(q);
    const canSpell = /^[a-z]{2,10}$/i.test(e.word.en);
    if (t === 'meaning') return listenQ(e.word, idx, e.lesson.words);
    if (t === 'listen') return canSpell ? spellQ(e.word) : meaningQ(e.word, idx, e.lesson.words);
    return meaningQ(e.word, idx, e.lesson.words);
  }
  if (e.type === 'line') {
    const n = e.lesson.dialogue[e.index].en.split(/\s+/).length;
    if (q.kind === 'order') return lineFillQ(e.lesson, e.index, idx) ?? orderQ(e.lesson, e.index);
    return n >= 2 && n <= 9 ? orderQ(e.lesson, e.index) : lineFillQ(e.lesson, e.index, idx);
  }
  return drillQ(e.lesson, e.lesson.drills.indexOf(e.drill));
}

const byNeed = (words: Word[], save: SaveData) =>
  shuffle(words).sort((a, b) => mastery(save.srs[wordId(a)]) - mastery(save.srs[wordId(b)]));

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

let curLevel = 1;
let curRoster = MOB_FOR;
function mob(q: Question, revenge = false): Enemy {
  const kind = revenge ? 'fog' : curRoster[qtype(q)];
  return { uid: euid(), kind, name: MOB_NAME[kind], tier: 'mob', level: curLevel, questions: [{ ...q, revenge }], revenge };
}

/** 现有存档里的到期复习内容（其他课的） */
function reviewEnemies(save: SaveData, idx: ContentIndex, lessonId: string, max: number) {
  return shuffle(dueItems(save, idx, Date.now(), lessonId))
    .slice(0, max)
    .map((id) => questionFor(id, idx))
    .filter((q): q is Question => !!q)
    .map((q) => mob(q, true));
}

// ---------------- Boss 题目编排 ----------------

const NATIONS = ['French', 'German', 'Japanese', 'Korean', 'Chinese', 'Italian', 'Swedish', 'English', 'American'];

/** 第 5 课：从课文里找出“This is X.” + “He/She is Y.” 的同学与国籍 */
export function classmates(l: LessonPair): { name: string; pron: 'He' | 'She'; nat: string; line: number }[] {
  const out: { name: string; pron: 'He' | 'She'; nat: string; line: number }[] = [];
  l.dialogue.forEach((d, i) => {
    const m = /(He|She)(?: is|'s) (\w+)/.exec(d.en);
    if (!m || !NATIONS.includes(m[2])) return;
    // 往前找最近的名字
    for (let k = i; k >= Math.max(0, i - 2); k--) {
      const n = /(?:this is|This is) (?:Miss )?([A-Z][\w-]+)/.exec(l.dialogue[k].en) ?? /Sophie is/.exec(l.dialogue[k].en);
      if (n) {
        const name = n[1] ?? 'Sophie';
        if (!out.some((o) => o.name === name)) out.push({ name, pron: m[1] as 'He' | 'She', nat: m[2], line: i });
        break;
      }
    }
  });
  return out;
}

function whomistQuestions(l: LessonPair): (Question & { boss?: BossTag })[] {
  const kids = classmates(l).filter((k) => k.name !== 'Sophie');
  const qs: (Question & { boss?: BossTag })[] = kids.map((k) => {
    const others = shuffle(NATIONS.filter((n) => n !== k.nat)).slice(0, 3);
    const options = shuffle([k.nat, ...others]);
    const q: PickQ = {
      kind: 'pick', mode: 'fill', itemId: lineId(l, k.line),
      prompt: `This is ${k.name}. ${k.pron}'s ___.`, sub: `名牌被打乱了！${k.name} 是哪国人？`,
      speak: { text: l.dialogue[k.line].en, clip: l.dialogue[k.line].audio },
      options, answer: options.indexOf(k.nat), reveal: `${k.name}: ${k.pron}'s ${k.nat}.`,
    };
    return { ...q, boss: { rescue: k.name.toLowerCase().replace(/[^a-z]/g, '') } };
  });
  const nice = l.dialogue.findIndex((d) => d.en === 'Nice to meet you.');
  if (nice >= 0) qs.push({ ...orderQ(l, nice), boss: { finale: true } });
  return qs;
}

function pardonQuestions(l: LessonPair, idx: ContentIndex): (Question & { boss?: BossTag })[] {
  const lines = l.dialogue.map((_, i) => i);
  const uniq = lines.filter((i, k) => lines.findIndex((j) => l.dialogue[j].en === l.dialogue[i].en) === k);
  // 阶段 1：听整句选意思；阶段 2：吞音（原声被截断，可 Pardon? 重听）；阶段 3：连词成句 “Is this your handbag?”
  const listenLine = (i: number, muffled: boolean): Question & { boss?: BossTag } => {
    const d = l.dialogue[i];
    const pool = shuffle(uniq.filter((j) => l.dialogue[j].zh !== d.zh).map((j) => l.dialogue[j].zh));
    const options = shuffle([d.zh, ...pool.slice(0, 3)]);
    const q: PickQ = {
      kind: 'pick', mode: 'listen', itemId: lineId(l, i), prompt: muffled ? '回音怪把这句话说糊了！' : '听一听，这句话是什么意思？',
      speak: { text: d.en, clip: d.audio }, options, answer: options.indexOf(d.zh), reveal: `${d.en} = ${d.zh}`,
    };
    return { ...q, boss: muffled ? { muffled: true } : undefined };
  };
  const order = uniq.filter((i) => wordCount(l.dialogue[i].en) >= 2);
  const p1 = shuffle(uniq).slice(0, 2).map((i) => listenLine(i, false));
  const p2 = shuffle(uniq).slice(0, 2).map((i) => listenLine(i, true));
  const fill = shuffle(uniq).map((i) => lineFillQ(l, i, idx)).find((q) => q) ?? null;
  const target = l.dialogue.findIndex((d) => /handbag\?/.test(d.en));
  const finale = target >= 0 ? target : order[0];
  return [...p1, ...p2, ...(fill ? [fill] : []), { ...orderQ(l, finale), boss: { finale: true } }];
}

function genericBossQuestions(l: LessonPair, save: SaveData, idx: ContentIndex): Question[] {
  const seen = new Set<string>();
  const uniq = l.dialogue.map((_, i) => i).filter((i) => !seen.has(l.dialogue[i].en) && seen.add(l.dialogue[i].en));
  const need = (i: number) => mastery(save.srs[lineId(l, i)]);
  const chosen = shuffle(uniq).sort((a, b) => need(a) - need(b)).slice(0, 8).sort((a, b) => a - b);
  return chosen
    .map((i, k): Question | null => {
      const n = wordCount(l.dialogue[i].en);
      return n >= 3 && n <= 8 && k % 2 === 1 ? orderQ(l, i) : lineFillQ(l, i, idx) ?? (n >= 2 && n <= 9 ? orderQ(l, i) : null);
    })
    .filter((q): q is Question => q !== null);
}

// ---------------- 副本编排 ----------------

const MECH: Record<string, BossMech> = { 'L001-002': 'pardon', 'L005-006': 'whomist' };
const STORY: Record<string, BattlePlan['story']> = {
  'L001-002': { intro: 'L001_intro', boss: 'L001_boss', clear: 'L001_clear' },
  'L005-006': { intro: 'L005_intro', boss: 'L005_boss', clear: 'L005_clear' },
};

export function buildBattle(lesson: LessonPair, save: SaveData, idx: ContentIndex): BattlePlan {
  const li = dungeonNo(lesson.id) - 1;
  curLevel = enemyLevel(li, 'mob');
  const chap = Math.min(6, Math.ceil((li + 1) / 12));
  const cd = CH?.chapters.find((c) => c.ch === chap);
  // 第 1 章两套小怪轮换；第 2–6 章用本章的新小怪
  curRoster = chap >= 2 && cd ? { ...MOB_FOR, ...cd.mobs } : Math.floor(li / 2) % 2 ? MOB_FOR_B : MOB_FOR;
  const words = byNeed(lesson.words, save);
  const spellable = byNeed(lesson.words.filter((w) => /^[a-z]{2,9}$/i.test(w.en)), save);
  const lines = lesson.dialogue.map((_, i) => i);
  const orderable = lines.filter((i) => {
    const n = wordCount(lesson.dialogue[i].en);
    return n >= 3 && n <= 8;
  });

  // 房间 1：听音 + 识词混合；房间 2：拼写 + 填空；精英：识词/听音 3 题
  const r1 = [
    ...words.slice(0, 2).map((w) => mob(listenQ(w, idx, lesson.words))),
    ...words.slice(2, 4).map((w) => mob(meaningQ(w, idx, lesson.words))),
  ];
  const r2 = [
    ...spellable.slice(0, 2).map((w) => mob(spellQ(w))),
    ...shuffle(lesson.drills.map((_, i) => i)).slice(0, 2).map((i) => mob(drillQ(lesson, i))),
  ];
  const eliteWords = words.slice(4, 7).length >= 2 ? words.slice(4, 7) : shuffle(words).slice(0, 3);
  const elite: Enemy = {
    uid: euid(), kind: 'echo', name: ELITE[lesson.id] ?? CH?.dungeons[lesson.id]?.elite ?? cd?.elite ?? '静默精英', tier: 'elite', level: enemyLevel(li, 'elite'),
    questions: eliteWords.map((w, k) => (k % 2 ? meaningQ(w, idx, lesson.words) : listenQ(w, idx, lesson.words))),
  };
  const eliteRoom = [elite, ...(orderable.length ? [mob(orderQ(lesson, pick(orderable)))] : [])];

  // 剧情房：委托人被雾困住，听一句课文帮他说出来
  const storyLineIdx = orderable.length ? pick(orderable) : 0;
  const storyQ = listenQ({ en: lesson.dialogue[storyLineIdx].en, zh: lesson.dialogue[storyLineIdx].zh, audio: lesson.dialogue[storyLineIdx].audio }, idx, []);
  const storyLineQ: PickQ = { ...storyQ, itemId: lineId(lesson, storyLineIdx), prompt: '雾把这句话吞了，听一听，是什么意思？' };
  // 选项用本课其他句子的中文
  const zhPool = shuffle([...new Set(lesson.dialogue.map((d) => d.zh).filter((z) => z !== storyLineQ.reveal.split(' = ')[1]))]);
  const correct = lesson.dialogue[storyLineIdx].zh;
  storyLineQ.options = shuffle([correct, ...zhPool.filter((z) => z !== correct).slice(0, 3)]);
  storyLineQ.answer = storyLineQ.options.indexOf(correct);

  const review = reviewEnemies(save, idx, lesson.id, 4);
  const chestWord = spellable[2] ?? spellable[0] ?? words[0];

  const mech = MECH[lesson.id] ?? 'generic';
  const bossQs =
    mech === 'pardon' ? pardonQuestions(lesson, idx) : mech === 'whomist' ? whomistQuestions(lesson) : genericBossQuestions(lesson, save, idx);
  const bossKind = mech === 'generic' ? CH?.dungeons[lesson.id]?.boss ?? 'boss_generic' : `boss_${mech}`;
  const bi = bossBannerInfo(lesson.id, bossKind);
  const boss: Enemy = {
    uid: euid(), kind: bossKind,
    name: bi ? `${bi.title} · ${bi.name}` : `静默化身 · ${lesson.title}`,
    tier: 'boss', level: enemyLevel(li, 'boss'), questions: bossQs,
  };

  // 小地图：起点(0,1) → (1,1) 剧情 → (1,0) 精英 → (2,0) …… 简化为一条主线 + 可选支线
  const rooms: Room[] = [
    { id: 'r1', type: 'battle', cell: [0, 1], optional: false, enemies: r1 },
    { id: 'story', type: 'story', cell: [1, 1], optional: false, enemies: [mob(storyLineQ)], storyLine: storyLineIdx },
    ...(chestWord ? [{ id: 'chest', type: 'chest' as const, cell: [1, 2] as [number, number], optional: true, enemies: [mob(spellQ(chestWord))] }] : []),
    { id: 'r2', type: 'battle', cell: [1, 0], optional: false, enemies: r2 },
    { id: 'elite', type: 'elite', cell: [2, 0], optional: false, enemies: eliteRoom },
    ...(review.length ? [{ id: 'review', type: 'review' as const, cell: [2, 2] as [number, number], optional: true, enemies: review }] : []),
    { id: 'boss', type: 'boss', cell: [2, 1], optional: false, enemies: [boss] },
  ];
  // 防止空房间（课文太短时）
  const nonEmpty = rooms.filter((r) => r.enemies.every((e) => e.questions.length > 0) && r.enemies.length > 0);

  return {
    id: lesson.id, lesson, title: `${lesson.title} ${lesson.titleZh}`, isAbyss: false,
    rooms: nonEmpty, bossMech: mech, story: STORY[lesson.id] ?? chapterStory(li + 1), video: lesson.video,
    showVideo: !!lesson.video && !(save.dungeons[lesson.id]?.clears),
  };
}

/** 章末领主战与大结局的剧本 */
function chapterStory(k: number): BattlePlan['story'] {
  if (k === 72) return { boss: 'ch6_boss', clear: 'finale' };
  const ch = Math.min(6, Math.ceil(k / 12));
  return k === lordDungeon(ch) && ch < 6 ? { boss: `ch${ch}_boss`, clear: `ch${ch}_clear` } : k === 71 ? { clear: 'ch6_clear' } : undefined;
}

/** 每日深渊：全部是到期复习的雾精 + 深渊之主 */
export function buildAbyssBattle(save: SaveData, idx: ContentIndex): BattlePlan {
  curLevel = 3;
  curRoster = MOB_FOR;
  const due = dueItems(save, idx).slice(0, 16);
  const qs = due.map((id) => questionFor(id, idx)).filter((q): q is Question => !!q);
  const rooms: Room[] = [];
  const bossQs = qs.splice(Math.max(0, qs.length - 4));
  for (let i = 0; i < qs.length; i += 4) {
    rooms.push({ id: `a${i}`, type: 'review', cell: [rooms.length % 3, Math.floor(rooms.length / 3)], optional: false, enemies: qs.slice(i, i + 4).map((q) => mob(q, true)) });
  }
  if (bossQs.length) {
    rooms.push({
      id: 'boss', type: 'boss', cell: [2, 2], optional: false,
      enemies: [{ uid: euid(), kind: 'boss_generic', name: '深渊之主', tier: 'boss', level: 5, questions: bossQs }],
    });
  }
  return { id: 'abyss', lesson: null, title: '每日深渊 · 复习', isAbyss: true, rooms, bossMech: 'generic', showVideo: false };
}

export const isOrder = (q: Question): q is OrderQ => q.kind === 'order';
