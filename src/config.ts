/** 数值配置集中在这里，方便调平衡。 */
export const BALANCE = {
  fatigueMax: 100,
  fatigueCost: { dungeon: 20, abyss: 15 },
  abyssMinDue: 5,
  baseHp: 5,
  baseAtk: 10,
  atkPerLevel: 3,
  /** 全书 72 个副本，打完约 60 级 */
  maxLevel: 60,
  expPerCorrect: 10,
  expFirstClear: 120,
  goldPerCorrect: 5,
  /** 第一次转职等级 */
  jobChangeLevel: 10,
  enhanceMax: 12,
};

/** 升级所需经验：前快后慢（按 72 个副本模拟拟合，见 docs/round4 方案） */
export const expToNext = (level: number) => Math.round(180 + 39 * Math.pow(level, 1.2));
/** 旧版（v2 存档）的升级经验，迁移时换算用 */
export const expToNextV2 = (level: number) => 100 + (level - 1) * 60;
/** 第几个副本（1–72）：L001-002 → 1，L143-144 → 72 */
export const dungeonNo = (id: string) => Math.max(1, Math.ceil(parseInt(id.slice(1, 4), 10) / 2) || 1);
/** 每答对一题的经验：越后面的课越多（第 1 个副本 10，第 72 个约 45） */
export const expPerCorrect = (dungeon: number) => 10 + 0.5 * (dungeon - 1);
/** 第 k 个副本的怪物等级，与成长曲线一致 */
export const levelCurve = (dungeon: number) => Math.round(1 + 59 * Math.pow(Math.min(72, Math.max(1, dungeon)) / 72, 0.75));

export const GAME_W = 1280;
export const GAME_H = 720;
