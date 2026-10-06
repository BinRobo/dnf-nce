import Phaser from 'phaser';
import { BALANCE, expToNext } from '../config';
import { hasMusic, music, sfx } from '../audio/sound';
import { isTouch } from '../ui/device';
import { TownSocial } from './townSocial';
import { bossBannerInfo } from '../battle/plan';
import { dungeonNo } from '../config';
import { loadNow, need } from '../assets';
import { buildAbyssBattle, buildBattle, type BattlePlan } from '../battle/plan';
import { Puppet } from '../gfx/puppet';
import { backdrop } from '../gfx/textures';
import { timeLeftMs, today } from '../save/schema';
import { StoryRunner } from '../story/runner';
import { stopVoice, voice } from '../audio/speech';
import { makeHero } from '../gfx/hero';
import { skillPoints } from '../battle/skilldata';
import { exportSave, listBackups, saveProfile } from '../save/db';
import type { Job } from '../save/schema';
import { canCraft, craftEpic, CRAFT_COST, epicsFor, RARITY } from '../systems/items';
import { weaponLook } from '../gfx/icons';
import { classOf } from '../systems/classes';
import { fullSet } from '../systems/costumes';
import { dungeonOpen } from '../systems/progress';
import { party } from '../net/party';
import { canChangeJob, JOBS, playerStats } from '../systems/player';
import { dueItems } from '../systems/questions';
import { ACHIEVEMENTS, claimDaily, DAILY_TASKS } from '../systems/session';
import { game } from '../state';
import { downloadText, stamp } from '../ui/files';
import { modal } from '../ui/modal';
import { bar, button, COLORS, panel, text, toast } from '../ui/widgets';

interface District { id: string; name: string; music?: string; chapter?: number; map?: [number, number]; interior?: boolean; areas: { bg: string; name: string }[] }
interface SpotDef {
  id: string; district: string; x: number; label: string; act?: string; npc?: string; head?: string; name?: string;
  after?: string; r?: number; link?: { to: string; x: number }; door?: boolean; anvil?: boolean; portal?: boolean; region?: number;
}
interface TownData { districts: District[]; spots: SpotDef[] }

export class TownScene extends Phaser.Scene {
  constructor() {
    super('Town');
  }

  /** 切片里已做成“成品”的副本 */
  static readonly NEW = new Set(['L001-002', 'L005-006']);

  // ---------------- 可行走的城镇：按章节解锁的街区 + 室内（数据见 content-src/npc/town.json） ----------------
  static readonly GROUND = 484;
  private W = 2560;
  private dist!: District;
  private data_!: TownData;

  private world!: Phaser.GameObjects.Container;
  private hero!: Puppet;
  private heroLabel!: Phaser.GameObjects.Text;
  private camX = 0;
  private targetX: number | null = null;
  private keys!: { left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key; space: Phaser.Input.Keyboard.Key; enter: Phaser.Input.Keyboard.Key };
  private spots: { id: string; x: number; label: string; act: () => unknown; r?: number }[] = [];
  private prompt!: Phaser.GameObjects.Container;
  private near: { id: string; x: number; label: string; act: () => unknown } | null = null;
  private busy = false;
  private areaIdx = -1;
  private areaLabel?: Phaser.GameObjects.Text;
  private moving = false;
  private objTargetX: number | null = null;
  private edgeArrow?: Phaser.GameObjects.Text;
  private miniDot?: Phaser.GameObjects.Arc;

  private openMap = false;

  init(data: { from?: string; district?: string; x?: number; worldMap?: boolean }) {
    this.openMap = !!data?.worldMap;
    const s = game.s;
    if (data?.from === 'battle') {
      s.town.district = 'market';
      this.spawnAt = 1760;
    } else if (data?.district) {
      s.town.district = data.district;
      this.spawnAt = data.x ?? 640;
    } else this.spawnAt = this.lastX ?? (s.town.district === 'campus' ? 820 : 640);
  }

  private spawnAt = 820;
  private lastX: number | undefined;

  /** 某章街区是否开放：第 1 章一开始就开，第 n 章 = 第 n 张副本地图解锁 */
  private chapterOpen(ch: number) {
    // 测试面板：所有街区都开放
    if (game.testMode) return true;
    return ch <= 1 || (ch - 1 < game.manifest.regions.length && this.regionUnlocked(ch - 1));
  }

  private districtOf(id: string) {
    return this.data_.districts.find((d) => d.id === id);
  }

  /** 当前要进入的街区（未开放的回学园区） */
  private resolveDistrict() {
    this.data_ = this.cache.json.get('town') as TownData;
    let dist = this.districtOf(game.s.town.district);
    if (!dist || !dist.areas.length || (!dist.interior && !this.chapterOpen(dist.chapter ?? 1))) dist = this.districtOf('campus')!;
    return dist;
  }

  /** 只加载本街区要用的：背景、NPC、主角、传送门粒子 */
  preload() {
    const s = game.s;
    const dist = this.resolveDistrict();
    const spots = this.data_.spots.filter((sp) => sp.district === dist.id && sp.npc);
    need(this, {
      heroes: [s],
      bgs: dist.areas.map((a) => a.bg),
      chars: [...new Set(spots.map((sp) => sp.npc!))],
      heads: spots.filter((sp) => sp.head).map((sp) => sp.head!),
      pngs: { p_twirl_1: 'assets/fx/particles/twirl_1.png', p_light_1: 'assets/fx/particles/light_1.png' },
    });
  }

  create() {
    const s = game.s;
    this.spots = [];
    this.barkers = [];
    this.npcX = {};
    this.busy = false;
    this.areaIdx = -1;
    this.targetX = null;
    this.objTargetX = null;
    this.edgeArrow = undefined;
    this.social = undefined;
    const dist = this.resolveDistrict();
    s.town.district = dist.id;
    this.dist = dist;
    // 第一次来到第 2–6 章的街区：播放这一章的开场剧情
    const introId = `ch${dist.chapter}_intro`;
    if ((dist.chapter ?? 1) >= 2 && !s.story.seen.includes(introId)) {
      this.time.delayedCall(600, () => void StoryRunner.play(this, introId, { music: 'story' }).then(() => {
        if (!s.story.seen.includes(introId)) s.story.seen.push(introId);
        void game.persist();
        music(dist.music && hasMusic(dist.music) ? dist.music : 'town');
      }));
    }
    // 玩过的课和主线要用的课：后台下载（深渊、剧情语音要用）
    void game.ensureLessons([...game.playedLessons(), 'L001-002', 'L005-006']);
    // 每个街区自己的背景音乐（没有就用通用城镇音乐）
    music(dist.music && hasMusic(dist.music) ? dist.music : 'town');
    this.W = dist.areas.length * 1280;
    this.world = this.add.container(0, 0).setDepth(0);
    // 背景：每屏三层
    dist.areas.forEach((a, i) => {
      for (const layer of ['far', 'mid', 'ground']) {
        const k = `bg_${a.bg}_${layer}`;
        if (this.textures.exists(k)) this.world.add(this.add.image(i * 1280, 0, k).setOrigin(0));
      }
    });
    if (!this.textures.exists('bg_town_far')) backdrop(this, 'town', 560);
    if (!s.story.seen.includes('prologue')) {
      // 序章：只显示场景，不显示城镇界面
      void this.prologue();
      return;
    }
    const q = this.questState();
    if (q.auto) {
      void this.autoQuest(q.auto);
      return;
    }

    // ---- NPC 与可互动地点（数据驱动） ----
    for (const sp of this.data_.spots) {
      if (sp.district !== dist.id || (sp.after && !this.cleared(sp.after))) continue;
      const act = sp.link ? () => this.travel(sp.link!.to, sp.link!.x, sp.door) : this.action(sp, q);
      const mark = q.id === 'give1' && sp.id === 'blake';
      if (sp.npc) this.npc(sp, act, mark);
      else {
        if (sp.anvil) this.anvil(sp);
        if (sp.portal) this.portal(sp);
        if (sp.link) this.signpost(sp);
        this.spot(sp.id, sp.x, sp.label, act, sp.r);
      }
    }
    const pts = skillPoints(s).free;
    const dummy = this.data_.spots.find((x) => x.id === 'dummy');
    if (pts > 0 && dummy?.district === dist.id) this.marker(dummy.x, `技能点 ${pts}`);
    if (dist.id === 'market' && canCraft(s)) this.marker(this.data_.spots.find((x) => x.id === 'smith')!.x, '可以打造史诗！');

    // ---- 主角 ----
    const x0 = Phaser.Math.Clamp(this.spawnAt, 80, this.W - 80);
    this.hero = makeHero(this, x0, TownScene.GROUND, s, 0.42).idle();
    this.world.add(this.hero);
    const title = fullSet(s)?.title;
    this.heroLabel = text(this, x0, TownScene.GROUND - this.hero.tall - 16, `${title ? `【${title}】` : ''}Lv.${s.level} ${s.name}`, 17, '#ffffff', { stroke: '#2b2a4a', strokeThickness: 5 }).setOrigin(0.5);
    this.world.add(this.heroLabel);
    this.camX = Phaser.Math.Clamp(x0 - 640, 0, this.W - 1280);
    this.world.x = -this.camX;

    // ---- 界面（固定在屏幕上） ----
    this.statusBar();
    this.miniMap();
    const by = 684;
    const btns: [string, () => void, number?][] = [
      ['🗺 地图', () => this.worldMap(), 0x8a5a12],
      ['🎒 背包', () => this.scene.start('Inventory')],
      ['👗 衣柜', () => this.scene.start('Wardrobe')],
      ['✦ 技能', () => this.scene.start('Skills')],
      ['📖 图鉴', () => this.scene.start('Codex')],
      ['📋 每日', () => this.dailyTasks()],
      ['🏆 成就', () => this.achievements()],
      ['💾 存档', () => this.saveMenu()],
      ['👪 家长', () => this.scene.start('Parent'), 0x2f7a4d],
      ['切换角色', () => this.scene.start('Profile'), 0x444a6b],
    ];
    const bw = 1256 / btns.length;
    btns.forEach(([label, fn, color], i) => button(this, 12 + bw / 2 + i * bw, by, bw - 10, 46, label, fn, { size: 17, color }).setDepth(50));
    const badge = (i: number, n: number) => text(this, 12 + bw / 2 + i * bw + bw / 2 - 18, by - 22, String(n), 15, '#ffffff', { backgroundColor: '#e8505b', padding: { x: 6, y: 1 } }).setOrigin(0.5).setDepth(51);
    const ready = DAILY_TASKS.filter((t) => t.progress(s) >= t.goal && !s.daily.claimed.includes(t.id)).length;
    if (ready) badge(5, ready);
    if (pts > 0) badge(3, pts);
    if (canChangeJob(s)) {
      const b = button(this, 640, 130, 220, 48, '✨ 可以转职了！', () => this.jobChange(), { color: 0xb46bff }).setDepth(50);
      this.tweens.add({ targets: b, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
    }
    if (game.lastSaveError) toast(this, '上次存档失败，请导出备份！', '#ff8080');
    if (game.testMode) button(this, 1180, 620, 180, 44, '🧪 测试面板', () => this.scene.start('Test'), { size: 17, color: 0x8a5a12 }).setDepth(60);

    // 互动提示
    this.prompt = this.add.container(0, 0).setDepth(55).setVisible(false);
    this.touchDir = 0;
    if (isTouch) this.touchControls();
    // 输入
    const kb = this.input.keyboard!;
    this.keys = {
      left: kb.addKey('LEFT'), right: kb.addKey('RIGHT'), a: kb.addKey('A'), d: kb.addKey('D'),
      space: kb.addKey('SPACE'), enter: kb.addKey('ENTER'),
    };
    this.keys.space.on('down', () => this.interact());
    this.keys.enter.on('down', () => this.interact());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.busy || over.length || p.y < 150 || p.y > 640) return;
      this.targetX = Phaser.Math.Clamp(p.x + this.camX, 60, this.W - 60);
      // 点到 NPC/地点附近：走过去自动互动
      const hit = this.spots.find((sp) => Math.abs(sp.x - this.targetX!) < 70);
      this.autoAct = hit ?? null;
    });
    this.objective(q);
    void this.startBarks();
    if (this.openMap) this.time.delayedCall(200, () => this.worldMap());
    this.events.once('shutdown', () => (this.lastX = this.hero?.x));
    // 多人：登录、家长没关闭、服务器可用时，同街区的孩子能互相看到
    this.social = new TownSocial(this, this.world, TownScene.GROUND, dist.id, () => this.hero);
    this.social.start(x0);
  }

  private social?: TownSocial;

  private touchDir = 0;
  private actBtn?: Phaser.GameObjects.Container;

  /** 平板：左下角 ◀ ▶ 按住走路，右下角大按钮互动（点地面走路、点提示条互动也照常可用） */
  private touchControls() {
    const mk = (x: number, label: string, dir: number) => {
      const c = this.add.container(x, 586).setDepth(52);
      const bg = this.add.circle(0, 0, 44, 0x2a3a6a, 0.72).setStrokeStyle(3, 0x9fe3ff, 0.9).setInteractive();
      c.add([bg, text(this, 0, -2, label, 40, '#ffffff').setOrigin(0.5)]);
      bg.on('pointerdown', () => { this.touchDir = dir; this.targetX = null; this.autoAct = null; bg.setFillStyle(0x3b62d9, 0.9); });
      const up = () => { if (this.touchDir === dir) this.touchDir = 0; bg.setFillStyle(0x2a3a6a, 0.72); };
      bg.on('pointerup', up);
      bg.on('pointerout', up);
      bg.on('pointerupoutside', up);
    };
    mk(70, '◀', -1);
    mk(180, '▶', 1);
    const c = this.add.container(1170, 586).setDepth(52).setVisible(false);
    const bg = this.add.circle(0, 0, 58, 0x8a5a12, 0.88).setStrokeStyle(4, 0xffe14a, 1).setInteractive();
    c.add([bg, text(this, 0, 0, '互动', 30, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5)]);
    bg.on('pointerdown', () => this.interact());
    this.tweens.add({ targets: c, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
    this.actBtn = c;
  }

  private autoAct: { id: string; x: number; label: string; act: () => unknown } | null = null;

  update(_t: number, dtMs: number) {
    if (!this.hero || !this.keys) return;
    const storyOn = this.children.list.some((o) => (o as unknown as { depth: number }).depth === 200 || (o as unknown as { depth: number }).depth === 500);
    this.busy = storyOn;
    const dt = dtMs / 1000;
    let dir = 0;
    if (!storyOn) {
      if (this.keys.left.isDown || this.keys.a.isDown || this.touchDir < 0) dir = -1;
      else if (this.keys.right.isDown || this.keys.d.isDown || this.touchDir > 0) dir = 1;
      if (dir) {
        this.targetX = null;
        this.autoAct = null;
      } else if (this.targetX !== null) {
        const dx = this.targetX - this.hero.x;
        if (Math.abs(dx) < 8) {
          this.targetX = null;
          if (this.autoAct) {
            const a = this.autoAct;
            this.autoAct = null;
            void this.doAct(a);
          }
        } else dir = Math.sign(dx);
      }
    }
    if (dir) {
      this.hero.x = Phaser.Math.Clamp(this.hero.x + dir * 340 * dt, 60, this.W - 60);
      const sx = Math.abs(this.hero.scaleX);
      this.hero.setScale(dir < 0 ? -sx : sx, this.hero.scaleY);
      if (!this.moving) {
        this.moving = true;
        this.hero.run();
      }
    } else if (this.moving) {
      this.moving = false;
      this.hero.idle();
    }
    this.heroLabel.setX(this.hero.x);
    this.social?.update(dt, this.hero.x, this.hero.scaleX < 0 ? -1 : 1, !!dir);
    // 摄像机跟随（平滑）
    const want = Phaser.Math.Clamp(this.hero.x - 640, 0, this.W - 1280);
    this.camX += (want - this.camX) * Math.min(1, dt * 6);
    this.world.x = -Math.round(this.camX);
    // 区域名
    const ai = Math.min(this.dist.areas.length - 1, Math.floor(this.hero.x / 1280));
    if (ai !== this.areaIdx) {
      const first = this.areaIdx < 0;
      this.areaIdx = ai;
      this.showArea(first && !this.dist.interior ? `${this.dist.name} · ${this.dist.areas[ai].name}` : this.dist.areas[ai].name);
    }
    if (this.miniDot) this.miniDot.setX(1010 + (this.hero.x / this.W) * 250);
    // 最近的可互动对象
    const near = this.spots.reduce<typeof this.near>((best, sp) => {
      const d = Math.abs(sp.x - this.hero.x);
      return d < (sp.r ?? 110) && (!best || d < Math.abs(best.x - this.hero.x)) ? sp : best;
    }, null);
    if (near !== this.near) {
      this.near = near;
      this.prompt.removeAll(true);
      if (near) {
        const t = text(this, 0, 0, `${near.label}　[空格]`, 18, '#ffffff', { backgroundColor: '#2b2a4acc', padding: { x: 10, y: 6 } }).setOrigin(0.5);
        const b = this.add.rectangle(0, 0, t.width, t.height, 0, 0).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => this.interact());
        this.prompt.add([t, b]);
      }
      this.prompt.setVisible(!!near);
      this.actBtn?.setVisible(!!near);
    }
    if (near) this.prompt.setPosition(near.x - this.camX, 300);
    // 目标在屏幕外时，屏幕边缘的方向箭头
    if (this.edgeArrow && this.objTargetX !== null) {
      const sx = this.objTargetX - this.camX;
      const off = sx < 40 || sx > 1240;
      this.edgeArrow.setVisible(off);
      if (off) this.edgeArrow.setPosition(sx < 40 ? 40 : 1240, 360).setText(sx < 40 ? '◀' : '▶');
    }
  }

  private interact() {
    if (this.busy || !this.near) return;
    void this.doAct(this.near);
  }

  private async doAct(sp: { act: () => unknown }) {
    if (this.busy) return;
    this.busy = true;
    sfx('ui_click');
    stopVoice();
    try {
      await sp.act();
    } finally {
      this.busy = false;
      void game.persist();
    }
  }

  private spot(id: string, x: number, label: string, act: () => unknown, r = 110) {
    this.spots.push({ id, x, label, act, r });
  }

  /** 世界里某处的头顶标记（如“技能点 2”） */
  private marker(x: number, label: string) {
    const t = text(this, x, 250, label, 18, '#ffe14a', { stroke: '#7a3b00', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(0.5);
    this.world.add(t);
    this.tweens.add({ targets: t, y: 240, duration: 500, yoyo: true, repeat: -1 });
  }

  private showArea(name: string) {
    this.areaLabel?.destroy();
    const t = (this.areaLabel = text(this, 640, 200, `— ${name} —`, 34, '#ffffff', { stroke: '#2b2a4a', strokeThickness: 7, fontStyle: 'bold' }).setOrigin(0.5).setDepth(45).setAlpha(0));
    this.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 1200, onComplete: () => t.destroy() });
  }

  private statusBar() {
    const s = game.s;
    const st = playerStats(s);
    const c = this.add.container(0, 0).setDepth(50);
    const g = this.add.graphics();
    g.fillStyle(0x161a2e, 0.88).fillRoundedRect(12, 10, 330, 104, 12).lineStyle(2, 0x3a4170, 1).strokeRoundedRect(12, 10, 330, 104, 12);
    c.add(g);
    c.add(text(this, 26, 18, `Lv.${s.level} ${classOf(s).name}`, 20, '#ffffff', { fontStyle: 'bold' }));
    const need = expToNext(s.level);
    const xb = bar(this, 26, 48, 300, 10, s.exp / need, 0x4aa8ff);
    c.add(xb.g);
    c.add(text(this, 26, 62, `⚔${st.atk}  🛡${st.shield}  ✦${Math.round(st.crit * 100)}%   💰${s.gold}  💎${s.stones}`, 16, '#e9ecff'));
    const left = timeLeftMs(s);
    c.add(text(this, 26, 86, left > 0 ? `⏱ 今天还可以玩 ${Math.ceil(left / 60000)} 分钟` : '⏱ 今天的冒险时间到啦', 15, COLORS.dim));
  }

  /** 右上角小地图：当前街区的各屏 + 主角位置 + 目标位置 */
  private miniMap() {
    const c = this.add.container(0, 0).setDepth(50);
    const g = this.add.graphics();
    g.fillStyle(0x161a2e, 0.88).fillRoundedRect(996, 10, 274, 74, 10);
    const colors = [0x8ec5ff, 0xffc94a, 0x7dffa5, 0xb46bff];
    const n = this.dist.areas.length;
    const w = 250 / n;
    this.dist.areas.forEach((a, i) => {
      g.fillStyle(colors[i % 4], 0.6).fillRect(1010 + i * w, 38, w - 2, 14);
      c.add(text(this, 1010 + i * w + w / 2, 66, a.name, 11, '#cfd6ff').setOrigin(0.5));
    });
    c.add(text(this, 1133, 22, `📍 ${this.dist.name}`, 14, '#ffe14a', { fontStyle: 'bold' }).setOrigin(0.5));
    c.add(g);
    c.sendToBack(g);
    this.miniDot = this.add.circle(1010, 45, 7, 0xffffff).setStrokeStyle(2, 0x2b2a4a).setDepth(51);
  }

  private talkBark(id: string) {
    const lines = this.barkData[id] ?? [];
    const line = lines[Math.floor(Math.random() * lines.length)];
    const b = this.barkers.find((x) => x.id === id);
    if (line && b) {
      this.bubble(b.x, b.top, line.zh);
      voice(id, line.zh, 0.9);
    }
  }

  private barkData: Record<string, { zh: string; when?: string }[]> = {};

  // ---------------- 主线任务与引导 ----------------

  private questState(): { id: string; text: string; target?: string; auto?: string } {
    const s = game.s;
    const seen = (id: string) => s.story.seen.includes(id);
    if (!this.cleared('L001-002')) {
      return seen('quest_L001_give')
        ? { id: 'do1', text: '进入 ★L1-2，帮街上那位女士找回声音', target: 'L001-002' }
        : { id: 'give1', text: '去找 Mr. Blake，听听发生了什么', target: 'blake' };
    }
    if (!seen('quest_L001_done')) return { id: 'done1', text: '', auto: 'quest_L001_done' };
    if (!this.cleared('L005-006')) return { id: 'do5', text: '进入 ★L5-6，帮同学们找回名字', target: 'L005-006' };
    if (!seen('quest_L005_done')) return { id: 'done5', text: '', auto: 'quest_L005_done' };
    // 之后：指向下一个没通关的副本
    const regions = game.manifest.regions;
    for (let ri = 0; ri < regions.length; ri++) {
      if (!this.regionUnlocked(ri)) break;
      const id = regions[ri].dungeons.find((d) => !this.cleared(d));
      if (!id) continue;
      const t = game.manifest.titles[id];
      const boss = bossBannerInfo(id, '');
      return { id: 'next', text: `进入 L${t.lessons[0]}-${t.lessons[1]}「${t.title}」${boss?.tagline ? `，Boss ${boss.tagline}` : ''}`, target: id };
    }
    return { id: 'done', text: '🎉 全书通关！去深渊复习、挑战 SSS，或打造史诗装备吧' };
  }

  private async autoQuest(id: string) {
    this.cameras.main.setScroll(0, 0);
    await StoryRunner.play(this, id, { music: 'story' });
    await game.persist();
    this.scene.restart();
  }

  private async acceptQuest() {
    await StoryRunner.play(this, 'quest_L001_give');
    await game.persist();
    this.scene.restart();
  }

  private npcX: Record<string, number> = {};

  /** 屏幕上方的“当前目标”条 + 世界里目标头顶的跳动箭头 + 屏幕边缘方向箭头 */
  private objective(q: { text: string; target?: string }) {
    if (!q.text) return;
    // 目标所在的地点：可能在别的街区，此时先指向通往那里的路口/门
    // 目标副本在哪一章，就指向那一章街区的传送门（第 1 章在集市区）
    const chOf = (id: string) => Math.min(6, Math.ceil(dungeonNo(id) / 12));
    const portalOf = (ch: number) => (ch <= 1 ? 'portal' : `portal_${this.data_.districts.find((d) => d.chapter === ch && d.areas.length)?.id}`);
    const goal = q.target === 'blake' ? 'blake' : q.target ? portalOf(chOf(q.target)) : null;
    const gs = goal ? this.data_.spots.find((x) => x.id === goal) : undefined;
    let tx: number | undefined;
    let where = '';
    if (gs) {
      if (gs.district === this.dist.id) tx = gs.x;
      else {
        where = `（在${this.districtOf(gs.district)?.name}）`;
        const here = this.data_.spots.filter((x) => x.district === this.dist.id && x.link && (!x.after || this.cleared(x.after)));
        tx = (here.find((x) => x.link!.to === gs.district) ?? here.find((x) => !x.door) ?? here[0])?.x;
      }
    }
    const label = q.text + where;
    const c = this.add.container(640, 92).setDepth(60);
    const w = Math.min(640, 120 + label.length * 17);
    const g = this.add.graphics();
    g.fillStyle(0x8a5a12, 0.95).fillRoundedRect(-w / 2, -22, w, 44, 12).lineStyle(2, 0xffe14a, 1).strokeRoundedRect(-w / 2, -22, w, 44, 12);
    c.add([g, text(this, 0, 0, `📜 ${label}`, 18, '#fff6d8', { wordWrap: { width: w - 24 }, align: 'center' }).setOrigin(0.5)]);
    if (tx === undefined) return;
    this.objTargetX = tx;
    const arrow = text(this, tx, 230, '▼', 44, '#ffe14a', { stroke: '#7a3b00', strokeThickness: 6 }).setOrigin(0.5);
    this.world.add(arrow);
    this.tweens.add({ targets: arrow, y: arrow.y + 14, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.edgeArrow = text(this, 1240, 360, '▶', 48, '#ffe14a', { stroke: '#7a3b00', strokeThickness: 7 }).setOrigin(0.5).setDepth(56).setVisible(false);
    this.tweens.add({ targets: this.edgeArrow, alpha: 0.4, duration: 400, yoyo: true, repeat: -1 });
    this.questTarget = q.target ?? null;
    if (this.miniDot) {
      const m = this.add.circle(1010 + (tx / this.W) * 250, 45, 6, 0xffe14a).setStrokeStyle(2, 0x7a3b00).setDepth(51);
      this.tweens.add({ targets: m, scale: 1.4, duration: 400, yoyo: true, repeat: -1 });
    }
  }

  private questTarget: string | null = null;

  private dungeonPos: Record<string, [number, number]> = {};

  // ---------------- NPC 闲聊（DNF 式，背景音乐下不时说一句） ----------------

  private barkers: { id: string; x: number; top: number }[] = [];

  private async startBarks() {
    try {
      this.barkData = await (await fetch('content/npc/barks.json')).json();
    } catch {
      return;
    }
    const ok = (w?: string) => !w || w === 'always' || (w === 'after_L001' && this.cleared('L001-002')) || (w === 'after_L005' && this.cleared('L005-006'));
    for (const k of Object.keys(this.barkData)) if (Array.isArray(this.barkData[k])) this.barkData[k] = this.barkData[k].filter((l) => ok(l.when));
    let last = '';
    const tick = () => {
      if (!this.scene.isActive() || this.busy) return;
      // 只让屏幕里的 NPC 说话
      const pool = this.barkers.filter((b) => (this.barkData[b.id] ?? []).length && b.id !== last && Math.abs(b.x - this.hero.x) < 700);
      if (!pool.length) return;
      const b = pool[Math.floor(Math.random() * pool.length)];
      last = b.id;
      this.talkBark(b.id);
    };
    this.time.delayedCall(2500, tick);
    this.time.addEvent({ delay: 8000, loop: true, callback: tick });
  }

  private bubble(x: number, top: number, zh: string) {
    const t = text(this, 0, 0, zh, 17, '#2b2a4a', { wordWrap: { width: 230 }, align: 'center' }).setOrigin(0.5);
    const w = t.width + 24, h = t.height + 16;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.96).fillRoundedRect(-w / 2, -h / 2, w, h, 10).lineStyle(2, 0x2b2a4a, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    g.fillStyle(0xffffff, 1).fillTriangle(-8, h / 2 - 1, 8, h / 2 - 1, 0, h / 2 + 12);
    const c = this.add.container(x, top - h / 2 - 20, [g, t]).setScale(0.3);
    this.world.add(c);
    this.tweens.add({ targets: c, scale: 1, duration: 180, ease: 'Back.out' });
    this.tweens.add({ targets: c, alpha: 0, delay: 3800, duration: 300, onComplete: () => c.destroy() });
  }

  // ---------------- 商店（第 1 课的女士） ----------------

  private shop() {
    const s = game.s;
    const m = modal(this, 680, 440, '女士的小店');
    voice('woman', '欢迎光临！今天想买点什么？');
    const goods: { k: keyof typeof s.bag; name: string; desc: string; price: number; icon: string }[] = [
      { k: 'heart', name: '回心药水', desc: '下一场战斗 ❤ +1', price: 60, icon: '🧪' },
      { k: 'shield', name: '护盾卷轴', desc: '下一场战斗 🛡 +1', price: 80, icon: '📜' },
      { k: 'hint', name: '提示糖果', desc: '下一场战斗 💡 +1', price: 40, icon: '🍬' },
    ];
    m.c.add(text(this, m.x + 40, m.y + 66, `💰 你的金币：${s.gold}`, 20, '#ffe14a'));
    goods.forEach((g, i) => {
      const y = m.y + 130 + i * 86;
      m.c.add(text(this, m.x + 40, y - 16, `${g.icon} ${g.name}`, 24));
      m.c.add(text(this, m.x + 40, y + 16, `${g.desc}   已有 ${s.bag[g.k]}`, 17, COLORS.dim));
      const b = button(this, m.x + m.w - 110, y, 160, 50, `💰 ${g.price}`, () => {
        if (s.gold < g.price) return toast(this, '金币不够啦，去副本里赚一些吧', '#ffd27a');
        s.gold -= g.price;
        s.bag[g.k]++;
        sfx('coin');
        void game.persist();
        m.close();
        this.shop();
      }, { size: 20, color: 0x2f7a4d });
      b.setEnabled(s.gold >= g.price && s.bag[g.k] < 3);
      m.c.add(b);
    });
    m.c.add(text(this, m.x + m.w / 2, m.y + m.h - 30, '道具在进入副本时自动使用，每种最多带 3 个', 15, COLORS.dim).setOrigin(0.5));
  }

  private async prologue() {
    await StoryRunner.play(this, 'prologue', { music: 'story' });
    const s = game.s;
    if (!s.partners.includes('sophie')) s.partners.push('sophie');
    if (!s.story.seen.includes('prologue')) s.story.seen.push('prologue');
    await game.persist();
    this.scene.restart();
  }

  private npc(sp: SpotDef, act: () => unknown, mark: boolean) {
    const G = TownScene.GROUND;
    const isKid = sp.npc === 'kid';
    const p = new Puppet(this, sp.x, G, sp.npc!, isKid ? 0.34 : 0.4, { head: sp.head }).idle();
    this.world.add(p);
    // 面朝镜头中间
    if (sp.x % 1280 > 640) p.setScale(-Math.abs(p.scaleX), p.scaleY);
    const top = G - p.tall;
    this.npcX[sp.id] = sp.x;
    this.barkers.push({ id: sp.id, x: sp.x, top });
    this.world.add(text(this, sp.x, G + 14, sp.name ?? sp.id, 15, '#ffffff', { stroke: '#2b2a4a', strokeThickness: 4 }).setOrigin(0.5));
    if (mark) {
      const m = text(this, sp.x, top - 24, '!', 42, '#ffe14a', { fontStyle: 'bold', stroke: '#7a3b00', strokeThickness: 6 }).setOrigin(0.5);
      this.world.add(m);
      this.tweens.add({ targets: m, y: m.y - 8, duration: 500, yoyo: true, repeat: -1 });
    }
    this.spot(sp.id, sp.x, sp.label, act, sp.r);
  }

  /** 数据里的 act 字符串 → 实际动作 */
  private action(sp: SpotDef, q: { id: string }): () => unknown {
    const a = sp.act ?? '';
    if (sp.id === 'blake' && q.id === 'give1') return () => this.acceptQuest();
    if (a.startsWith('story:')) return () => StoryRunner.play(this, a.slice(6));
    const map: Record<string, () => unknown> = {
      bark: () => this.talkBark(sp.id),
      shop: () => this.shop(),
      daily: () => this.dailyTasks(),
      inventory: () => this.scene.start('Inventory'),
      skills: () => this.scene.start('Skills'),
      dungeons: () => this.mapModal(sp.region),
      abyss: () => this.abyssModal(),
      craft: () => this.craftModal(),
      tailor: () => this.scene.start('Wardrobe', { tailor: true }),
    };
    return map[a] ?? (() => undefined);
  }

  /** 去别的街区 / 进出室内 */
  private travel(to: string, x: number, door?: boolean) {
    sfx(door ? 'door_in' : 'ui_click', { volume: 0.7 });
    this.busy = true;
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ district: to, x }));
  }

  /** 路口路牌 / 门口的发光提示 */
  private signpost(sp: SpotDef) {
    const G = TownScene.GROUND;
    if (sp.door) {
      const g = this.add.graphics();
      g.fillStyle(0xffe9a0, 0.25).fillEllipse(sp.x, G + 6, 150, 34);
      this.world.add(g);
      this.tweens.add({ targets: g, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });
      return;
    }
    const right = sp.x > this.W / 2;
    const g = this.add.graphics();
    g.fillStyle(0x8a5a2b, 1).fillRect(sp.x - 5, G - 120, 10, 120);
    g.fillStyle(0xf3d9a4, 1).lineStyle(3, 0x2b2a4a, 1);
    const pts = right ? [[-60, -150], [40, -150], [64, -128], [40, -106], [-60, -106]] : [[60, -150], [-40, -150], [-64, -128], [-40, -106], [60, -106]];
    const v = pts.map(([dx, dy]) => new Phaser.Math.Vector2(sp.x + dx, G + dy));
    g.fillPoints(v, true).strokePoints(v, true);
    this.world.add(g);
    const to = this.districtOf(sp.link!.to);
    this.world.add(text(this, sp.x + (right ? -8 : 8), G - 128, to?.name ?? '', 17, '#5a3410', { fontStyle: 'bold' }).setOrigin(0.5));
  }

  /** 新街区的地下城传送门：紫色旋涡 + 光点 */
  private portal(sp: SpotDef) {
    const G = TownScene.GROUND, x = sp.x;
    const g = this.add.graphics();
    g.fillStyle(0x5a6280, 1).lineStyle(4, 0x2b2a4a, 1).fillRoundedRect(x - 95, G - 250, 190, 250, { tl: 95, tr: 95, bl: 0, br: 0 }).strokeRoundedRect(x - 95, G - 250, 190, 250, { tl: 95, tr: 95, bl: 0, br: 0 });
    g.fillStyle(0x6d2bd9, 1).fillRoundedRect(x - 70, G - 225, 140, 225, { tl: 70, tr: 70, bl: 0, br: 0 });
    this.world.add(g);
    const swirl = this.add.image(x, G - 110, this.textures.exists('p_twirl_1') ? 'p_twirl_1' : 'fx_dot').setTint(0xd28bff).setBlendMode('ADD').setScale(0.75);
    this.world.add(swirl);
    this.tweens.add({ targets: swirl, angle: 360, duration: 3000, repeat: -1 });
    const motes = this.add.particles(x, G - 110, this.textures.exists('p_light_1') ? 'p_light_1' : 'fx_dot', {
      emitZone: { type: 'random', source: new Phaser.Geom.Ellipse(0, 0, 120, 200) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      speedY: { min: -40, max: -10 }, lifespan: 1200, scale: { start: 0.12, end: 0 }, tint: [0xd28bff, 0xffffff], frequency: 120, blendMode: 'ADD',
    });
    this.world.add(motes);
  }

  /** 史诗工坊：铁砧 + 火炉（老乔的位置） */
  private anvil(sp: SpotDef) {
    const G = TownScene.GROUND, x = sp.x;
    const g = this.add.graphics();
    g.fillStyle(0x6b3f1d, 1).lineStyle(4, 0x2b2a4a, 1);
    g.fillRoundedRect(x + 30, G - 150, 110, 150, 10).strokeRoundedRect(x + 30, G - 150, 110, 150, 10);
    g.fillStyle(0xff7a2e, 1).fillRoundedRect(x + 50, G - 110, 70, 50, 8);
    g.fillStyle(0xffd34a, 1).fillRoundedRect(x + 62, G - 96, 46, 26, 6);
    g.fillStyle(0x5a6280, 1).lineStyle(4, 0x2b2a4a, 1);
    g.fillRect(x - 70, G - 74, 100, 26).strokeRect(x - 70, G - 74, 100, 26);
    g.fillRect(x - 45, G - 48, 50, 48).strokeRect(x - 45, G - 48, 50, 48);
    this.world.add(g);
    const fire = this.add.particles(x + 85, G - 110, 'fx_dot', {
      speedY: { min: -70, max: -30 }, speedX: { min: -10, max: 10 }, lifespan: 700, scale: { start: 0.5, end: 0 }, tint: [0xffd34a, 0xff7a2e], frequency: 90, blendMode: 'ADD',
    });
    this.world.add(fire);
    this.world.add(text(this, x, G + 14, sp.name ?? '', 15, '#ffffff', { stroke: '#2b2a4a', strokeThickness: 4 }).setOrigin(0.5));
    this.barkers.push({ id: sp.id, x, top: G - 160 });
  }

  /** 城镇大地图：点开放的街区直接传送；后面章节的街区显示锁 */
  private async worldMap() {
    if (this.busy) return;
    sfx('map_open', { volume: 0.7 });
    await loadNow(this, { images: { worldmap: 'assets/art/bg/worldmap.svg' } });
    const L = this.add.container(0, 0).setDepth(500);
    L.add(this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.6).setOrigin(0).setInteractive());
    if (this.textures.exists('worldmap')) L.add(this.add.image(640, 360, 'worldmap').setScale(0.94));
    const P = (x: number, y: number) => [640 + (x - 640) * 0.94, 360 + (y - 360) * 0.94] as const;
    for (const d of this.data_.districts) {
      if (!d.map) continue;
      const [x, y] = P(d.map[0], d.map[1]);
      const open = this.chapterOpen(d.chapter ?? 1) && d.areas.length > 0;
      const here = d.id === this.dist.id;
      const b = button(this, x, y + 46, 150, 38, open ? d.name : `🔒 ${d.name}`, () => {
        L.destroy();
        if (!here) this.travel(d.id, 640);
      }, { size: 16, color: here ? 0x2f7a4d : open ? 0x8a5a12 : 0x444a6b });
      b.setEnabled(open);
      L.add(b);
      if (!open) L.add(text(this, x, y + 74, d.areas.length ? '通关上一章开放' : `第 ${d.chapter} 章开放`, 13, '#ffffff', { stroke: '#2b2a4a', strokeThickness: 4 }).setOrigin(0.5));
      if (here) {
        const pin = text(this, x, y - 40, '📍', 36).setOrigin(0.5);
        L.add(pin);
        this.tweens.add({ targets: pin, y: y - 50, duration: 400, yoyo: true, repeat: -1 });
      }
    }
    L.add(text(this, 640, 36, '城镇地图 · 点击街区快速前往', 24, '#ffffff', { stroke: '#2b2a4a', strokeThickness: 6, fontStyle: 'bold' }).setOrigin(0.5));
    L.add(button(this, 1200, 44, 52, 52, '✕', () => L.destroy(), { size: 22 }));
  }

  /** 史诗工坊：10 个史诗碎片 + 金币 → 自选一把史诗武器 */
  private async craftModal() {
    const s = game.s;
    await loadNow(this, { weapons: epicsFor(s.cls).map((e) => e.look) });
    const m = modal(this, 900, 520, '🔨 史诗工坊 · 铁匠老乔');
    this.talkBark('smith');
    m.c.add(text(this, m.x + 40, m.y + 64, `史诗碎片 ${s.mats.shard}/${CRAFT_COST.shard}    💰 ${s.gold}/${CRAFT_COST.gold}    Boss之魂 ${s.mats.soul}`, 20, '#ffd38a'));
    m.c.add(text(this, m.x + 40, m.y + 96, '碎片来自打败 Boss（首通 3 个，之后每次 1–2 个）；Boss之魂用于强化 +8 以上', 15, COLORS.dim));
    const bar0 = bar(this, m.x + 40, m.y + 124, m.w - 80, 12, Math.min(1, s.mats.shard / CRAFT_COST.shard), 0xffb020);
    m.c.add(bar0.g);
    epicsFor(s.cls).forEach((e, i) => {
      const n = epicsFor(s.cls).length, cx = m.x + m.w / 2 + (i - (n - 1) / 2) * 300, cy = m.y + 270;
      const g = this.add.graphics();
      g.fillStyle(0x1a1f38, 1).fillRoundedRect(cx - 135, cy - 110, 270, 290, 14).lineStyle(3, e.color, 1).strokeRoundedRect(cx - 135, cy - 110, 270, 290, 14);
      m.c.add(g);
      const look = weaponLook({ name: e.name, slot: 'weapon' });
      const key = `hero_weapon_${look}`;
      if (this.textures.exists(key)) {
        const img = this.add.image(cx, cy - 20, key).setAngle(35);
        img.setScale(150 / Math.max(img.width, img.height));
        img.preFX?.addGlow(e.color, 4, 0, false, 0.1, 10);
        m.c.add(img);
        this.tweens.add({ targets: img, y: cy - 30, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      m.c.add(text(this, cx, cy + 80, e.name.replace('史诗·', ''), 18, `#${e.color.toString(16).padStart(6, '0')}`, { fontStyle: 'bold' }).setOrigin(0.5));
      m.c.add(text(this, cx, cy + 110, e.desc, 13, COLORS.dim, { wordWrap: { width: 240 }, align: 'center' }).setOrigin(0.5));
      const owned = s.crafted.includes(e.name);
      const b = button(this, cx, cy + 150, 200, 42, owned ? '再打造一把' : '打造', () => {
        const it = craftEpic(s, e.name);
        if (!it) return;
        m.close();
        sfx('craft');
        this.time.delayedCall(400, () => sfx('equip_epic'));
        void game.persist();
        this.cameras.main.flash(400, 255, 220, 140);
        toast(this, `🎉 打造成功！获得【${it.name}】，去兵器架装备它吧！`, `#${e.color.toString(16).padStart(6, '0')}`);
      }, { size: 17, color: 0x8a5a12 });
      b.setEnabled(canCraft(s));
      m.c.add(b);
    });
  }

  private dailyTasks() {
    const s = game.s;
    const m = modal(this, 640, 420, '每日任务（做完即止，不用硬刷）');
    DAILY_TASKS.forEach((t, i) => {
      const y = m.y + 100 + i * 90;
      const prog = Math.min(t.goal, t.progress(s));
      const done = s.daily.claimed.includes(t.id);
      m.c.add(text(this, m.x + 40, y - 18, t.name, 24));
      m.c.add(text(this, m.x + 40, y + 16, `${prog}/${t.goal}   奖励：${t.reward.stones ? `💎×${t.reward.stones} ` : ''}${t.reward.gold ? `💰×${t.reward.gold}` : ''}`, 18, COLORS.dim));
      const b = button(this, m.x + m.w - 110, y, 150, 50, done ? '已领取' : '领取', () => {
        if (claimDaily(s, t.id)) {
          sfx('coin');
          void game.persist();
          m.close();
          this.scene.restart();
        }
      }, { size: 20, color: 0x2f7a4d });
      b.setEnabled(!done && prog >= t.goal);
      m.c.add(b);
    });
  }

  private regionIdx = -1;

  private cleared(id: string) {
    return (game.s.dungeons[id]?.clears ?? 0) > 0;
  }

  private regionUnlocked(ri: number) {
    return ri === 0 || game.manifest.regions[ri - 1].dungeons.every((id) => this.cleared(id));
  }

  /** 传送门：副本地图（弹窗） */
  private mapModal(region?: number) {
    const dim = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.6).setOrigin(0).setInteractive().setDepth(499);
    const close = button(this, 1150, 50, 48, 48, '✕', () => {
      dim.destroy();
      close.destroy();
      this.mapLayer?.destroy();
      this.mapArrow?.destroy();
    }, { size: 22 }).setDepth(502);
    this.regionIdx = region !== undefined && region < game.manifest.regions.length ? region : -1;
    this.mapPanel();
  }

  private mapLayer?: Phaser.GameObjects.Container;
  private mapArrow?: Phaser.GameObjects.Text;

  private mapPanel() {
    const s = game.s;
    const regions = game.manifest.regions;
    if (this.regionIdx < 0) {
      // 默认显示正在攻略的地图
      const cur = regions.findIndex((r, ri) => this.regionUnlocked(ri) && r.dungeons.some((id) => !this.cleared(id)));
      this.regionIdx = cur >= 0 ? cur : regions.length - 1;
    }
    const ri = this.regionIdx;
    const region = regions[ri];
    const unlocked = this.regionUnlocked(ri);
    const x = 380;
    this.mapLayer?.destroy();
    this.mapArrow?.destroy();
    const L = (this.mapLayer = this.add.container(0, 0).setDepth(500));
    L.add(panel(this, x, 20, 520, 600));
    L.add(text(this, x + 260, 46, `📍 ${region.name}`, 30, unlocked ? '#ffffff' : COLORS.dim).setOrigin(0.5));
    L.add(text(this, x + 260, 82, unlocked ? region.grammar : '🔒 通关上一张地图后解锁', 16, COLORS.dim).setOrigin(0.5));
    const go = (d: number) => {
      this.regionIdx = Phaser.Math.Clamp(ri + d, 0, regions.length - 1);
      this.mapPanel();
    };
    if (ri > 0) L.add(button(this, x + 40, 50, 52, 52, '◀', () => go(-1), { size: 24 }));
    if (ri < regions.length - 1) L.add(button(this, x + 480, 50, 52, 52, '▶', () => go(1), { size: 24 }));

    region.dungeons.forEach((id, i) => {
      const lesson = game.manifest.titles[id];
      const rec = s.dungeons[id];
      const fresh = TownScene.NEW.has(id);
      // 切片：L5-6 在通关 L1-2 后直接开放（主线任务）
      const open = dungeonOpen(game.s, game.manifest, id);
      const cx = x + 132 + (i % 2) * 256;
      const cy = 140 + Math.floor(i / 2) * 76;
      this.dungeonPos[id] = [cx, cy];
      const label = `${fresh ? '★ ' : ''}L${lesson.lessons[0]}-${lesson.lessons[1]}\n${lesson.title}`;
      const b = button(this, cx, cy, 244, 66, open ? label : `🔒 ${label}`, () => (id === 'L001-002' && !s.story.seen.includes('quest_L001_give') ? this.acceptQuest() : this.enterDungeon(id)), {
        size: 17, color: fresh ? 0x8a5a12 : rec?.clears ? 0x2a4a3a : COLORS.btn,
      });
      b.setEnabled(open);
      L.add(b);
      if (rec?.bestRank) {
        const c = { SSS: '#ffb020', SS: '#ff6bc8', S: '#b46bff', A: '#5aa9ff', B: '#cfd3dc', C: '#8f96c2' }[rec.bestRank];
        L.add(text(this, cx + 112, cy - 30, rec.bestRank, 22, c, { fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 0));
      }
    });
    const done = region.dungeons.filter((id) => this.cleared(id)).length;
    L.add(text(this, x + 260, 590, `本地图通关 ${done}/${region.dungeons.length}`, 18, COLORS.dim).setOrigin(0.5));
    const tgt = this.questTarget && this.dungeonPos[this.questTarget];
    if (tgt && region.dungeons.includes(this.questTarget!)) {
      const a = (this.mapArrow = text(this, tgt[0] - 150, tgt[1], '▶', 40, '#ffe14a', { stroke: '#7a3b00', strokeThickness: 6 }).setOrigin(0.5).setDepth(501));
      this.tweens.add({ targets: a, x: tgt[0] - 136, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  /** 下载这一课（以及复习要用的已玩过的课）后进入 */
  private async enterDungeon(id: string) {
    await game.ensureLessons([id, ...game.playedLessons()]);
    const lesson = game.index.lesson(id);
    if (lesson) this.enter(buildBattle(lesson, game.s, game.index));
  }

  private async abyssModal() {
    const s = game.s;
    await game.ensureLessons(game.playedLessons());
    const due = dueItems(s, game.index).length;
    const ok = due >= BALANCE.abyssMinDue;
    const m = modal(this, 560, 300, '🌑 每日深渊');
    m.c.add(text(this, m.x + m.w / 2, m.y + 110, ok ? `有 ${due} 个词句该复习了，出货率 UP！` : `待复习 ${due}/${BALANCE.abyssMinDue}，先去打副本吧`, 20, COLORS.dim).setOrigin(0.5));
    const b = button(this, m.x + m.w / 2, m.y + 210, 300, 56, '进入深渊', () => this.enter(buildAbyssBattle(s, game.index)), { color: 0x6d2bd9 });
    // 深渊题目来自已玩过的课：已在上面下载好
    b.setEnabled(ok);
    m.c.add(b);
  }

  private enter(plan: BattlePlan) {
    const s = game.s;
    if (timeLeftMs(s) <= 0) {
      toast(this, `今天的 ${s.settings.dailyMinutes} 分钟冒险时间到啦，明天见！`, '#ffd27a');
      return;
    }
    const d = today();
    if (!s.stats.playDays.includes(d)) s.stats.playDays.push(d);
    void game.persist();
    party.leave(); // 自己去打副本就先退出队伍，免得让队友干等
    this.scene.start('Battle', { plan });
  }

  private achievements() {
    const s = game.s;
    const m = modal(this, 620, 560, `成就 ${s.achievements.length}/${Object.keys(ACHIEVEMENTS).length}`);
    Object.entries(ACHIEVEMENTS).forEach(([id, a], i) => {
      const got = s.achievements.includes(id);
      const y = m.y + 80 + i * 56;
      m.c.add(text(this, m.x + 40, y, `${got ? '🏆' : '🔒'} ${a.name}`, 24, got ? '#ffc94a' : COLORS.dim));
      m.c.add(text(this, m.x + 260, y + 4, a.desc, 18, COLORS.dim));
    });
  }

  private async saveMenu() {
    const s = game.s;
    const m = modal(this, 640, 520, '存档管理');
    m.c.add(text(this, m.x + 40, m.y + 70, '游戏每打完一关自动存档。导出的文件可以在任何电脑上导入。', 18, COLORS.dim));
    m.c.add(button(this, m.x + m.w / 2, m.y + 130, 300, 52, '⬇ 导出备份文件', () => {
      downloadText(`英语地下城-${s.name}-${stamp()}.json`, exportSave(s));
    }, { color: 0x2f7a4d }));
    m.c.add(text(this, m.x + 40, m.y + 180, '自动快照（点击可回到当时的进度）：', 18));
    const backups = (await listBackups(s.id)).slice(0, 5);
    backups.forEach((b, i) => {
      const d = new Date(b.at);
      const label = `${d.toLocaleString('zh-CN')}   Lv.${b.data.level}  金币 ${b.data.gold}`;
      m.c.add(button(this, m.x + m.w / 2, m.y + 230 + i * 54, 560, 46, label, async () => {
        game.use(structuredClone(b.data));
        await saveProfile(game.s);
        toast(this, '已恢复到该快照', '#7dffa5');
        this.scene.restart();
      }, { size: 18, color: 0x2a2f52 }));
    });
  }

  private jobChange() {
    const m = modal(this, 900, 420, '转职：选择你的道路');
    (['swordsman', 'mage', 'ranger'] as Job[]).forEach((job, i) => {
      const cx = m.x + 160 + i * 290;
      m.c.add(this.add.image(cx, m.y + 160, `player_${job}`).setScale(1.3));
      m.c.add(text(this, cx, m.y + 250, JOBS[job].name, 26).setOrigin(0.5));
      m.c.add(text(this, cx, m.y + 285, JOBS[job].desc, 18, COLORS.dim).setOrigin(0.5));
      m.c.add(button(this, cx, m.y + 350, 200, 50, '选择', () => {
        game.s.job = job;
        void game.persist();
        this.scene.restart();
      }, { color: RARITY.rare.color }));
    });
  }
}
