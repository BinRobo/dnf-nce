import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deleteProfile, exportSave, listBackups, listProfiles, parseImport, saveProfile } from '../src/save/db';
import { migrate, newSave, refreshDaily, SAVE_VERSION } from '../src/save/schema';
import { expToNext, expToNextV2 } from '../src/config';

describe('存档', () => {
  it('保存、读取、快照轮换、删除', async () => {
    const s = newSave('p1', '小明');
    for (let i = 0; i < 13; i++) {
      s.gold = i;
      await saveProfile(s);
    }
    const all = await listProfiles();
    expect(all).toHaveLength(1);
    expect(all[0].gold).toBe(12);
    const backups = await listBackups('p1');
    expect(backups).toHaveLength(10);
    expect(backups[0].data.gold).toBe(12);
    await deleteProfile('p1');
    expect(await listProfiles()).toHaveLength(0);
    expect(await listBackups('p1')).toHaveLength(0);
  });

  it('导出再导入保持一致', () => {
    const s = newSave('p2', '小红');
    s.level = 7;
    s.srs['w:pen'] = { ease: 2.5, interval: 3, reps: 2, lapses: 0, due: 1, seen: 2, correct: 2 };
    const back = parseImport(exportSave(s));
    expect(back).toEqual(s);
  });

  it('旧存档缺字段时自动补齐', () => {
    const old = { id: 'x', name: '旧档', version: 0, level: 3, stats: { answers: 5 } };
    const m = migrate(old);
    expect(m.level).toBe(3);
    expect(m.stats.answers).toBe(5);
    expect(m.stats.playDays).toEqual([]);
    expect(m.settings.fatigueMax).toBeGreaterThan(0);
  });

  it('拒绝无效或来自新版本的存档', () => {
    expect(() => parseImport('not json')).toThrow();
    expect(() => migrate({ id: 'a', name: 'b', version: 999 })).toThrow();
  });

  it('跨天恢复疲劳', () => {
    const s = newSave('p3', 'a');
    s.fatigue = { value: 0, day: '2000-01-01' };
    expect(refreshDaily(s, '2000-01-02')).toBe(true);
    expect(s.fatigue.value).toBe(s.settings.fatigueMax);
    expect(refreshDaily(s, '2000-01-02')).toBe(false);
  });
});

describe('存档 v1 → v2', () => {
  it('旧存档升级后保留进度并补齐新字段', () => {
    const v1 = { version: 1, id: 'old', name: '旧角色', level: 7, gold: 300, dungeons: { 'L001-002': { clears: 2, bestRank: 'S', bestScore: 85, firstClearAt: 1 } }, srs: { 'w:pen': { ease: 2.5, interval: 3, reps: 2, lapses: 0, due: 1, seen: 2, correct: 2 } }, settings: { fatigueMax: 100, speechRate: 0.85 } };
    const m = migrate(v1);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.level).toBe(7);
    expect(m.dungeons['L001-002'].clears).toBe(2);
    expect(m.srs['w:pen'].reps).toBe(2);
    expect(m.settings.dailyMinutes).toBe(30);
    expect(m.story.seen).toEqual([]);
    expect(m.partners).toEqual([]);
    expect(m.dayLog).toEqual({});
  });
});

describe('存档 v2 → v3（全书成长曲线、6 格装备、职业）', () => {
  it('等级不变，经验按百分比换算；元音戒指移到戒指格；职业按旧转职对应', () => {
    const old = { ...newSave('a', 'a'), version: 2, level: 5, exp: Math.floor(expToNextV2(5) / 2), job: 'ranger' } as Record<string, unknown>;
    delete old.cls;
    delete old.gender;
    const ring = { uid: 'r1', name: '元音戒指', slot: 'accessory', rarity: 'rare', atk: 0, hp: 1, crit: 0.06, enhance: 0, enhanceFails: 0, obtainedAt: 1, from: 't' };
    old.inventory = [ring];
    old.equipped = { accessory: 'r1' };
    const m = migrate(old);
    expect(m.level).toBe(5);
    expect(Math.abs(m.exp / expToNext(5) - 0.5)).toBeLessThan(0.01);
    expect(m.inventory[0].slot).toBe('ring');
    expect(m.equipped).toEqual({ ring: 'r1' });
    expect(m.cls).toBe('gunner');
    expect(m.mats.cloth).toBe(0);
    expect(m.wardrobe.owned).toEqual([]);
  });
});
