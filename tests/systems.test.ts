import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LessonPair } from '../src/content/types';
import { newSave } from '../src/save/schema';
import { canCraft, craftEpic, EPIC_WEAPONS, makeItem, tryEnhance } from '../src/systems/items';
import { addExp } from '../src/systems/player';
import { buildAbyss, buildDungeon, ContentIndex, rate } from '../src/systems/questions';
import { finishRun } from '../src/systems/session';
import { review } from '../src/systems/srs';

const load = (id: string) => JSON.parse(readFileSync(`public/content/book1/lessons/${id}.json`, 'utf8')) as LessonPair;
const lessons = [load('L001-002'), load('L003-004')];
const idx = new ContentIndex(lessons);

describe('题目与副本', () => {
  it('每个副本 5 个房间，题目答案合法', () => {
    for (const l of lessons) {
      const plan = buildDungeon(l, newSave('a', 'a'), idx);
      expect(plan.rooms.map((r) => r.kind)).toEqual(['mob', 'mob', 'elite', 'mob', 'boss']);
      for (const q of plan.rooms.flatMap((r) => r.questions)) {
        if (q.kind === 'pick') {
          expect(q.options[q.answer]).toBeDefined();
          expect(new Set(q.options).size).toBe(q.options.length);
        }
        if (q.kind === 'spell') for (const ch of q.word) expect(q.tiles).toContain(ch);
        if (q.kind === 'order') expect([...q.chips].sort()).toEqual([...q.answer].sort());
      }
    }
  });

  it('答错的内容到期后进入深渊，并作为怨念怪混入其他副本', () => {
    const s = newSave('a', 'a');
    const plan = buildDungeon(lessons[0], s, idx);
    const logs = plan.rooms.flatMap((r) => r.questions).map((q) => ({ itemId: q.itemId, firstTry: false, ms: 3000 }));
    finishRun(s, plan, logs, 0, true);
    const later = Date.now() + 3600_000;
    for (const c of Object.values(s.srs)) c.due = later - 1;
    const realNow = Date.now;
    Date.now = () => later;
    try {
      const abyss = buildAbyss(s, idx);
      expect(abyss.rooms.length).toBeGreaterThan(0);
      expect(abyss.rooms.at(-1)!.kind).toBe('boss');
      const other = buildDungeon(lessons[1], s, idx);
      expect(other.rooms.flatMap((r) => r.questions).some((q) => q.revenge)).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });
});

describe('成长', () => {
  it('评级', () => {
    const perfect = Array.from({ length: 10 }, (_, i) => ({ itemId: `${i}`, firstTry: true, ms: 2000 }));
    expect(rate(perfect).rank).toBe('SSS');
    expect(rate(perfect.map((l, i) => ({ ...l, firstTry: i > 4 }))).rank).toBe('C');
  });

  it('首通给经验和武器，记录最佳评级', () => {
    const s = newSave('a', 'a');
    const plan = buildDungeon(lessons[0], s, idx);
    const logs = plan.rooms.flatMap((r) => r.questions).map((q) => ({ itemId: q.itemId, firstTry: true, ms: 2000 }));
    const r = finishRun(s, plan, logs, logs.length, true);
    expect(r.firstClear).toBe(true);
    expect(r.levelUps).toBeGreaterThan(0);
    expect(s.inventory.some((i) => i.slot === 'weapon')).toBe(true);
    expect(s.dungeons[plan.id].bestRank).toBe('SSS');
    expect(s.achievements).toContain('first_clear');
    // 首通 Boss：3 个史诗碎片，SSS 给 2 个 Boss 之魂
    expect(r.shards).toBeGreaterThanOrEqual(3); // 随机掉到史诗武器时额外 +3
    expect(s.mats.shard).toBe(r.shards);
    expect(s.mats.soul).toBe(2);
    expect(s.inventory.some((i) => i.rarity === 'epic' && i.slot === 'weapon')).toBe(false);
  });

  it('升级可连升多级且不超过上限', () => {
    const s = newSave('a', 'a');
    expect(addExp(s, 1000)).toBeGreaterThan(1);
    addExp(s, 1e9);
    expect(s.level).toBe(60);
  });

  it('强化失败不掉级，保底提高成功率', () => {
    const s = newSave('a', 'a');
    s.gold = 1e6;
    s.stones = 1e4;
    const it = makeItem('rare', 1, 't', 'weapon');
    for (let i = 0; i < 300 && it.enhance < 12; i++) {
      const before = it.enhance;
      tryEnhance(s, it);
      expect(it.enhance).toBeGreaterThanOrEqual(before);
    }
    expect(it.enhance).toBe(7);
    // +8 以上需要 Boss 之魂
    s.mats.soul = 100;
    while (it.enhance < 12) expect(tryEnhance(s, it)).toBe('ok');
    expect(s.mats.soul).toBe(100 - (1 + 2 + 3 + 4 + 5));
  });

  it('史诗武器靠碎片打造，随机掉落的史诗武器换成碎片', () => {
    const s = newSave('a', 'a');
    s.gold = 1000;
    s.mats.shard = 9;
    expect(canCraft(s)).toBe(false);
    expect(craftEpic(s, EPIC_WEAPONS[1].name)).toBeNull();
    s.mats.shard = 10;
    const it = craftEpic(s, EPIC_WEAPONS[1].name)!;
    expect(it.rarity).toBe('epic');
    expect(it.name).toBe(EPIC_WEAPONS[1].name);
    expect(s.mats.shard).toBe(0);
    expect(s.crafted).toContain(it.name);
  });

  it('间隔复习：答对间隔变长，答错 10 分钟后再来', () => {
    let c = review(undefined, 5, 0);
    expect(c.interval).toBe(1);
    c = review(c, 5, 0);
    expect(c.interval).toBe(3);
    c = review(c, 1, 0);
    expect(c.due).toBe(10 * 60 * 1000);
  });
});

describe('职业、技能树、装扮', () => {
  it('神枪手 / 魔法师技能数据载入后：基础技能可用，老技能被清掉并退点', async () => {
    const { registerClassSkills, normalizeSkills, skillTree, baseSkill, skillPoints, learn } = await import('../src/battle/skilldata');
    for (const c of ['gunner', 'mage'] as const) registerClassSkills(c, JSON.parse(readFileSync(`content-src/skills/${c}.json`, 'utf8')));
    const s = newSave('a', 'a');
    s.level = 5;
    s.skills.ranks = { slash: 1, rising: 2 };
    s.cls = 'mage';
    normalizeSkills(s);
    expect(baseSkill(s)).toBe('m_spark');
    expect(s.skills.ranks).toEqual({ m_spark: 1 });
    expect(s.skills.bar).toEqual(['m_spark']);
    expect(skillPoints(s).free).toBe(4);
    expect(skillTree(s).filter((k) => !k.passive)).toHaveLength(23);
    expect(learn(s, 'm_icespike')).toBe(true);
    // 4 级要比开放等级高 10 级
    s.skills.ranks.m_icespike = 3;
    s.level = 14;
    expect(learn(s, 'm_icespike')).toBe(false);
    s.level = 15;
    expect(learn(s, 'm_icespike')).toBe(true);
  });

  it('装扮：材料够才能做，做好自动穿上，穿齐整套有称号', async () => {
    const { COSTUMES, makePiece, fullSet } = await import('../src/systems/costumes');
    const s = newSave('a', 'a');
    const school = COSTUMES[0];
    expect(makePiece(s, school, 'hat')).toBe(false);
    s.mats.cloth = 20;
    s.gold = 500;
    for (const p of ['hat', 'top', 'bottom'] as const) expect(makePiece(s, school, p)).toBe(true);
    expect(fullSet(s)?.title).toBe('模范学生');
    expect(s.mats.cloth).toBe(20 - 12);
  });

  it('掉落按职业过滤：魔法师不会掉剑', async () => {
    const { CLASSES } = await import('../src/systems/classes');
    const { catalogOf } = await import('../src/systems/catalog');
    for (let i = 0; i < 200; i++) {
      const it = makeItem('rare', 5, 't', 'weapon', 1, CLASSES.mage);
      expect(CLASSES.mage.wtypes).toContain(catalogOf(it.name)?.wtype);
    }
  });
});
