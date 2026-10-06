import { BALANCE, dungeonNo, expPerCorrect } from '../config';
import type { Item, Rank, SaveData } from '../save/schema';
import { emptyDayLog, today } from '../save/schema';
import { makeItem, recordCodex, rollRarity } from './items';
import { chapterOf } from './catalog';
import { classOf } from './classes';
import { fullSet, MAT_INFO, type MatKey } from './costumes';

/** Boss 掉的装扮材料 */
const BOSS_MAT: Record<string, MatKey> = { 'L001-002': 'brass', 'L005-006': 'badge' };
export const matName = (k: MatKey) => MAT_INFO[k].name;
import { addExp, playerStats } from './player';
import { RANK_ORDER, rate, type AnswerLog, type DungeonPlan } from './questions';
import { review } from './srs';

export interface RunResult {
  cleared: boolean;
  rank: Rank;
  score: number;
  accuracy: number;
  exp: number;
  gold: number;
  stones: number;
  /** 史诗碎片 / Boss 之魂 */
  shards: number;
  /** 装扮材料 */
  mats: Partial<Record<MatKey, number>>;
  souls: number;
  levelUps: number;
  loot: Item[];
  firstClear: boolean;
  newAchievements: string[];
  bestCombo: number;
}

export const ACHIEVEMENTS: Record<string, { name: string; desc: string; test: (s: SaveData) => boolean }> = {
  first_clear: { name: '初出茅庐', desc: '第一次通关副本', test: (s) => Object.values(s.dungeons).some((d) => d.clears > 0) },
  combo10: { name: '连击达人', desc: '单局连击达到 10', test: (s) => s.stats.bestCombo >= 10 },
  words50: { name: '百词斩·上', desc: '累计答对 50 题', test: (s) => s.stats.correct >= 50 },
  words200: { name: '百词斩·下', desc: '累计答对 200 题', test: (s) => s.stats.correct >= 200 },
  sss: { name: '完美演出', desc: '获得一次 SSS 评级', test: (s) => Object.values(s.dungeons).some((d) => d.bestRank === 'SSS') },
  epic: { name: '天选之人', desc: '获得史诗装备', test: (s) => s.stats.epicDrops > 0 },
  days3: { name: '持之以恒', desc: '累计 3 天进行冒险', test: (s) => s.stats.playDays.length >= 3 },
  days7: { name: '冒险一周', desc: '累计 7 天进行冒险', test: (s) => s.stats.playDays.length >= 7 },
};

/** 记录当天的学习日志（家长报告） */
export function logDay(save: SaveData, plan: Pick<DungeonPlan, 'id' | 'isAbyss'>, logs: AnswerLog[], day = today()) {
  const d = (save.dayLog[day] ??= emptyDayLog());
  d.answers += logs.length;
  for (const l of logs) {
    if (l.firstTry) d.correct++;
    const t = l.type ?? 'other';
    const pt = (d.perType[t] ??= [0, 0]);
    pt[0]++;
    if (l.firstTry) pt[1]++;
    if (!l.firstTry) d.missed[l.itemId] = (d.missed[l.itemId] ?? 0) + 1;
    if (l.itemId.startsWith('w:')) {
      const bucket = save.srs[l.itemId]?.seen ? d.reviewed : d.newWords;
      if (!d.newWords.includes(l.itemId) && !d.reviewed.includes(l.itemId)) bucket.push(l.itemId);
    }
  }
  if (!plan.isAbyss && !d.lessons.includes(plan.id)) d.lessons.push(plan.id);
}

export interface DailyTask {
  id: string;
  name: string;
  goal: number;
  progress: (s: SaveData) => number;
  reward: { stones?: number; gold?: number };
}

export const DAILY_TASKS: DailyTask[] = [
  { id: 'new', name: '推进 1 个新副本', goal: 1, progress: (s) => (s.daily.newDungeon ? 1 : 0), reward: { stones: 2 } },
  { id: 'revenge', name: '打散 5 只复习雾精', goal: 5, progress: (s) => s.daily.revenge, reward: { stones: 1, gold: 60 } },
  { id: 'spell', name: '拼出 8 个单词', goal: 8, progress: (s) => s.daily.spelled, reward: { gold: 100 } },
];

export function claimDaily(save: SaveData, id: string): boolean {
  const t = DAILY_TASKS.find((x) => x.id === id);
  if (!t || save.daily.claimed.includes(id) || t.progress(save) < t.goal) return false;
  save.daily.claimed.push(id);
  save.stones += t.reward.stones ?? 0;
  save.gold += t.reward.gold ?? 0;
  save.mats.ribbon += 1;
  return true;
}

export function canEnter(save: SaveData, isAbyss: boolean) {
  return save.fatigue.value >= (isAbyss ? BALANCE.fatigueCost.abyss : BALANCE.fatigueCost.dungeon);
}

export function consumeFatigue(save: SaveData, isAbyss: boolean) {
  save.fatigue.value -= isAbyss ? BALANCE.fatigueCost.abyss : BALANCE.fatigueCost.dungeon;
  const d = today();
  if (!save.stats.playDays.includes(d)) save.stats.playDays.push(d);
}

/** 每道题只记录第一次作答（答错后重新出现的那次不计入记忆曲线） */
export function finishRun(save: SaveData, plan: Pick<DungeonPlan, 'id' | 'title' | 'isAbyss'>, logs: AnswerLog[], bestCombo: number, cleared: boolean): RunResult {
  const now = Date.now();
  for (const l of logs) {
    const grade = !l.firstTry ? 1 : l.ms < 6000 ? 5 : 4;
    save.srs[l.itemId] = review(save.srs[l.itemId], grade, now);
  }
  const correct = logs.filter((l) => l.firstTry).length;
  save.stats.answers += logs.length;
  save.stats.correct += correct;
  save.stats.bestCombo = Math.max(save.stats.bestCombo, bestCombo);

  logDay(save, plan, logs);
  const { rank, score, accuracy } = cleared ? rate(logs, bestCombo) : { ...rate(logs, bestCombo), rank: 'C' as Rank };
  const comboMult = 1 + Math.min(1, bestCombo * playerStats(save).comboBonus * 0.2);
  // 深渊按已通关的最远副本算经验
  const k = plan.isAbyss ? Math.max(1, ...Object.keys(save.dungeons).filter((id) => save.dungeons[id].clears > 0).map(dungeonNo)) : dungeonNo(plan.id);
  let exp = Math.round(correct * expPerCorrect(k) * comboMult);
  let gold = correct * BALANCE.goldPerCorrect;
  let stones = 0;
  let shards = 0;
  const mats: Partial<Record<MatKey, number>> = {};
  let souls = 0;
  const loot: Item[] = [];
  let firstClear = false;

  if (cleared) {
    if (!plan.isAbyss) {
      const rec = (save.dungeons[plan.id] ??= { clears: 0, bestRank: null, bestScore: 0, firstClearAt: null });
      if (rec.clears === 0) {
        firstClear = true;
        rec.firstClearAt = now;
        exp += BALANCE.expFirstClear + 3 * (k - 1);
        // 每章最后一个副本（第 12、24…72 个）首通：额外 1 技能点
        if (k % 12 === 0) save.skills.bonus = (save.skills.bonus ?? 0) + 1;
      }
      rec.clears++;
      rec.bestScore = Math.max(rec.bestScore, score);
      if (!rec.bestRank || RANK_ORDER.indexOf(rank) > RANK_ORDER.indexOf(rec.bestRank)) rec.bestRank = rank;
    }
    const luck = plan.isAbyss ? 1.5 : 1;
    // 新手第一件武器必掉；每个副本首通保底蓝色以上
    const hasWeapon = save.inventory.some((i) => i.slot === 'weapon');
    let r = hasWeapon ? rollRarity(rank, luck) : 'uncommon';
    if (firstClear && r === 'common') r = 'uncommon';
    loot.push(makeItem(r, save.level, plan.title, hasWeapon ? undefined : 'weapon', chapterOf(k), classOf(save)));
    if (!plan.isAbyss && firstClear) save.daily.newDungeon = true;
    if (rank === 'SSS' || rank === 'SS' || plan.isAbyss) loot.push(makeItem(rollRarity(rank, luck), save.level, plan.title, undefined, chapterOf(k), classOf(save)));
    stones = plan.isAbyss ? 3 : 1 + (RANK_ORDER.indexOf(rank) >= 3 ? 1 : 0);
    gold += 30;
    // 装扮材料
    mats.cloth = 2 + Math.floor(correct / 6);
    if (!plan.isAbyss) {
      mats.thread = 1;
      const boss = BOSS_MAT[plan.id];
      if (boss) mats[boss] = firstClear ? 2 : 1;
    }
    for (const [mk, n] of Object.entries(mats) as [MatKey, number][]) save.mats[mk] += n;
    // 穿齐整套装扮：金币 +5%
    if (fullSet(save)) gold = Math.round(gold * 1.05);
    // 史诗碎片：首通 3 个，之后每次 1 个（S 以上再 +1）；Boss 之魂每次 1 个（SS 以上 2 个）
    const good = RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf('S');
    if (plan.isAbyss) shards = 1;
    else {
      shards = firstClear ? 3 : 1 + (good ? 1 : 0);
      souls = rank === 'SS' || rank === 'SSS' ? 2 : 1;
    }
    // 随机掉到的史诗武器改成碎片：史诗武器只能靠打造
    for (let i = 0; i < loot.length; i++) {
      if (loot[i].rarity === 'epic' && loot[i].slot === 'weapon') {
        loot[i] = makeItem('legendary', save.level, plan.title, 'weapon', chapterOf(k), classOf(save));
        shards += 3;
      }
    }
    save.mats.shard += shards;
    save.mats.soul += souls;
  }

  for (const it of loot) if (it.rarity === 'epic') save.stats.epicDrops++;
  save.inventory.push(...loot);
  recordCodex(save, loot);
  save.gold += gold;
  save.stones += stones;
  const levelUps = addExp(save, exp);

  const newAchievements: string[] = [];
  for (const [id, a] of Object.entries(ACHIEVEMENTS)) {
    if (!save.achievements.includes(id) && a.test(save)) {
      save.achievements.push(id);
      newAchievements.push(id);
    }
  }
  return { cleared, rank, score, accuracy, exp, gold, stones, shards, souls, mats, levelUps, loot, firstClear, newAchievements, bestCombo };
}
