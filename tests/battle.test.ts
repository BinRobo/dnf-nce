import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LessonPair } from '../src/content/types';
import { newSave } from '../src/save/schema';
import { ContentIndex } from '../src/systems/questions';
import { buildBattle, classmates, qtype } from '../src/battle/plan';
import { BattleController, type PlayerKit } from '../src/battle/controller';

const load = (id: string) => JSON.parse(readFileSync(`public/content/book1/lessons/${id}.json`, 'utf8')) as LessonPair;
const ids = JSON.parse(readFileSync('public/content/book1/manifest.json', 'utf8')).regions.flatMap((r: { dungeons: string[] }) => r.dungeons) as string[];
const lessons = ids.map(load);
const idx = new ContentIndex(lessons);
const L1 = lessons[0];
const L5 = lessons[2];
const kit: PlayerKit = { atk: 20, crit: 0, critMult: 2, hearts: 5, shield: 2, hints: 1, youngMode: false };

function play(c: BattleController, answerFor: (n: number) => boolean) {
  let n = 0;
  for (const room of c.plan.rooms.filter((r) => !r.optional)) {
    c.enter(room.id);
    while (c.current) {
      const o = c.answer({ correct: answerFor(n++), clean: true, ms: 1000 });
      if (o.runOver) return { over: true, n };
      if (n > 500) throw new Error('loop');
    }
  }
  return { over: false, n };
}

describe('副本编排', () => {
  it('所有课都能生成合法的副本，最后一间是 Boss', () => {
    for (const l of lessons) {
      const p = buildBattle(l, newSave('a', 'a'), idx);
      expect(p.rooms.at(-1)!.type).toBe('boss');
      for (const r of p.rooms) for (const e of r.enemies) expect(e.questions.length).toBeGreaterThan(0);
    }
  });
  it('第 1 课是回音怪机制：含吞音题和“Is this your handbag?”终结技', () => {
    const p = buildBattle(L1, newSave('a', 'a'), idx);
    expect(p.bossMech).toBe('pardon');
    const qs = p.rooms.at(-1)!.enemies[0].questions;
    expect(qs.some((q) => q.boss?.muffled)).toBe(true);
    const fin = qs.at(-1)!;
    expect(fin.kind).toBe('order');
    expect(fin.kind === 'order' && fin.answer.join(' ')).toBe('Is this your handbag?');
  });
  it('第 5 课是名字迷雾：5 位同学 + Nice to meet you', () => {
    expect(classmates(L5).map((k) => k.name)).toEqual(expect.arrayContaining(['Hans', 'Naoko', 'Chang-woo', 'Luming', 'Xiaohui']));
    const p = buildBattle(L5, newSave('a', 'a'), idx);
    const qs = p.rooms.at(-1)!.enemies[0].questions;
    expect(qs.filter((q) => q.boss?.rescue)).toHaveLength(5);
    for (const q of qs) if (q.kind === 'pick') expect(q.options[q.answer]).toBeTruthy();
  });
  it('小怪种类与题型对应', () => {
    const p = buildBattle(L1, newSave('a', 'a'), idx);
    for (const e of p.rooms[0].enemies) {
      const t = qtype(e.questions[0]);
      expect(e.kind).toBe({ listen: 'bat', meaning: 'slime', spell: 'goblin', order: 'golem', fill: 'imp' }[t]);
    }
  });
});

describe('战斗状态机', () => {
  it('全对通关，每题都必须作答（题量不因攻击力减少）', () => {
    const plan = buildBattle(L1, newSave('a', 'a'), idx);
    const total = plan.rooms.filter((r) => !r.optional).flatMap((r) => r.enemies).reduce((s, e) => s + e.questions.length, 0);
    const strong = new BattleController(plan, { ...kit, atk: 9999 }, idx);
    expect(play(strong, () => true)).toEqual({ over: false, n: total });
  });
  it('答错：先扣护盾再扣心，题目换题型重考，不会丢失', () => {
    const c = new BattleController(buildBattle(L1, newSave('a', 'a'), idx), kit, idx);
    c.enter('r1');
    const before = c.queue.reduce((s, e) => s + e.questions.length, 0);
    const o = c.answer({ correct: false, clean: false, ms: 2000 });
    expect(o.grade).toBe('miss');
    expect(o.enemyAttack).toBe('shield');
    expect(c.queue.reduce((s, e) => s + e.questions.length, 0)).toBe(before);
    expect(c.logs.size).toBe(1);
    expect([...c.logs.values()][0].firstTry).toBe(false);
  });
  it('心归零时伙伴救援一次，第二次才结束', () => {
    const c = new BattleController(buildBattle(L1, newSave('a', 'a'), idx), { ...kit, hearts: 2, shield: 0 }, idx);
    c.enter('r1');
    const outs = Array.from({ length: 6 }, () => c.answer({ correct: false, clean: false, ms: 1000 }));
    expect(outs.filter((o) => o.rescued)).toHaveLength(1);
    expect(outs.findIndex((o) => o.runOver)).toBeGreaterThan(outs.findIndex((o) => o.rescued));
  });
  it('评档：首次答对且流畅为漂亮，连对 3 题为完美，慢了为普通', () => {
    const c = new BattleController(buildBattle(L1, newSave('a', 'a'), idx), kit, idx);
    c.enter('r1');
    expect(c.answer({ correct: true, clean: true, ms: 1000 }).grade).toBe('nice');
    expect(c.answer({ correct: true, clean: true, ms: 1000 }).grade).toBe('nice');
    expect(c.answer({ correct: true, clean: true, ms: 1000 }).grade).toBe('perfect');
    expect(c.answer({ correct: true, clean: true, ms: 60000 }).grade).toBe('hit');
  });
  it('觉醒槽满后，下一道连词成句题是觉醒技', () => {
    const c = new BattleController(buildBattle(L1, newSave('a', 'a'), idx), kit, idx);
    c.gauge = 99;
    c.enter('elite');
    let saw = false, full = false;
    while (c.current) {
      const o = c.answer({ correct: true, clean: true, ms: 500 });
      full ||= o.gaugeFull;
      saw ||= o.awaken;
    }
    expect(full).toBe(true);
    expect(saw).toBe(true);
  });
  it('可选房间只在相邻时出现在出口里', () => {
    const c = new BattleController(buildBattle(L1, newSave('a', 'a'), idx), kit, idx);
    c.enter('r1');
    expect(c.exits()[0].id).toBe('story');
    c.enter('story');
    expect(c.exits().map((r) => r.id)).toContain('chest');
  });
});
