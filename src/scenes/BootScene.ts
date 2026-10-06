import Phaser from 'phaser';
import { initSound, queueAudio } from '../audio/sound';
import { loadVoiceIndex } from '../audio/speech';
import { loadManifest } from '../content/loader';
import { uiSfxKeys } from '../assets';
import { makeIconTextures } from '../gfx/icons';
import { registerClassSkills } from '../battle/skilldata';
import { registerChapters } from '../battle/plan';
import { makeTestSave } from './TestScene';
import { queueRigs } from '../gfx/puppet';
import { makeTextures } from '../gfx/textures';
import { makeFxTextures } from '../battle/fx';
import { requestPersistence } from '../save/db';
import { game } from '../state';
import { text } from '../ui/widgets';

export const MOBS = ['bat', 'slime', 'goblin', 'golem', 'imp', 'fog', 'echo', 'boss_pardon', 'boss_whomist', 'duke', 'parrot', 'bookworm', 'pencil'];
export const BGS = ['town', 'street', 'classroom', 'boss', 'plaza', 'training', 'gate', 'shop',
  'valley_a', 'valley_b', 'king_a', 'king_b', 'station_a', 'station_b', 'snow_a', 'snow_b', 'theatre_a', 'theatre_b'];

/** 两段加载：先读清单（rig.json、音频清单），再按清单加载 SVG 与音频 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    queueRigs(this);
    this.load.json('audio_manifest', 'assets/audio/manifest.json');
    this.load.json('town', 'content/npc/town.json');
    this.load.json('skills_gunner', 'content/skills/gunner.json');
    this.load.json('skills_mage', 'content/skills/mage.json');
    this.load.json('chapters', 'content/chapters.json');
    this.load.on('loaderror', (f: Phaser.Loader.File) => console.warn('资源缺失，将使用占位：', f.key));
  }

  create() {
    document.getElementById('boot-msg')?.remove();
    const { width, height } = this.scale;
    const msg = text(this, width / 2, height / 2 - 30, '英语地下城 加载中…', 28).setOrigin(0.5);
    const barBg = this.add.rectangle(width / 2, height / 2 + 20, 500, 16, 0x2a2f52).setOrigin(0.5);
    const bar = this.add.rectangle(width / 2 - 250, height / 2 + 20, 0, 16, 0x7fd0ff).setOrigin(0, 0.5);
    for (const c of ['gunner', 'mage'] as const) {
      const list = this.cache.json.get(`skills_${c}`);
      if (Array.isArray(list)) registerClassSkills(c, list);
    }
    const chapters = this.cache.json.get('chapters');
    if (chapters) {
      registerChapters(chapters);
      MOBS.push(...Object.keys(chapters.mobs), ...Object.keys(chapters.bosses).filter((k) => !MOBS.includes(k)));
    }
    makeTextures(this);
    makeIconTextures(this);
    makeFxTextures(this);

    // 启动只加载界面音效；角色、背景、怪物、特效、战斗音效都在各场景里按需加载（见 src/assets.ts）
    const am = this.cache.json.get('audio_manifest');
    if (am) queueAudio(this, am, uiSfxKeys(am));
    this.load.on('progress', (p: number) => (bar.width = 500 * p));
    this.load.once('complete', async () => {
      initSound(this.sound);
      barBg.destroy();
      bar.destroy();
      try {
        game.setContent(await loadManifest(), []);
        await loadVoiceIndex();
        void requestPersistence();
        if (new URLSearchParams(location.search).has('test')) {
          game.use(makeTestSave());
          this.scene.start('Test');
        } else this.scene.start('Profile');
      } catch (e) {
        msg.setText(`内容加载失败：${(e as Error).message}`);
      }
    });
    this.load.start();
  }
}

/** 怪物贴图：新 SVG（mob_xxx）优先，缺失时退回旧的程序绘制贴图 */
export function mobTex(scene: Phaser.Scene, kind: string) {
  if (scene.textures.exists(`mob_${kind}`)) return `mob_${kind}`;
  if (scene.textures.exists(kind)) return kind;
  return kind.startsWith('boss') ? 'boss' : 'slime';
}

/** 三层视差背景（far 不动、mid 轻微、ground 跟随），缺图时退回渐变背景 */
export function layeredBg(scene: Phaser.Scene, name: string) {
  const keys = ['far', 'mid', 'ground'].map((l) => `bg_${name}_${l}`);
  if (!scene.textures.exists(keys[0])) return null;
  return keys.filter((k) => scene.textures.exists(k)).map((k, i) => scene.add.image(0, 0, k).setOrigin(0).setDepth(-30 + i));
}
