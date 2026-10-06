import Phaser from 'phaser';
import { sfx } from '../audio/sound';
import { game } from '../state';
import { Elements, ELEMENT_COLOR } from './elements';
import { wait, type Fx } from './fx';
import type { FxStep, SkillDef } from './skilldata';

/**
 * 数据驱动的技能演出（神枪手、魔法师全部技能，剑士的元素技能）。
 * 步骤定义见 docs/slice/ROUND4B.md I 节；每个“命中步骤”调用 onHit，最后一次 last = true。
 */
type Pt = { x: number; y: number };
type Hit = () => void;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NOTE_COLORS = ['#ff6bc8', '#5aa9ff', '#7dffa5', '#ffd34a'];

const PROJ_SFX: Record<string, string> = {
  bullet: 'gun_shot', letter: 'gun_shot', laser: 'gun_laser', rocket: 'gun_cannon', grenade: 'gun_cannon', arrow: 'swing1',
  fireball: 'mage_fire', iceball: 'mage_ice', thunderball: 'mage_thunder', lightorb: 'mage_light', star: 'mage_bolt', note: 'mage_bolt',
};

/** 每个命中步骤算几段 */
function hitsOf(st: FxStep, rank: number) {
  const n = (st.n ?? 1) + (st.perRank ?? 0) * (rank - 1);
  switch (st.do) {
    case 'shoot': case 'rain': case 'lightning': case 'pillar': case 'ray': case 'slash': case 'spikes': return n;
    case 'beam': return 3;
    case 'explode': case 'shatter': case 'cross': case 'dragon': case 'phoenix': return 1;
    default: return 0;
  }
}

/** 一发飞行物：返回到达时 resolve */
function fly(scene: Phaser.Scene, el: Elements, proj: string, from: Pt, to: Pt, ms: number, arc = 0): Promise<void> {
  let obj: Phaser.GameObjects.GameObject & { x: number; y: number; setDepth(d: number): unknown; destroy(): void };
  let trail: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
  const tex = (k: string) => (scene.textures.exists(k) ? k : 'fx_dot');
  const mkTrail = (key: string, tint: number | number[], scale = 0.3, life = 260) => {
    trail = scene.add.particles(0, 0, tex(key), { follow: obj, speed: { min: 5, max: 30 }, lifespan: life, scale: { start: scale, end: 0 }, tint, frequency: 18, blendMode: 'ADD' }).setDepth(57);
  };
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  switch (proj) {
    case 'letter':
      obj = scene.add.text(from.x, from.y, LETTERS[Math.floor(Math.random() * 26)], { fontFamily: 'Arial Black, Arial', fontSize: '30px', fontStyle: 'bold', color: '#ffe14a', stroke: '#7a3b00', strokeThickness: 6 }).setOrigin(0.5);
      mkTrail('p_trace_1', 0xffe14a, 0.25);
      break;
    case 'note':
      obj = scene.add.text(from.x, from.y, Math.random() < 0.5 ? '♪' : '♫', { fontFamily: 'Arial', fontSize: '38px', fontStyle: 'bold', color: NOTE_COLORS[Math.floor(Math.random() * 4)], stroke: '#2b2a4a', strokeThickness: 5 }).setOrigin(0.5);
      mkTrail('p_star_1', 0xffffff, 0.15);
      break;
    case 'bullet':
      obj = scene.add.image(from.x, from.y, 'fx_dot').setTint(0xfff1a8).setScale(2.4, 0.7).setRotation(ang).setBlendMode('ADD');
      mkTrail('p_trace_2', 0xffd34a, 0.2, 160);
      break;
    case 'arrow':
      obj = scene.add.rectangle(from.x, from.y, 46, 5, 0xffe9a0).setRotation(ang);
      break;
    case 'laser': {
      const r = scene.add.rectangle(from.x, from.y, 10, 8, 0xff6bc8).setOrigin(0, 0.5).setRotation(ang).setBlendMode('ADD').setDepth(58);
      const len = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
      scene.tweens.add({ targets: r, width: len, duration: ms * 0.5 });
      scene.tweens.add({ targets: r, alpha: 0, delay: ms * 0.6, duration: 150, onComplete: () => r.destroy() });
      return wait(scene, ms * 0.5);
    }
    case 'fireball':
      obj = scene.add.image(from.x, from.y, tex('p_fire_1')).setTint(0xff7a2e).setScale(0.35).setBlendMode('ADD');
      mkTrail('p_flame_1', [0xff7a2e, 0xffd34a], 0.35, 320);
      break;
    case 'iceball':
      obj = scene.add.image(from.x, from.y, tex('fx2_ice_shard')).setScale(1.2);
      mkTrail('p_star_2', 0xd9f6ff, 0.18);
      break;
    case 'thunderball':
      obj = scene.add.image(from.x, from.y, tex('p_spark_1')).setTint(0xc9b8ff).setScale(0.35).setBlendMode('ADD');
      mkTrail('p_spark_2', 0xc9b8ff, 0.2);
      break;
    case 'lightorb':
      obj = scene.add.image(from.x, from.y, tex('p_light_1')).setTint(0xfff1a8).setScale(0.4).setBlendMode('ADD');
      mkTrail('p_light_2', 0xfff1a8, 0.2);
      break;
    case 'star':
      obj = scene.add.image(from.x, from.y, tex('p_star_1')).setTint(0xffd34a).setScale(0.4).setBlendMode('ADD');
      mkTrail('p_star_2', 0xffd34a, 0.15);
      break;
    case 'rocket':
    case 'grenade':
    default:
      obj = scene.add.ellipse(from.x, from.y, proj === 'rocket' ? 34 : 18, proj === 'rocket' ? 14 : 18, proj === 'rocket' ? 0xd94a3a : 0x4a5a3a).setStrokeStyle(3, 0x2b2a4a).setRotation(ang);
      mkTrail('p_smoke_1', 0xcfcfcf, 0.25, 420);
      if (proj === 'grenade') arc = Math.max(arc, 160);
  }
  obj.setDepth(58);
  return new Promise((res) => {
    const t = { p: 0 };
    scene.tweens.add({
      targets: t, p: 1, duration: ms, ease: arc ? 'Linear' : 'Quad.in',
      onUpdate: () => {
        obj.x = from.x + (to.x - from.x) * t.p;
        obj.y = from.y + (to.y - from.y) * t.p - Math.sin(t.p * Math.PI) * arc;
        if ('angle' in obj && (proj === 'star' || proj === 'thunderball' || proj === 'grenade')) (obj as unknown as { angle: number }).angle += 18;
      },
      onComplete: () => {
        obj.destroy();
        trail?.stop();
        scene.time.delayedCall(400, () => trail?.destroy());
        if (proj === 'rocket' || proj === 'grenade') el.fireBurst(to.x, to.y, 0.6);
        else if (proj === 'fireball') el.burst(to.x, to.y, 'fire_1', { n: 10, color: [0xff7a2e, 0xffd34a], scale: [0.4, 0], life: 400 });
        else if (proj === 'iceball') el.shards(to.x, to.y, 5);
        else if (proj === 'thunderball') el.burst(to.x, to.y, 'spark_1', { n: 10, color: 0xc9b8ff, scale: [0.35, 0], life: 350 });
        else el.burst(to.x, to.y, 'star_2', { n: 6, color: 0xffffff, scale: [0.25, 0], life: 300 });
        res();
      },
    });
  });
}

export async function runRecipe(
  scene: Phaser.Scene, fx: Fx, def: SkillDef, rank: number,
  from: Pt, to: Pt, target: Phaser.GameObjects.Image | undefined, onHit: (i: number, last: boolean) => void,
) {
  const el = new Elements(scene, game.s?.settings.reduceFx);
  const steps = def.fx ?? [];
  const total = steps.reduce((n, st) => n + hitsOf(st, rank), 0);
  let count = 0;
  const hit: Hit = () => {
    onHit(count, count === total - 1);
    count++;
  };
  const ground = from.y;
  const muzzle = { x: from.x + 70, y: ground - 120 };
  const k = 1 + (rank - 1) * 0.15;
  let unfreeze: (() => Promise<void>) | undefined;
  for (const st of steps) {
    const n = (st.n ?? 1) + (st.perRank ?? 0) * (rank - 1);
    const gap = st.gap ?? 80;
    switch (st.do) {
      case 'charge': {
        sfx('mage_cast', { volume: 0.5 }, 'swing2');
        await el.charge(muzzle.x, muzzle.y, st.color ? parseInt(st.color.slice(1), 16) : def.color);
        break;
      }
      case 'tint': {
        const e = (st.element ?? 'light') as keyof typeof ELEMENT_COLOR;
        if (e === 'thunder') { el.tint(0x000010, 0.45, 500); }
        else el.tint(ELEMENT_COLOR[e], 0.22, 700);
        if (e === 'ice') el.frostVignette(700);
        break;
      }
      case 'zoom': fx.zoom(1.08, 500); break;
      case 'shake': fx.shake(st.px ?? 8, 220); break;
      case 'wait': await wait(scene, st.ms ?? 250); break;
      case 'freeze': unfreeze = el.freeze(target, to.x, to.y + 80); await wait(scene, 280); break;
      case 'shoot': {
        const arrivals: Promise<void>[] = [];
        for (let i = 0; i < n; i++) {
          const spread = st.spread ?? 50;
          const dest = { x: to.x + (Math.random() - 0.5) * 30, y: to.y + (Math.random() - 0.5) * spread };
          sfx(PROJ_SFX[st.proj ?? 'bullet'] ?? 'gun_shot', { volume: 0.45, detune: (Math.random() - 0.5) * 300 }, 'swing1');
          el.burst(muzzle.x, muzzle.y, 'spark_2', { n: 4, color: 0xffe9a0, scale: [0.2, 0], life: 120, speed: [20, 60] });
          arrivals.push(fly(scene, el, st.proj ?? 'bullet', muzzle, dest, st.proj === 'laser' ? 160 : 260).then(hit));
          await wait(scene, gap);
        }
        await Promise.all(arrivals);
        break;
      }
      case 'rain': {
        const arrivals: Promise<void>[] = [];
        for (let i = 0; i < n; i++) {
          const dx = (Math.random() - 0.5) * 220;
          sfx(PROJ_SFX[st.proj ?? 'star'] ?? 'mage_bolt', { volume: 0.35, detune: i * 60 }, 'swing1');
          arrivals.push(fly(scene, el, st.proj ?? 'star', { x: to.x + dx - 120, y: -40 }, { x: to.x + dx * 0.3, y: to.y + (Math.random() - 0.5) * 60 }, 320).then(hit));
          await wait(scene, gap * 0.7);
        }
        await Promise.all(arrivals);
        break;
      }
      case 'explode': {
        const kind = st.kind ?? 'phys';
        const sc = (st.scale ?? 1.2) * k;
        if (kind === 'fire') { el.fireBurst(to.x, to.y, sc); el.scorch(to.x, ground, sc); sfx('sk_fire_hit', { volume: 0.7 }, 'hit_heavy'); }
        else if (kind === 'ice') { el.shards(to.x, to.y, 18); el.frostVignette(500); sfx('sk_frost_hit', { volume: 0.7 }, 'hit_heavy'); }
        else if (kind === 'thunder') { el.lightning(to.x + 40, -20, to.x, to.y, 0xc9b8ff, 9, 4); el.shock(target); sfx('sk_thunder_hit', { volume: 0.7 }, 'hit_heavy'); }
        else if (kind === 'light') { el.holyCross(to.x, to.y, sc); el.dust(to.x, to.y); sfx('mage_light', { volume: 0.7 }, 'hit_heavy'); }
        else { el.burst(to.x, to.y, 'circle_1', { n: 1, color: def.color, scale: [0.4 * sc, 1.6 * sc], speed: [0, 0], life: 350 }); el.burst(to.x, to.y, 'spark_1', { n: 18, color: [def.color, 0xffffff], scale: [0.35, 0], life: 450 }); sfx('hit_heavy', { volume: 0.8 }); }
        fx.shake(6, 160);
        hit();
        await wait(scene, 150);
        break;
      }
      case 'lightning':
        for (let i = 0; i < n; i++) {
          const dx = (i - (n - 1) / 2) * 40;
          el.lightning(to.x + dx + 60, -20, to.x + dx * 0.5, to.y + 20, 0xc9b8ff, 7, 3);
          sfx('mage_thunder', { volume: 0.5, detune: i * 90 }, 'hit_heavy');
          if (i === 0) el.shock(target, 300 + n * 90);
          hit();
          await wait(scene, gap);
        }
        break;
      case 'shatter':
        await unfreeze?.();
        unfreeze = undefined;
        fx.flashScreen(0xd9f6ff);
        sfx('sk_frost_hit', { volume: 0.8 }, 'hit_crit');
        hit();
        await wait(scene, 120);
        break;
      case 'spikes': {
        const sp = el.iceSpikes(to.x, ground, n + 1, 220 * k, k);
        sfx('mage_ice', { volume: 0.6 }, 'shield');
        for (let i = 0; i < n; i++) { hit(); await wait(scene, 60); }
        await wait(scene, 250);
        for (const s of sp) scene.tweens.add({ targets: s, alpha: 0, scaleY: 0.2, duration: 260, onComplete: () => s.destroy() });
        el.shards(to.x, ground - 60, 8);
        break;
      }
      case 'pillar':
        for (let i = 0; i < n; i++) {
          el.pillar(to.x + (i - (n - 1) / 2) * 60, ground, k);
          sfx('mage_fire', { volume: 0.45, detune: i * 70 }, 'launch');
          hit();
          await wait(scene, gap + 40);
        }
        el.scorch(to.x, ground, 1.2);
        break;
      case 'ray':
        for (let i = 0; i < n; i++) {
          el.lightRay(to.x + (i - (n - 1) / 2) * 50, 0.8 * k);
          sfx('mage_light', { volume: 0.4, detune: i * 100 }, 'hit_light');
          hit();
          await wait(scene, gap + 30);
        }
        el.dust(to.x, to.y);
        break;
      case 'cross':
        el.lightRay(to.x, 1.2 * k);
        await wait(scene, 120);
        el.holyCross(to.x, to.y, 1.3 * k);
        sfx('mage_light', { volume: 0.8 }, 'hit_crit');
        fx.flashScreen(0xfff6c8);
        hit();
        await wait(scene, 200);
        break;
      case 'dragon':
        await el.dragon(from.x, to.y, to.x, k);
        el.fireBurst(to.x, to.y, 1.4 * k);
        el.scorch(to.x, ground, 1.4);
        fx.shake(10, 260);
        sfx('sk_fire_hit', { volume: 0.9 }, 'hit_crit');
        hit();
        break;
      case 'phoenix':
        await el.phoenix(to.x, to.y, k);
        el.fireBurst(to.x, to.y, 1.6 * k);
        el.embers(to.x, to.y, 30);
        fx.shake(10, 260);
        sfx('sk_fire_hit', { volume: 0.9 }, 'hit_crit');
        hit();
        break;
      case 'slash':
        for (let i = 0; i < n; i++) {
          const ang = -60 + Math.random() * 120;
          const s = scene.add.image(to.x, to.y, 'fx_dot').setTint(def.color).setBlendMode('ADD').setScale(14 * k, 0.5).setAngle(ang).setDepth(58);
          scene.tweens.add({ targets: s, scaleY: 0.05, alpha: 0, duration: 200, onComplete: () => s.destroy() });
          sfx(`swing${(i % 3) + 1}`, { volume: 0.45 });
          hit();
          await wait(scene, gap * 0.8);
        }
        break;
      case 'beam': {
        const color = st.color ? parseInt(st.color.slice(1), 16) : def.color;
        sfx('gun_laser', { volume: 0.8, detune: -300 }, 'swing2');
        const b = scene.add.rectangle(muzzle.x, muzzle.y, 10, 60 * k, color).setOrigin(0, 0.5).setBlendMode('ADD').setDepth(58);
        const core = scene.add.rectangle(muzzle.x, muzzle.y, 10, 18 * k, 0xffffff).setOrigin(0, 0.5).setBlendMode('ADD').setDepth(59);
        scene.tweens.add({ targets: [b, core], width: 1400, duration: 120 });
        for (let i = 0; i < 3; i++) {
          await wait(scene, 110);
          el.burst(to.x, to.y, 'spark_1', { n: 10, color: [color, 0xffffff], scale: [0.3, 0], life: 300 });
          hit();
        }
        scene.tweens.add({ targets: [b, core], scaleY: 0, alpha: 0, duration: 200, onComplete: () => { b.destroy(); core.destroy(); } });
        break;
      }
    }
  }
  // 冻住没击碎的，收尾时化掉
  if (unfreeze) await unfreeze();
}
