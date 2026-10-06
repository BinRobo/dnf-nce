import { BALANCE, expToNext, expToNextV2 } from '../config';
import type { SrsCard } from '../systems/srs';

export const SAVE_VERSION = 3;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'epic';
export type Slot = 'weapon' | 'helmet' | 'armor' | 'shoes' | 'accessory' | 'ring';
export type Job = 'novice' | 'swordsman' | 'mage' | 'ranger';
export type Rank = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';

export interface Item {
  uid: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  atk: number;
  hp: number;
  crit: number; // 0~1
  enhance: number;
  enhanceFails: number; // 保底计数
  obtainedAt: number;
  from: string;
}

export interface DungeonRecord {
  clears: number;
  bestRank: Rank | null;
  bestScore: number;
  firstClearAt: number | null;
}

export interface SaveData {
  version: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  job: Job;
  /** 职业与性别（v3 起创建角色时选择；老存档 = 剑士·男） */
  cls: 'sword' | 'gunner' | 'mage';
  gender: 'm' | 'f';
  level: number;
  exp: number;
  gold: number;
  stones: number;
  fatigue: { value: number; day: string };
  dungeons: Record<string, DungeonRecord>;
  srs: Record<string, SrsCard>;
  inventory: Item[];
  equipped: Partial<Record<Slot, string>>;
  achievements: string[];
  stats: {
    answers: number;
    correct: number;
    bestCombo: number;
    playDays: string[];
    epicDrops: number;
  };
  settings: Settings;
  // ---- v2 ----
  /** 已看过的剧本 id */
  story: { seen: string[] };
  /** 已加入的伙伴（第 5 课同学等） */
  partners: string[];
  /** 每日任务进度（跨天重置） */
  daily: { day: string; newDungeon: boolean; revenge: number; spelled: number; claimed: string[] };
  /** 当天累计游戏时长（家长限时用） */
  playtime: { day: string; ms: number };
  /** 技能：已学技能等级（1–3）与技能栏（最多 4 个） */
  skills: { ranks: Record<string, number>; bar: string[]; /** 章末 Boss 首通奖励的技能点 */ bonus?: number };
  /** 商店道具：下一场战斗开始时自动使用 */
  bag: { heart: number; shield: number; hint: number };
  /** 学习日志：最近 14 天，家长报告用 */
  dayLog: Record<string, DayLog>;
  /**
   * 材料：史诗碎片（10 个打造史诗）、Boss 之魂（强化 +8 以上）、
   * 装扮材料：布料 cloth、彩色丝线 thread、铜喇叭片 brass、银名牌 badge、节日彩带 ribbon
   */
  mats: { shard: number; soul: number; cloth: number; thread: number; brass: number; badge: number; ribbon: number };
  /** 装扮：已拥有的部件（<套装>_<hat|top|bottom>）与正在穿的 */
  wardrobe: { owned: string[]; worn: { hat?: string; top?: string; bottom?: string } };
  /** 图鉴：拿到过的装备目录 id */
  codex: { items: string[] };
  /** 城镇：当前所在街区与已打造过的史诗 */
  town: { district: string };
  crafted: string[];
}

export interface Settings {
  fatigueMax: number;
  speechRate: number;
  /** 家长设置的每日时长（分钟） */
  dailyMinutes: number;
  /** 减弱震屏与闪光 */
  reduceFx: boolean;
  /** 拼写输入：auto 按年级 / tiles 字母块 / keyboard 键盘 */
  spellMode: 'auto' | 'tiles' | 'keyboard';
  /** low = 3–4 年级（更宽松的流畅时间、字母块），high = 5–6 年级 */
  grade: 'low' | 'high';
  /** 家长 PIN（4 位），首次进入家长页时设置 */
  pin: string | null;
  /** 背景音乐 / 音效开关 */
  music: boolean;
  sfx: boolean;
}

export interface DayLog {
  ms: number;
  answers: number;
  correct: number;
  /** 各题型：作答数 / 首次答对数 */
  perType: Record<string, [number, number]>;
  newWords: string[];
  reviewed: string[];
  /** 答错次数，用于“今天最难的词” */
  missed: Record<string, number>;
  lessons: string[];
}

export function today(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function newSave(id: string, name: string, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    job: 'novice',
    cls: 'sword',
    gender: 'm',
    level: 1,
    exp: 0,
    gold: 0,
    stones: 0,
    fatigue: { value: BALANCE.fatigueMax, day: today() },
    dungeons: {},
    srs: {},
    inventory: [],
    equipped: {},
    achievements: [],
    stats: { answers: 0, correct: 0, bestCombo: 0, playDays: [], epicDrops: 0 },
    settings: {
      fatigueMax: BALANCE.fatigueMax, speechRate: 0.85, dailyMinutes: 30, reduceFx: false,
      spellMode: 'auto', grade: 'low', pin: null, music: true, sfx: true,
    },
    story: { seen: [] },
    partners: [],
    daily: { day: today(), newDungeon: false, revenge: 0, spelled: 0, claimed: [] },
    playtime: { day: today(), ms: 0 },
    bag: { heart: 0, shield: 0, hint: 0 },
    skills: { ranks: { slash: 1 }, bar: ['slash'] },
    dayLog: {},
    mats: { shard: 0, soul: 0, cloth: 0, thread: 0, brass: 0, badge: 0, ribbon: 0 },
    wardrobe: { owned: [], worn: {} },
    codex: { items: [] },
    town: { district: 'campus' },
    crafted: [],
  };
}

export function emptyDayLog(): DayLog {
  return { ms: 0, answers: 0, correct: 0, perType: {}, newWords: [], reviewed: [], missed: {}, lessons: [] };
}

/**
 * 旧版本存档升级到当前版本。以后改结构时：
 * SAVE_VERSION +1，在这里加一个 `if (s.version < N)` 分支。
 * 同时用 newSave 补齐缺失字段，防止旧档缺字段崩溃。
 */
export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new Error('存档格式不正确');
  const s = raw as Partial<SaveData>;
  if (typeof s.id !== 'string' || typeof s.name !== 'string') throw new Error('存档缺少角色信息');
  if ((s.version ?? 0) > SAVE_VERSION) throw new Error('存档来自更新的游戏版本，请先更新游戏');
  const base = newSave(s.id, s.name, s.createdAt);
  const merged: SaveData = {
    ...base,
    ...s,
    fatigue: { ...base.fatigue, ...s.fatigue },
    stats: { ...base.stats, ...s.stats },
    settings: { ...base.settings, ...s.settings },
    story: { ...base.story, ...s.story },
    daily: { ...base.daily, ...s.daily },
    playtime: { ...base.playtime, ...s.playtime },
    bag: { ...base.bag, ...s.bag },
    skills: { ...base.skills, ...s.skills },
    mats: { ...base.mats, ...s.mats },
    wardrobe: { ...base.wardrobe, ...s.wardrobe },
    codex: { ...base.codex, ...s.codex },
    town: { ...base.town, ...s.town },
    version: SAVE_VERSION,
  } as SaveData;
  // v3：全书成长曲线。等级不变，当前经验按新曲线换算成相同百分比
  if ((s.version ?? 0) < 3) {
    const frac = Math.min(0.99, (s.exp ?? 0) / expToNextV2(merged.level));
    merged.exp = Math.floor(frac * expToNext(merged.level));
    // 职业：老存档按原来的转职对应（见习/剑士 → 剑士，魔法师 → 魔法师，游侠 → 神枪手）
    if (!s.cls) merged.cls = s.job === 'mage' ? 'mage' : s.job === 'ranger' ? 'gunner' : 'sword';
    // 装备栏从 3 格扩到 6 格：元音戒指移到“戒指”格
    for (const it of merged.inventory) {
      if (it.name === '元音戒指' && it.slot === 'accessory') {
        it.slot = 'ring';
        if (merged.equipped.accessory === it.uid) {
          delete merged.equipped.accessory;
          merged.equipped.ring = it.uid;
        }
      }
    }
  }
  return merged;
}

/** 跨天时：恢复疲劳值、重置每日任务与当日时长、只保留最近 14 天日志 */
export function refreshDaily(s: SaveData, day = today()): boolean {
  let changed = false;
  if (s.fatigue.day !== day) {
    s.fatigue = { value: s.settings.fatigueMax, day };
    changed = true;
  }
  if (s.daily.day !== day) {
    s.daily = { day, newDungeon: false, revenge: 0, spelled: 0, claimed: [] };
    changed = true;
  }
  if (s.playtime.day !== day) {
    s.playtime = { day, ms: 0 };
    changed = true;
  }
  const days = Object.keys(s.dayLog).sort();
  for (const d of days.slice(0, Math.max(0, days.length - 14))) delete s.dayLog[d];
  return changed;
}

/** 今天还能玩多少毫秒（家长限时） */
export function timeLeftMs(s: SaveData, day = today()) {
  const used = s.playtime.day === day ? s.playtime.ms : 0;
  return Math.max(0, s.settings.dailyMinutes * 60_000 - used);
}
