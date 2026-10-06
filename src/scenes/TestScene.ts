import { loadNow, need } from '../assets';
import Phaser from 'phaser';
import { buildAbyssBattle, buildBattle, MOB_NAME, type BattlePlan } from '../battle/plan';
import { MAX_RANK, normalizeSkills, rankLevel, skillTree, toggleBar, barSize } from '../battle/skilldata';
import { dungeonNo, levelCurve } from '../config';
import { makeHero } from '../gfx/hero';
import { newSave, type SaveData } from '../save/schema';
import { CATALOG, usableBy } from '../systems/catalog';
import { CLASS_IDS, CLASSES, classOf, type ClassId, type Gender } from '../systems/classes';
import { COSTUMES, PIECES, pieceId } from '../systems/costumes';
import { epicsFor, makeItem, recordCodex } from '../systems/items';
import { game } from '../state';
import { button, COLORS, panel, text, toast } from '../ui/widgets';
import { layeredBg, MOBS, mobTex } from './BootScene';

/**
 * 测试面板（地址加 ?test 打开）：用一个不保存的测试角色，
 * 随意改职业 / 等级 / 材料 / 装备，直接进入任意副本、看所有怪物。孩子的存档完全不受影响。
 */
export function makeTestSave(): SaveData {
  const s = newSave('__test__', '测试员');
  s.story.seen.push('prologue', 'quest_L001_give', 'quest_L001_done', 'quest_L005_done');
  s.partners.push('sophie');
  s.settings.dailyMinutes = 999;
  s.settings.pin = '0000';
  return s;
}

type Tab = 'hero' | 'maps' | 'mobs';

export class TestScene extends Phaser.Scene {
  private tab: Tab = 'hero';
  private region = 0;
  private bossOnly = false;
  private layer?: Phaser.GameObjects.Container;

  constructor() {
    super('Test');
  }

  preload() {
    need(this, { heroes: [game.s], bgs: ['training'], mobs: MOBS });
  }

  create() {
    layeredBg(this, 'training');
    this.add.rectangle(0, 0, 1280, 720, 0x0b0d17, 0.55).setOrigin(0);
    this.render();
  }

  private get s() {
    return game.s;
  }

  private render() {
    this.layer?.destroy();
    const L = (this.layer = this.add.container(0, 0));
    L.add(text(this, 24, 14, '🧪 测试面板（测试角色不保存，不影响孩子的存档）', 22, '#ffe14a', { fontStyle: 'bold' }));
    const tabs: [Tab, string][] = [['hero', '角色与等级'], ['maps', '地图与副本'], ['mobs', '怪物图鉴']];
    tabs.forEach(([t, label], i) => L.add(button(this, 110 + i * 180, 68, 170, 44, label, () => { this.tab = t; this.render(); }, { size: 18, color: this.tab === t ? 0x3b62d9 : 0x2a2f52 })));
    // 快速跳转
    const jumps: [string, () => void][] = [
      ['🗺 城镇地图', () => this.scene.start('Town', { district: game.s.town.district, x: 640, worldMap: true })],
      ['✦ 技能树', () => this.scene.start('Skills')],
      ['🎒 背包', () => this.scene.start('Inventory')],
      ['👗 衣柜', () => this.scene.start('Wardrobe', { tailor: true })],
      ['📖 图鉴', () => this.scene.start('Codex')],
    ];
    jumps.forEach(([label, fn], i) => L.add(button(this, 660 + i * 102, 68, 96, 40, label, fn, { size: 14, color: 0x2f4a3a })));
    if (this.tab === 'hero') this.heroTab(L);
    else if (this.tab === 'maps') this.mapsTab(L);
    else this.mobsTab(L);
  }

  // ---------------- 角色与等级 ----------------

  private heroTab(L: Phaser.GameObjects.Container) {
    const s = this.s;
    L.add(panel(this, 20, 100, 400, 600, 0.9));
    L.add(makeHero(this, 220, 470, s, 0.8).idle());
    L.add(text(this, 220, 500, `${classOf(s).name}·${s.gender === 'f' ? '女' : '男'}   Lv.${s.level}`, 24, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    L.add(text(this, 220, 534, `技能栏 ${barSize(s.level)} 格 · 💰${s.gold} · 碎片 ${s.mats.shard} · 魂 ${s.mats.soul}`, 15, COLORS.dim).setOrigin(0.5));
    L.add(text(this, 220, 560, `布料 ${s.mats.cloth} 丝线 ${s.mats.thread} 铜片 ${s.mats.brass} 名牌 ${s.mats.badge} 彩带 ${s.mats.ribbon}`, 14, COLORS.dim).setOrigin(0.5));

    L.add(panel(this, 440, 100, 820, 600, 0.9));
    let y = 128;
    const row = (label: string) => { L.add(text(this, 460, y, label, 18, '#9fe3ff', { fontStyle: 'bold' })); y += 50; };

    row('职业与性别（换职业会重置技能）');
    CLASS_IDS.forEach((c: ClassId, i) => (['m', 'f'] as Gender[]).forEach((g, k) => {
      const on = s.cls === c && s.gender === g;
      L.add(button(this, 530 + (i * 2 + k) * 128, y, 120, 38, `${CLASSES[c].name}·${g === 'm' ? '男' : '女'}`, () => {
        const changed = s.cls !== c;
        s.cls = c;
        s.gender = g;
        if (changed) { s.skills = { ranks: {}, bar: [], bonus: s.skills.bonus }; s.equipped = {}; }
        normalizeSkills(s);
        void loadNow(this, { heroes: [s] }).then(() => this.render());
      }, { size: 15, color: on ? 0x8a5a12 : 0x2a2f52 }));
    }));
    y += 52;

    row('等级（按全书曲线，第 k 个副本的怪 ≈ 那一级）');
    const setLv = (lv: number) => { s.level = Phaser.Math.Clamp(lv, 1, 60); s.exp = 0; normalizeSkills(s); this.render(); };
    [['−10', -10], ['−1', -1], ['+1', 1], ['+10', 10]].forEach(([l, d], i) => L.add(button(this, 500 + i * 76, y, 68, 38, String(l), () => setLv(s.level + Number(d)), { size: 17 })));
    [1, 5, 10, 17, 27, 36, 45, 52, 60].forEach((lv, i) => L.add(button(this, 820 + i * 50, y, 44, 38, String(lv), () => setLv(lv), { size: 15, color: s.level === lv ? 0x8a5a12 : 0x2a2f52 })));
    y += 58;

    row('一键发放');
    const gives: [string, () => void][] = [
      ['💰 材料全满', () => {
        s.gold = 99999; s.stones = 999;
        Object.assign(s.mats, { shard: 99, soul: 99, cloth: 999, thread: 999, brass: 99, badge: 99, ribbon: 99 });
      }],
      ['✦ 技能全学满', () => {
        for (const k of skillTree(s)) {
          let r = 0;
          while (r < MAX_RANK && s.level >= rankLevel(k, r + 1)) r++;
          if (r) s.skills.ranks[k.id] = r;
        }
        s.skills.bonus = 99;
        for (const k of skillTree(s)) if (!k.passive && s.skills.ranks[k.id] && !s.skills.bar.includes(k.id)) toggleBar(s, k.id);
      }],
      ['🗡 本职业全部装备', () => {
        const c = classOf(s);
        const items = CATALOG.filter((k) => usableBy(k, c.wtypes, c.armor)).map((k) => {
          const it = makeItem(['uncommon', 'rare', 'legendary'][Math.floor(Math.random() * 3)] as 'rare', s.level, '测试面板', k.slot, 1, c);
          it.name = k.name;
          return it;
        });
        for (const e of epicsFor(s.cls)) {
          const it = makeItem('epic', s.level, '测试面板', 'weapon', 1, c);
          it.name = e.name;
          items.push(it);
        }
        s.inventory.push(...items);
        recordCodex(s, items);
      }],
      ['👗 全部装扮', () => { s.wardrobe.owned = COSTUMES.flatMap((c) => PIECES.map((p) => pieceId(c.id, p))); }],
      ['🏆 通关全部副本', () => {
        for (const r of game.manifest.regions) for (const id of r.dungeons) s.dungeons[id] = { clears: 1, bestRank: 'S', bestScore: 90, firstClearAt: Date.now() };
      }],
      ['↺ 清空进度', () => { s.dungeons = {}; s.inventory = []; s.equipped = {}; s.srs = {}; }],
    ];
    gives.forEach(([label, fn], i) => L.add(button(this, 580 + (i % 3) * 232, y + Math.floor(i / 3) * 50, 220, 42, label, () => { fn(); toast(this, `已执行：${label}`, '#7dffa5'); this.render(); }, { size: 16, color: 0x3b4a7a })));
    y += 110;

    row('穿装扮（整套）');
    COSTUMES.forEach((c, i) => L.add(button(this, 527 + i * 112, y, 106, 38, c.name, () => {
      for (const p of PIECES) { const id = pieceId(c.id, p); if (!s.wardrobe.owned.includes(id)) s.wardrobe.owned.push(id); s.wardrobe.worn[p] = c.id; }
      void loadNow(this, { heroes: [s] }).then(() => this.render());
    }, { size: 14, color: s.wardrobe.worn.top === c.id ? 0x8a5a12 : 0x2a2f52 })));
    L.add(button(this, 527 + 6 * 112, y, 80, 38, '脱下', () => { s.wardrobe.worn = {}; this.render(); }, { size: 14, color: 0x444a6b }));
  }

  // ---------------- 地图与副本 ----------------

  private mapsTab(L: Phaser.GameObjects.Container) {
    const regions = game.manifest.regions;
    L.add(panel(this, 20, 100, 1240, 600, 0.9));
    regions.forEach((r, i) => L.add(button(this, 120 + i * 190, 130, 180, 40, `${i + 1}. ${r.name}`, () => { this.region = i; this.render(); }, { size: 15, color: this.region === i ? 0x3b62d9 : 0x2a2f52 })));
    L.add(button(this, 1170, 130, 150, 40, this.bossOnly ? '✔ 只打 Boss 房' : '只打 Boss 房', () => { this.bossOnly = !this.bossOnly; this.render(); }, { size: 15, color: this.bossOnly ? 0x8a5a12 : 0x444a6b }));
    const r = regions[this.region];
    L.add(text(this, 40, 166, `${r.name} · ${r.grammar}`, 16, COLORS.dim));
    r.dungeons.forEach((id, i) => {
      const lesson = game.manifest.titles[id];
      if (!lesson) return;
      const li = dungeonNo(id) - 1;
      const x = 180 + (i % 4) * 300, y = 230 + Math.floor(i / 4) * 92;
      const lv = levelCurve(li + 1);
      L.add(button(this, x, y, 280, 76, `L${lesson.lessons[0]}-${lesson.lessons[1]} ${lesson.title}\n怪物 Lv.${lv}　Boss Lv.${lv + 2}`, () => void game.ensureLessons([id, ...game.playedLessons()]).then(() => this.enter(buildBattle(game.index.lesson(id)!, this.s, game.index))), { size: 15, color: ['L001-002', 'L005-006'].includes(id) ? 0x8a5a12 : 0x2a3a5a }));
    });
    // 城镇街区：测试模式下全部开放
    L.add(text(this, 40, 584, '城镇街区：', 16, '#9fe3ff', { fontStyle: 'bold' }));
    const towns = (this.cache.json.get('town') as { districts: { id: string; name: string; areas: unknown[] }[] }).districts.filter((d) => d.areas.length);
    towns.forEach((d, i) => L.add(button(this, 190 + i * 140, 600, 130, 38, d.name, () => this.scene.start('Town', { district: d.id, x: 640 }), { size: 14, color: 0x2f4a3a })));
    L.add(button(this, 1100, 660, 260, 46, '🌑 进入每日深渊（复习）', () => void game.ensureLessons(game.playedLessons()).then(() => this.enter(buildAbyssBattle(this.s, game.index))), { size: 16, color: 0x6d2bd9 }));
    L.add(text(this, 40, 650, '金色 = 已做好剧情和 Boss 机制的副本；其他副本用通用 Boss。进入后打完会回到城镇，可点右下“测试面板”回来。', 14, COLORS.dim));
  }

  private enter(plan: BattlePlan) {
    if (this.bossOnly) {
      plan.rooms = plan.rooms.filter((r) => r.type === 'boss').map((r) => ({ ...r, cell: [0, 0] as [number, number] }));
      plan.showVideo = false;
    }
    this.scene.start('Battle', { plan });
  }

  // ---------------- 怪物图鉴 ----------------

  private mobsTab(L: Phaser.GameObjects.Container) {
    L.add(panel(this, 20, 100, 1240, 600, 0.9));
    const kinds = MOBS.filter((m) => m !== 'boss_generic');
    kinds.forEach((m, i) => {
      const boss = m.startsWith('boss') || m === 'duke';
      // 11 列 × 4 行：全部小怪与 Boss 一屏放下
      const x = 80 + (i % 11) * 112, y = 210 + Math.floor(i / 11) * 122;
      const img = this.add.image(x, y, mobTex(this, m)).setOrigin(0.5, 1);
      img.setScale((boss ? 92 : 70) / Math.max(img.height, 1));
      L.add(img);
      L.add(text(this, x, y + 10, (MOB_NAME[m] ?? (m === 'duke' ? '缄默公爵 · 赫什' : m)).split(' · ').pop()!, 13, boss ? '#ffb020' : '#ffffff', { fontStyle: boss ? 'bold' : 'normal' }).setOrigin(0.5));
      L.add(text(this, x, y + 26, m.replace(/^(boss_|mob_)/, ''), 10, COLORS.dim).setOrigin(0.5));
      this.tweens.add({ targets: img, y: y - 6, duration: 600 + i * 40, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });
    L.add(text(this, 40, 660, '要看 Boss 的专属招式：到“地图与副本”勾选“只打 Boss 房”，进 L1-2（帕顿）或 L5-6（胡迷斯），故意答错就会出招。', 15, COLORS.dim));
  }
}
