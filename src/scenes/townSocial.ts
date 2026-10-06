import Phaser from 'phaser';
import { loadNow } from '../assets';
import { speak } from '../audio/speech';
import { makeHero } from '../gfx/hero';
import type { Puppet } from '../gfx/puppet';
import { loadPhrases, lookToSave, net, phraseUnlocked, type NetEvent, type Phrase, type RemotePlayer } from '../net/realtime';
import { game } from '../state';
import { friends } from '../net/friends';
import { modal } from '../ui/modal';
import { mail } from '../net/mail';
import { party } from '../net/party';
import { openFriends } from './friendsUI';
import { openParty } from './partyUI';
import { openGiftPicker, openMailbox } from './mailUI';
import { button, COLORS, text, toast } from '../ui/widgets';

interface Remote {
  p: RemotePlayer;
  x: number;
  tx: number;
  hero?: Puppet;
  label?: Phaser.GameObjects.Text;
  hit?: Phaser.GameObjects.Rectangle;
  running: boolean;
}

const CLS = { sword: '剑士', gunner: '神枪手', mage: '魔法师' };

/**
 * 城镇里的“多人”：把同一街区的其他孩子画出来（带走路动画和名字），
 * 提供“打招呼”（预设短句）和“在线名单”两个按钮。TownScene 只需要 start / update。
 */
export class TownSocial {
  private players = new Map<string, Remote>();
  private phrases: Phrase[] = [];
  private count = 1;
  private countBtn?: Phaser.GameObjects.Container;
  private wantList = false;
  private alive = true;
  private myBubble?: Phaser.GameObjects.Container;
  private friendBadge?: Phaser.GameObjects.Text;
  private mailBadge?: Phaser.GameObjects.Text;
  private partyBadge?: Phaser.GameObjects.Text;
  private unsubParty?: () => void;

  constructor(
    private scene: Phaser.Scene,
    private world: Phaser.GameObjects.Container,
    private ground: number,
    private district: string,
    private me: () => Puppet,
  ) {}

  get active() {
    return net.enabled;
  }

  start(x0: number) {
    if (!net.enabled) return;
    net.onEvent = (e) => this.handle(e);
    net.join(this.district, x0, 0);
    void loadPhrases().then((p) => (this.phrases = p));
    this.buildUI();
    this.hookParty();
    friends.onChange = () => this.onFriends();
    mail.onChange = () => this.onMail();
    void friends.refresh().catch(() => null);
    void mail.refresh().catch(() => null);
    this.scene.events.once('shutdown', () => this.stop());
  }

  stop() {
    this.alive = false;
    if (net.onEvent) net.onEvent = null;
    net.leave();
    if (friends.onChange) friends.onChange = null;
    if (mail.onChange) mail.onChange = null;
    this.unsubParty?.();
    party.onNote = null;
    party.onStart = null;
    for (const r of this.players.values()) this.destroy(r);
    this.players.clear();
  }

  // ---------------- 其他孩子 ----------------

  private async add(p: RemotePlayer) {
    this.remove(p.id);
    const r: Remote = { p, x: p.x, tx: p.x, running: false };
    this.players.set(p.id, r);
    await loadNow(this.scene, { heroes: [lookToSave(p)] });
    if (!this.alive || this.players.get(p.id) !== r || !this.scene.scene.isActive()) return;
    const hero = makeHero(this.scene, r.x, this.ground, lookToSave(p), 0.42).idle();
    hero.setAlpha(0);
    this.world.add(hero);
    this.scene.tweens.add({ targets: hero, alpha: 1, duration: 300 });
    const label = text(this.scene, r.x, this.ground - hero.tall - 16, `${p.title ? `【${p.title}】` : ''}Lv.${p.lv} ${p.name}`, 17, '#9fe3ff', { stroke: '#2b2a4a', strokeThickness: 5 }).setOrigin(0.5);
    this.world.add(label);
    r.hero = hero;
    r.label = label;
    // 点一下别的小朋友：加好友 / 送礼物
    const hit = this.scene.add.rectangle(r.x, this.ground - 80, 90, 170, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.playerMenu(r));
    this.world.add(hit);
    r.hit = hit;
    this.face(r, p.d);
    this.styleLabel(r);
    this.updateCount();
  }

  private destroy(r: Remote) {
    r.hero?.destroy();
    r.label?.destroy();
    r.hit?.destroy();
  }

  /** 好友头顶加星标、名字变金色 */
  private styleLabel(r: Remote) {
    const fr = friends.isFriend(r.p.id);
    r.label?.setText(`${fr ? '⭐ ' : ''}${r.p.title ? `【${r.p.title}】` : ''}Lv.${r.p.lv} ${r.p.name}`).setColor(fr ? '#ffe14a' : '#9fe3ff');
  }

  private onMail() {
    const n = mail.unread;
    this.mailBadge?.setText(String(n)).setVisible(n > 0);
  }

  private onFriends() {
    for (const r of this.players.values()) this.styleLabel(r);
    const n = friends.pending;
    this.friendBadge?.setText(String(n)).setVisible(n > 0);
  }

  private remove(id: string) {
    const r = this.players.get(id);
    if (!r) return;
    this.destroy(r);
    this.players.delete(id);
    this.updateCount();
  }

  private face(r: Remote, d: number) {
    if (!r.hero || !d) return;
    const sx = Math.abs(r.hero.scaleX);
    r.hero.setScale(d < 0 ? -sx : sx, r.hero.scaleY);
  }

  /** 每帧：平滑移动别人的位置，走路 / 站立动画 */
  update(dt: number, myX: number, facing: number, moving: boolean) {
    if (!this.alive) return;
    net.tick(myX, moving ? facing : 0, moving);
    for (const r of this.players.values()) {
      const dx = r.tx - r.x;
      r.x += dx * Math.min(1, dt * 9);
      if (!r.hero) continue;
      r.hero.x = r.x;
      r.label?.setX(r.x);
      r.hit?.setX(r.x);
      const walking = Math.abs(dx) > 4 || r.p.m;
      if (walking && !r.running) {
        r.running = true;
        r.hero.run();
      } else if (!walking && r.running) {
        r.running = false;
        r.hero.idle();
      }
      if (Math.abs(dx) > 4) this.face(r, Math.sign(dx));
    }
  }

  // ---------------- 收消息 ----------------

  private handle(e: NetEvent) {
    switch (e.t) {
      case 'room':
        party.me = e.you;
        for (const p of e.players) void this.add(p);
        this.count = e.players.length + 1;
        this.updateCount();
        break;
      case 'in':
        void this.add(e.p);
        break;
      case 'out': {
        const r = this.players.get(e.id);
        if (r?.hero) this.scene.tweens.add({ targets: [r.hero, r.label], alpha: 0, duration: 250, onComplete: () => this.remove(e.id) });
        else this.remove(e.id);
        break;
      }
      case 'mv': {
        const r = this.players.get(e.id);
        if (!r) return;
        r.tx = e.x;
        r.p.m = e.m;
        r.p.d = e.d;
        break;
      }
      case 'say': {
        const r = this.players.get(e.id);
        const ph = this.phrases.find((x) => x.id === e.ph);
        if (!r || !ph) return;
        this.bubble(r.x, this.ground - (r.hero?.tall ?? 150), ph);
        // 离得近才播放声音，免得远处的孩子打扰
        if (Math.abs(r.x - this.me().x) < 700) void this.say(ph);
        break;
      }
      case 'who':
        if (this.wantList) {
          this.wantList = false;
          this.showList(e.list);
        }
        break;
      case 'friend': {
        void friends.refresh().catch(() => null);
        toast(this.scene, e.k === 'request' ? `「${e.from.name}」想和你做好友！点右上角“⭐ 好友”看看` : `「${e.from.name}」接受了你的好友申请 ⭐`, '#ffe14a');
        break;
      }
      case 'mail': {
        void mail.refresh().catch(() => null);
        toast(this.scene, `「${e.from.name}」送了你一份礼物！点右上角“📮 信箱”收下`, '#ffe14a');
        break;
      }
      case 'blocked':
        toast(this.scene, e.reason, '#ffd27a');
        this.stop();
        break;
    }
  }

  private updateCount() {
    this.count = this.players.size + 1;
    (this.countBtn?.getAt(1) as Phaser.GameObjects.Text | undefined)?.setText(`👥 在线 ${this.count}`);
  }

  // ---------------- 界面 ----------------

  private buildUI() {
    const s = this.scene;
    button(s, 1190, 118, 150, 40, '👋 打招呼', () => this.pickPhrase(), { size: 17, color: 0x2f7a4d }).setDepth(50);
    this.countBtn = button(s, 1190, 164, 150, 40, '👥 在线 1', () => {
      this.wantList = true;
      net.who();
    }, { size: 17, color: 0x3b62d9 }).setDepth(50);
    button(s, 1190, 210, 150, 40, '⭐ 好友', () => openFriends(s, { onClose: () => this.onFriends(), onGift: (f) => void openGiftPicker(s, f) }), { size: 17, color: 0x8a5a12 }).setDepth(50);
    button(s, 1190, 256, 150, 40, '📮 信箱', () => void openMailbox(s, 0, () => this.onMail()), { size: 17, color: 0x6d2bd9 }).setDepth(50);
    button(s, 1190, 302, 150, 40, '🛡 组队', () => openParty(s), { size: 17, color: 0xb8323f }).setDepth(50);
    this.partyBadge = text(s, 1252, 286, '0', 15, '#ffffff', { backgroundColor: '#e8505b', padding: { x: 6, y: 1 } }).setOrigin(0.5).setDepth(51).setVisible(false);
    this.mailBadge = text(s, 1252, 240, '0', 15, '#ffffff', { backgroundColor: '#e8505b', padding: { x: 6, y: 1 } }).setOrigin(0.5).setDepth(51).setVisible(false);
    this.friendBadge = text(s, 1252, 194, '0', 15, '#ffffff', { backgroundColor: '#e8505b', padding: { x: 6, y: 1 } }).setOrigin(0.5).setDepth(51).setVisible(false);
  }

  /** 组队：收到邀请弹提示 + 角标；队长点开始后进入组队战斗 */
  private hookParty() {
    const s = this.scene;
    let seen = party.invites.length;
    const badge = () => {
      const n = party.invites.length;
      this.partyBadge?.setText(String(n)).setVisible(n > 0);
      if (n > seen) toast(s, `📨 ${party.invites[n - 1].from.name} 邀请你组队！点右边的“🛡 组队”`, '#ffe14a');
      seen = n;
    };
    badge();
    this.unsubParty = party.subscribe(badge);
    party.onNote = (msg, bad) => toast(s, msg, bad ? '#ff9a9a' : '#ffd27a');
    party.onStart = (e) => {
      void game.ensureLessons([e.party.dungeon, ...game.playedLessons()]).then(() => {
        if (this.alive) this.scene.scene.start('PartyBattle', { start: e });
      });
    };
    if (party.pendingStart && party.view?.state === 'battle') party.onStart(party.pendingStart);
  }

  /** 点到别的小朋友时的小菜单 */
  private playerMenu(r: Remote) {
    const s = this.scene;
    const m = modal(s, 480, 330, r.p.name);
    m.c.add(text(s, m.x + m.w / 2, m.y + 85, `Lv.${r.p.lv} ${CLS[r.p.cls]}${r.p.title ? ` · ${r.p.title}` : ''}`, 20, COLORS.dim).setOrigin(0.5));
    const fv = friends.data?.friends.find((f) => f.id === r.p.id);
    if (fv) {
      m.c.add(text(s, m.x + m.w / 2, m.y + 150, '⭐ 你们已经是好友', 24, '#ffe14a').setOrigin(0.5));
      m.c.add(button(s, m.x + m.w / 2, m.y + 230, 280, 56, '🎁 送礼物', () => { m.close(); void openGiftPicker(s, fv); }, { size: 22, color: 0x8a5a12 }));
    }
    else if (friends.asked(r.p.id)) m.c.add(text(s, m.x + m.w / 2, m.y + 180, '已经发出申请，等对方同意', 20, COLORS.dim).setOrigin(0.5));
    else {
      m.c.add(button(s, m.x + m.w / 2, m.y + 180, 280, 56, '➕ 加为好友', async () => {
        try {
          const res = await friends.request({ id: r.p.id });
          m.close();
          toast(s, res.status === 'friends' ? '你们成为好友啦！⭐' : `已经发给「${r.p.name}」，等他同意吧`, '#7dffa5');
        } catch (e) {
          toast(s, (e as Error).message, '#ff9a9a');
        }
      }, { size: 22, color: 0x2f7a4d }));
    }
  }

  /** 头顶气泡：英文 + 中文 */
  private bubble(x: number, top: number, ph: Phrase) {
    const t = text(this.scene, 0, 0, `${ph.en}\n${ph.zh}`, 17, '#2b2a4a', { wordWrap: { width: 250 }, align: 'center', fontStyle: 'bold' }).setOrigin(0.5);
    const w = t.width + 24, h = t.height + 16;
    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, 0.96).fillRoundedRect(-w / 2, -h / 2, w, h, 10).lineStyle(2, 0x2b2a4a, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    g.fillStyle(0xffffff, 1).fillTriangle(-8, h / 2 - 1, 8, h / 2 - 1, 0, h / 2 + 12);
    const c = this.scene.add.container(x, top - h / 2 - 40, [g, t]).setScale(0.3);
    this.world.add(c);
    this.scene.tweens.add({ targets: c, scale: 1, duration: 180, ease: 'Back.out' });
    this.scene.tweens.add({ targets: c, alpha: 0, delay: 3500, duration: 300, onComplete: () => c.destroy() });
    return c;
  }

  /** 播放这句课文的原声；这一课还没下载就先下载（很小），没有原声时用语音合成 */
  private async say(ph: Phrase) {
    await game.ensureLessons([ph.audio.lesson]).catch(() => null);
    const clip = game.index.lesson(ph.audio.lesson)?.dialogue[ph.audio.line]?.audio;
    speak({ text: ph.en, clip });
  }

  private pickPhrase() {
    if (!this.phrases.length) return toast(this.scene, '短句还在加载，请稍等一下', '#ffd27a');
    const s = this.scene;
    const m = modal(s, 900, 640, '打个招呼（点一句发出去）');
    const col = (i: number) => m.x + 235 + (i % 2) * 430;
    this.phrases.forEach((p, i) => {
      const y = m.y + 92 + Math.floor(i / 2) * 36;
      const ok = phraseUnlocked(p);
      if (ok) {
        m.c.add(button(s, col(i), y, 412, 32, `${p.en}   ${p.zh}`, () => {
          m.close();
          net.say(p.id);
          this.myBubble?.destroy();
          const me = this.me();
          this.myBubble = this.bubble(me.x, this.ground - me.tall, p);
          void this.say(p);
        }, { size: 16, color: 0x2d3561 }));
      } else {
        const lesson = game.manifest.titles[p.unlock]?.lessons;
        m.c.add(button(s, col(i), y, 412, 32, `🔒 通关 L${lesson?.[0] ?? '?'}-${lesson?.[1] ?? '?'} 解锁`, () => undefined, { size: 15, color: 0x1b1f38 }).setAlpha(0.7));
      }
    });
    m.c.add(text(s, m.x + m.w / 2, m.y + m.h - 22, '只能发课文里学过的句子，别人也会听到原声哦', 15, COLORS.dim).setOrigin(0.5));
  }

  private showList(list: { id: string; name: string; lv: number; district: string | null }[]) {
    const names = Object.fromEntries(((this.scene.cache.json.get('town') as { districts: { id: string; name: string }[] })?.districts ?? []).map((d) => [d.id, d.name]));
    const m = modal(this.scene, 620, 120 + Math.max(1, list.length) * 46, `现在在线（${list.length} 人）`);
    list.forEach((u, i) => {
      const y = m.y + 90 + i * 46;
      m.c.add(text(this.scene, m.x + 40, y, `${u.name}`, 22, u.id === game.save?.id ? '#ffe14a' : '#ffffff', { fontStyle: 'bold' }).setOrigin(0, 0.5));
      m.c.add(text(this.scene, m.x + 250, y, `Lv.${u.lv}`, 19, COLORS.dim).setOrigin(0, 0.5));
      m.c.add(text(this.scene, m.x + m.w - 40, y, u.district ? `📍 ${names[u.district] ?? u.district}` : '在副本里', 19, '#9fe3ff').setOrigin(1, 0.5));
    });
    if (!list.length) m.c.add(text(this.scene, m.x + m.w / 2, m.y + 90, '只有你一个人在线', 20, COLORS.dim).setOrigin(0.5));
  }
}

export const classLabel = (c: keyof typeof CLS) => CLS[c];
