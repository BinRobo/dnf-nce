import Phaser from 'phaser';
import { FX2, PARTICLES } from './battle/elements';
import { partKey, type Rig } from './gfx/puppet';
import { SVG_ICONS } from './gfx/icons';
import { weaponLook } from './gfx/icons';
import type { SaveData } from './save/schema';
import { classOf, heroRig } from './systems/classes';
import { equippedItems } from './systems/player';

/**
 * 按需加载：启动时只加载清单和界面必需的小东西，
 * 每个场景在 preload() 里用 need(this, {...}) 声明自己要用的图和音效，已加载的不会重复下载。
 * 场景运行中需要临时加载（如剧情里出现新角色）用 await loadNow(scene, {...})。
 */
const ART = 'assets/art/';
const CHARS = `${ART}chars/`;

export interface Need {
  /** 主角（按存档的职业、性别、装扮、武器） */
  heroes?: Pick<SaveData, 'cls' | 'gender' | 'wardrobe' | 'inventory' | 'equipped'>[];
  /** NPC / 角色骨骼 id（kid 要配合 heads） */
  chars?: string[];
  heads?: string[];
  /** 装扮套装 id */
  costumes?: string[];
  /** 手持武器外观 */
  weapons?: string[];
  mobs?: string[];
  bgs?: string[];
  /** SVG 图标 key（icons/<key>.svg）；'all' = 全部 */
  icons?: string[] | 'all';
  /** 技能特效素材（粒子 + 美术特效） */
  fx?: boolean;
  props?: string[];
  images?: Record<string, string>;
  pngs?: Record<string, string>;
  sfx?: string[] | 'battle';
}

const SFX_BATTLE = /^(hit_|swing|sk_|mob_|letter_|gun_|mage_|grenade|awaken|enemy_|launch|shield|player_|boss_|combo|perfect|nice|miss|crit|room_|chest|explain|wrong|right|correct|pop)/;

/** 把需要的资源排进加载队列（只排缺的），返回排了几个 */
export function queueNeed(scene: Phaser.Scene, n: Need): number {
  const L = scene.load;
  const tex = scene.textures;
  let count = 0;
  const svg = (key: string, url: string, cfg?: { width: number; height: number }) => {
    if (tex.exists(key) || queued.has(key)) return;
    queued.add(key);
    L.svg(key, url, cfg);
    count++;
  };
  const char = (id: string, heads: string[] = []) => {
    const rig = scene.cache.json.get(`rig_${id}`) as Rig | undefined;
    if (!rig) return;
    const files = new Set(rig.parts.map((p) => p.file));
    for (const f of Object.values(rig.faces ?? {})) files.add(f);
    for (const h of heads) files.add(`head_${h}.svg`);
    for (const f of files) svg(partKey(id, f), `${CHARS}${id}/${f}`);
  };
  const weapons = scene.cache.json.get('hero_weapons') as Record<string, { file: string }> | undefined;
  const weapon = (look: string) => {
    const w = weapons?.[look];
    if (w) svg(`hero_weapon_${look}`, `${CHARS}hero/weapons/${w.file}`);
  };
  const costume = (set: string) => {
    for (const f of ['hat', 'body', 'armL', 'armR', 'legL', 'legR']) svg(partKey('hero', `costume/${set}/${f}.svg`), `${CHARS}hero/costume/${set}/${f}.svg`);
  };

  for (const h of n.heroes ?? []) {
    char(heroRig(h.cls ?? 'sword', h.gender ?? 'm'));
    const worn = h.wardrobe?.worn ?? {};
    for (const set of new Set(Object.values(worn))) if (set) costume(set);
    const wpn = equippedItems(h as SaveData).find((i) => i.slot === 'weapon');
    weapon(weaponLook(wpn) ?? classOf(h).defaultLook);
  }
  for (const c of n.chars ?? []) char(c, c === 'kid' ? n.heads ?? [] : []);
  for (const c of n.costumes ?? []) costume(c);
  for (const w of n.weapons ?? []) weapon(w);
  for (const m of n.mobs ?? []) svg(`mob_${m}`, `${ART}mobs/${m}.svg`);
  for (const b of n.bgs ?? []) for (const layer of ['far', 'mid', 'ground']) svg(`bg_${b}_${layer}`, `${ART}bg/${b}_${layer}.svg`);
  for (const p of n.props ?? []) svg(`prop_${p}`, `${ART}props/${p}.svg`);
  for (const [k, url] of Object.entries(n.images ?? {})) svg(k, url);
  for (const [k, url] of Object.entries(n.pngs ?? {})) {
    if (tex.exists(k) || queued.has(k)) continue;
    queued.add(k);
    L.image(k, url);
    count++;
  }
  const icons = n.icons === 'all' ? SVG_ICONS : n.icons ?? [];
  for (const k of icons) {
    // SVG 图标优先于程序画的同名图标：先删掉程序图标
    const key = `icon_${k}`;
    if (tex.exists(key) && !svgIcons.has(k)) tex.remove(key);
    if (!svgIcons.has(k)) {
      svgIcons.add(k);
      svg(key, `${ART}icons/${k}.svg`, { width: 64, height: 64 });
    }
  }
  if (n.fx) {
    for (const p of PARTICLES) {
      const key = `p_${p}`;
      if (!tex.exists(key) && !queued.has(key)) {
        queued.add(key);
        L.image(key, `assets/fx/particles/${p}.png`);
        count++;
      }
    }
    for (const f of FX2) svg(`fx2_${f}`, `assets/fx/${f}.svg`);
  }
  const am = scene.cache.json.get('audio_manifest') as { sfx: Record<string, string> } | undefined;
  if (am && n.sfx) {
    const keys = n.sfx === 'battle' ? Object.keys(am.sfx).filter((k) => SFX_BATTLE.test(k)) : n.sfx;
    for (const k of keys) {
      const key = `sfx_${k}`;
      if (!am.sfx[k] || scene.cache.audio.exists(key) || queued.has(key)) continue;
      queued.add(key);
      L.audio(key, `assets/audio/${am.sfx[k]}`);
      count++;
    }
  }
  L.once('complete', () => queued.clear());
  return count;
}

const queued = new Set<string>();
const svgIcons = new Set<string>();

/** 启动时只加载的“界面音效”（其余战斗音效进战斗时再加载） */
export function uiSfxKeys(manifest: { sfx: Record<string, string> }) {
  return Object.keys(manifest.sfx).filter((k) => !SFX_BATTLE.test(k));
}

/** 在 preload() 里调用：排队 + 显示一条细进度条 */
export function need(scene: Phaser.Scene, n: Need) {
  if (queueNeed(scene, n) > 0) loadingBar(scene);
}

/** 场景运行中临时加载，加载完 resolve */
export function loadNow(scene: Phaser.Scene, n: Need): Promise<void> {
  if (queueNeed(scene, n) === 0) return Promise.resolve();
  return new Promise((res) => {
    scene.load.once('complete', () => res());
    if (!scene.load.isLoading()) scene.load.start();
  });
}

function loadingBar(scene: Phaser.Scene) {
  const { width, height } = scene.scale;
  const bg = scene.add.rectangle(width / 2, height / 2, 420, 10, 0x2a2f52).setDepth(9999);
  const bar = scene.add.rectangle(width / 2 - 210, height / 2, 0, 10, 0x7fd0ff).setOrigin(0, 0.5).setDepth(9999);
  const t = scene.add.text(width / 2, height / 2 - 28, '加载中…', { fontFamily: 'sans-serif', fontSize: '20px', color: '#dfe4ff' }).setOrigin(0.5).setDepth(9999);
  scene.load.on('progress', (p: number) => (bar.width = 420 * p));
  scene.load.once('complete', () => { bg.destroy(); bar.destroy(); t.destroy(); });
}
