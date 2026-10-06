import { loadNow } from '../assets';
import { heroRig } from '../systems/classes';
import Phaser from 'phaser';
import { speak, stop, voice } from '../audio/speech';
import { music, sfx } from '../audio/sound';
import type { AudioClip } from '../content/types';
import { KID_HEADS, Puppet } from '../gfx/puppet';
import { game } from '../state';
import { button, COLORS, EN_FONT, FONT, text } from '../ui/widgets';

/** 剧本格式见 docs/slice/SPEC.md 第 2 节；文件由 build-content 复制到 public/content/story/ */
export interface StoryStep {
  t: 'say' | 'narr' | 'enter' | 'exit' | 'fx' | 'sfx' | 'item' | 'wait' | 'bg' | 'quest';
  who?: string;
  face?: string;
  zh?: string;
  en?: string;
  audio?: { lesson: string; line: number };
  side?: 'left' | 'right';
  key?: string;
  ms?: number;
}
export interface Story {
  id: string;
  bg?: string;
  steps: StoryStep[];
}

const NAMES: Record<string, string> = {
  hero: '我', sophie: 'Sophie', blake: 'Mr. Blake', woman: '女士', duke: '缄默公爵',
  hans: 'Hans', naoko: 'Naoko', changwoo: 'Chang-woo', luming: 'Luming', xiaohui: 'Xiaohui',
  boss_pardon: '吞声领主 · 帕顿', boss_whomist: '夺名迷雾 · 胡迷斯',
};
const ITEM_NAMES: Record<string, string> = { book: '台词簿', page1: '台词簿 · 第 1 页', page5: '台词簿 · 第 5 页' };

export async function loadStory(id: string): Promise<Story | null> {
  try {
    const r = await fetch(`content/story/${id}.json`);
    return r.ok ? ((await r.json()) as Story) : null;
  } catch {
    return null;
  }
}

function clipFor(a?: { lesson: string; line: number }): AudioClip | undefined {
  if (!a) return undefined;
  return game.index.lesson(a.lesson)?.dialogue[a.line]?.audio;
}

/**
 * 在任意场景上播放一段剧本：底部对话框 + 两侧立绘（纸娃娃放大）+ 打字机。
 * 点击推进；右上角“跳过”。返回时剧本已结束、所有对象已销毁。
 */
export class StoryRunner {
  private layer: Phaser.GameObjects.Container;
  private actors = new Map<string, Phaser.GameObjects.Container | Phaser.GameObjects.Image>();
  private fog?: Phaser.GameObjects.Rectangle;
  private skipped = false;
  /** 场景已关闭（切场景/重启）：立刻停止，不再往新场景里画东西 */
  private dead = false;
  private advance?: () => void;
  private typing?: Phaser.Time.TimerEvent;

  constructor(private scene: Phaser.Scene) {
    this.layer = scene.add.container(0, 0).setDepth(200);
  }

  static async play(scene: Phaser.Scene, id: string, opts: { music?: string } = {}) {
    // 加载剧本期间场景若被关闭/重启，就放弃播放（同一个 Scene 对象会被复用）
    let closed = false;
    const mark = () => (closed = true);
    scene.events.once('shutdown', mark);
    const story = await loadStory(id);
    // 按需加载剧本里出场的角色、Boss、道具
    if (story && !closed) {
      const who = new Set(story.steps.map((st) => st.who).filter((w): w is string => !!w));
      const kids = [...who].filter((w) => (KID_HEADS as readonly string[]).includes(w));
      const mobs = [...who].filter((w) => w.startsWith('boss_') || w === 'duke');
      const chars = [...who].filter((w) => !kids.includes(w) && !mobs.includes(w) && w !== 'hero' && scene.cache.json.exists(`rig_${w}`));
      const props = story.steps.filter((st) => st.t === 'item' && st.key).map((st) => (st.key === 'book' || st.key!.startsWith('page') ? 'book' : st.key!));
      // 剧本里引用的课文原声：先下载那几课
      const ids = [...JSON.stringify(story).matchAll(/"lesson":"(L\d{3}-\d{3})"/g)].map((m) => m[1]);
      if (ids.length) await game.ensureLessons(ids);
      await loadNow(scene, { chars: kids.length ? [...chars, 'kid'] : chars, heads: kids, mobs, props, heroes: who.has('hero') ? [game.s] : [] });
    }
    scene.events.off('shutdown', mark);
    if (!story || closed) return;
    await new StoryRunner(scene).run(story, opts);
  }

  async run(story: Story, opts: { music?: string } = {}) {
    const s = this.scene;
    const { width, height } = s.scale;
    if (opts.music) music(opts.music);
    // 全屏透明输入层：点任意处推进
    const hit = s.add.rectangle(0, 0, width, height, 0x000000, 0.25).setOrigin(0).setInteractive();
    hit.on('pointerdown', () => this.advance?.());
    this.layer.add(hit);
    const skip = button(s, width - 80, 36, 120, 44, '跳过 ▶▶', () => {
      this.skipped = true;
      this.advance?.();
    }, { size: 18, color: 0x444a6b });
    this.layer.add(skip);
    const keys = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') this.advance?.();
      if (e.key === 'Escape') {
        this.skipped = true;
        this.advance?.();
      }
    };
    window.addEventListener('keydown', keys);
    const onShutdown = () => {
      this.dead = true;
      this.skipped = true;
      this.advance?.();
    };
    s.events.once('shutdown', onShutdown);
    try {
      for (const step of story.steps) {
        if (this.skipped || this.dead) break;
        await this.step(step);
      }
    } finally {
      s.events.off('shutdown', onShutdown);
      window.removeEventListener('keydown', keys);
      stop();
      this.typing?.remove();
      if (!this.dead) this.layer.destroy();
      game.save?.story.seen.includes(story.id) || game.save?.story.seen.push(story.id);
    }
  }

  private wait(ms: number) {
    return new Promise<void>((r) => {
      if (this.dead) return r();
      const t = this.scene.time.delayedCall(ms, () => {
        this.advance = undefined;
        r();
      });
      this.advance = () => {
        t.remove();
        this.advance = undefined;
        r();
      };
    });
  }

  private actor(who: string, side: 'left' | 'right') {
    const s = this.scene;
    const x = side === 'left' ? 230 : 1050;
    let a: Phaser.GameObjects.Container | Phaser.GameObjects.Image;
    if (who.startsWith('boss_') || who === 'duke') {
      a = s.add.image(x, 520, s.textures.exists(`mob_${who}`) ? `mob_${who}` : 'boss').setOrigin(0.5, 1);
      const sc = Math.min(1, 380 / Math.max(a.height, 1));
      a.setScale(side === 'left' ? -sc : sc, sc);
    } else {
      const isKid = (KID_HEADS as readonly string[]).includes(who);
      const rig = who === 'hero' && game.save ? heroRig(game.s.cls ?? 'sword', game.s.gender ?? 'm') : isKid ? 'kid' : who;
      a = new Puppet(s, x, 560, rig, 1.05, { head: isKid ? who : undefined, flip: side === 'right', fallback: 'player_novice' });
      if (who === 'hero' && game.save) (a as Puppet).setCostume(game.s.wardrobe.worn);
      (a as Puppet).idle();
    }
    a.setAlpha(0);
    this.layer.addAt(a, 1);
    this.actors.set(who, a);
    s.tweens.add({ targets: a, alpha: 1, x: { from: x + (side === 'left' ? -80 : 80), to: x }, duration: 260, ease: 'Quad.out' });
    return a;
  }

  private async step(st: StoryStep) {
    const s = this.scene;
    if (this.dead) return;
    switch (st.t) {
      case 'enter':
        if (st.who && !this.actors.has(st.who)) this.actor(st.who, st.side ?? 'left');
        return this.wait(260);
      case 'exit': {
        const a = st.who && this.actors.get(st.who);
        if (a) {
          s.tweens.add({ targets: a, alpha: 0, duration: 220, onComplete: () => a.destroy() });
          this.actors.delete(st.who!);
        }
        return this.wait(220);
      }
      case 'sfx':
        sfx(st.key ?? '');
        return;
      case 'wait':
        return this.wait(st.ms ?? 500);
      case 'fx':
        return this.fx(st.key ?? '');
      case 'item':
        return this.item(st);
      case 'quest':
        return this.quest(st.zh ?? '');
      case 'narr':
      case 'say':
        return this.say(st);
      default:
        return;
    }
  }

  private async fx(key: string) {
    const s = this.scene;
    const { width, height } = s.scale;
    if (key === 'fog') {
      sfx('fog');
      this.fog?.destroy();
      this.fog = s.add.rectangle(0, 0, width, height, 0x6b4fa8, 0).setOrigin(0);
      this.layer.addAt(this.fog, 1);
      s.tweens.add({ targets: this.fog, fillAlpha: 0.45, duration: 900 });
      return this.wait(900);
    }
    if (key === 'fog_clear') {
      sfx('fog_clear');
      if (this.fog) s.tweens.add({ targets: this.fog, fillAlpha: 0, duration: 700 });
      return this.wait(700);
    }
    if (key === 'shake') {
      if (!game.save?.settings.reduceFx) s.cameras.main.shake(300, 0.006);
      return this.wait(300);
    }
    if (key === 'flash') {
      if (!game.save?.settings.reduceFx) s.cameras.main.flash(150);
      return this.wait(150);
    }
  }

  private async quest(zh: string) {
    const s = this.scene;
    sfx('levelup', { volume: 0.5 });
    const c = s.add.container(640, 200);
    const g = s.add.graphics();
    g.fillStyle(0x8a5a12, 0.95).fillRoundedRect(-380, -40, 760, 80, 16).lineStyle(3, 0xffe14a, 1).strokeRoundedRect(-380, -40, 760, 80, 16);
    c.add([g, text(s, 0, 0, `📜 ${zh}`, 26, '#fff6d8', { fontStyle: 'bold' }).setOrigin(0.5)]);
    c.setScale(0.3);
    this.layer.add(c);
    s.tweens.add({ targets: c, scale: 1, duration: 300, ease: 'Back.out' });
    await this.wait(2200);
    c.destroy();
  }

  private async item(st: StoryStep) {
    const s = this.scene;
    sfx('loot');
    const key = st.key === 'book' || st.key?.startsWith('page') ? 'prop_book' : `prop_${st.key}`;
    const c = s.add.container(640, 300);
    if (s.textures.exists(key)) c.add(s.add.image(0, -20, key).setScale(1.3));
    c.add(text(s, 0, 70, st.zh ?? `获得：${ITEM_NAMES[st.key ?? ''] ?? st.key}`, 30, '#ffe14a', { stroke: '#000', strokeThickness: 6 }).setOrigin(0.5));
    c.setScale(0.3);
    this.layer.add(c);
    s.tweens.add({ targets: c, scale: 1, duration: 300, ease: 'Back.out' });
    await this.wait(2200);
    c.destroy();
  }

  private say(st: StoryStep): Promise<void> {
    const s = this.scene;
    const { width } = s.scale;
    const box = s.add.container(0, 0);
    const isNarr = st.t === 'narr';
    const g = s.add.graphics();
    g.fillStyle(0x161a2e, 0.94).fillRoundedRect(60, 540, width - 120, 160, 18);
    g.lineStyle(3, 0x8ec5ff, 0.5).strokeRoundedRect(60, 540, width - 120, 160, 18);
    box.add(g);
    const who = st.who ?? '';
    if (!isNarr && who && !this.actors.has(who)) {
      const left = ['hero', 'sophie', 'hans', 'naoko', 'changwoo', 'luming', 'xiaohui'].includes(who);
      this.actor(who, left ? 'left' : 'right');
    }
    const actor = this.actors.get(who);
    if (actor instanceof Puppet && st.face) actor.setFace(st.face);
    // 说话的人亮，其他人暗
    for (const [k, a] of this.actors) a.setAlpha(k === who || isNarr ? 1 : 0.55);
    if (!isNarr) {
      const left = actor ? actor.x < width / 2 : true;
      const nx = left ? 100 : width - 100;
      const plate = s.add.graphics();
      plate.fillStyle(0x3b62d9, 1).fillRoundedRect(left ? nx : nx - 200, 518, 200, 40, 10);
      box.add(plate);
      box.add(text(s, left ? nx + 100 : nx - 100, 538, NAMES[who] ?? who, 20, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    }
    const en = st.en;
    const body = en ?? st.zh ?? '';
    const t = s.add.text(110, 582, '', {
      fontFamily: en ? EN_FONT : FONT, fontSize: en ? '36px' : '28px', color: isNarr ? '#cfd6ff' : '#ffffff',
      fontStyle: isNarr ? 'italic' : en ? 'bold' : 'normal', wordWrap: { width: width - 240 },
    });
    box.add(t);
    if (en && st.zh) box.add(text(s, 110, 640, st.zh, 20, COLORS.dim));
    const clip = clipFor(st.audio);
    if (en) {
      box.add(button(s, width - 130, 620, 80, 52, '🔊', () => speak({ text: en, clip }), { size: 24 }));
      speak({ text: en, clip });
    } else if (!(st.zh && !isNarr && voice(who, st.zh))) sfx('page', { volume: 0.3 });
    const arrow = text(s, width - 100, 676, '▼', 20, '#8ec5ff').setOrigin(0.5).setAlpha(0);
    box.add(arrow);
    this.layer.add(box);

    // 打字机：中文约 30 字/秒；点击先补全，再翻页
    let shown = 0;
    const chars = [...body];
    const cps = en ? 40 : 30;
    return new Promise((resolve) => {
      const finishTyping = () => {
        this.typing?.remove();
        t.setText(body);
        shown = chars.length;
        arrow.setAlpha(1);
        s.tweens.add({ targets: arrow, y: 682, duration: 400, yoyo: true, repeat: -1 });
      };
      this.typing = s.time.addEvent({
        delay: 1000 / cps, repeat: chars.length - 1,
        callback: () => {
          shown++;
          t.setText(chars.slice(0, shown).join(''));
          if (shown >= chars.length) finishTyping();
        },
      });
      // 原声句：播放时长后自动可翻页
      const minMs = clip?.end !== undefined ? (clip.end - (clip.start ?? 0)) * 1000 : 0;
      const t0 = Date.now();
      this.advance = () => {
        if (this.skipped) {
          box.destroy();
          resolve();
          return;
        }
        if (shown < chars.length) return finishTyping();
        if (Date.now() - t0 < Math.min(minMs, 2500)) return;
        this.advance = undefined;
        box.destroy();
        resolve();
      };
    });
  }
}
