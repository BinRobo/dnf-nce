import Phaser from 'phaser';
import { game } from '../state';

/**
 * 音效与背景音乐。资源清单 public/assets/audio/manifest.json 在 Boot 里加载，键名即文件名。
 * 缺失的文件静默跳过，不影响游戏。
 */
const BASE = 'assets/audio/';
let sound: Phaser.Sound.BaseSoundManager | null = null;
let bgm: Phaser.Sound.BaseSound | null = null;
let bgmKey = '';
let ducked = false;
const BGM_VOL = 0.45;

export function queueAudio(scene: Phaser.Scene, manifest: { sfx: Record<string, string>; bgm: Record<string, string> }, only?: string[]) {
  for (const [k, f] of Object.entries(manifest.sfx)) if (!only || only.includes(k)) scene.load.audio(`sfx_${k}`, BASE + f);
  // 背景音乐不在启动时加载（共 25 首约 50MB），播放时按需加载
  bgmFiles = manifest.bgm;
}

let bgmFiles: Record<string, string> = {};
const loading = new Set<string>();

/** 某个场景 key（如 campus）是否有背景音乐 */
export const hasMusic = (key: string) => !!bgmFiles[key] || !!bgmFiles[`${key}_1`];

export function initSound(s: Phaser.Sound.BaseSoundManager) {
  sound = s;
  // 页面切到后台时不暂停（Phaser 默认会暂停）——保持默认即可
}

const on = (kind: 'music' | 'sfx') => game.save?.settings[kind] ?? true;

/** 播放音效；该 key 不存在时依次尝试 fallback（如新技能音效还没准备好时用通用音效） */
export function sfx(key: string, opts: { rate?: number; volume?: number; detune?: number } = {}, ...fallback: string[]) {
  if (!sound || !on('sfx')) return;
  const k = [key, ...fallback].map((x) => `sfx_${x}`).find((x) => sound!.game.cache.audio.exists(x));
  if (!k) return;
  sound.play(k, { volume: opts.volume ?? 0.7, rate: opts.rate ?? 1, detune: opts.detune ?? 0 });
}

export function music(key: string | null) {
  if (!sound) return;
  if (key === bgmKey && bgm?.isPlaying) return;
  bgm?.stop();
  bgm?.destroy();
  bgm = null;
  bgmKey = key ?? '';
  if (!key || !on('music')) return;
  // 每个场景有多首（town_1..3），随机选一首；也兼容单首的 key
  const variants = [1, 2, 3, 4, 5].map((n) => `${key}_${n}`).filter((k) => bgmFiles[k]);
  const name = variants.length ? variants[Math.floor(Math.random() * variants.length)] : key;
  if (!bgmFiles[name]) return;
  const k = `bgm_${name}`;
  const play = () => {
    if (bgmKey !== key || bgm || !sound) return;
    bgm = sound.add(k, { loop: true, volume: ducked ? BGM_VOL * 0.4 : BGM_VOL });
    bgm.play();
  };
  if (sound.game.cache.audio.exists(k)) return play();
  // 按需加载：直接 fetch + decodeAudioData，不借场景加载器。
  // 场景 create() 期间场景尚未激活、场景切换会中止加载，借加载器会让音乐静默丢失
  if (loading.has(k)) return;
  loading.add(k);
  const ctx = (sound as Phaser.Sound.WebAudioSoundManager).context;
  void (async () => {
    try {
      const buf = await (await fetch(BASE + bgmFiles[name])).arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      sound!.game.cache.audio.add(k, decoded);
      loading.delete(k);
      play();
    } catch {
      /* 网络或解码失败：保持安静 */
      loading.delete(k);
    }
  })();
}

/** 答题时把背景音乐压低（约 -8dB），不干扰听原声 */
export function duck(down: boolean) {
  ducked = down;
  if (bgm && 'setVolume' in bgm) (bgm as Phaser.Sound.WebAudioSound).setVolume(down ? BGM_VOL * 0.4 : BGM_VOL);
}

export function refreshMusic() {
  const k = bgmKey;
  bgmKey = '';
  music(on('music') ? k : null);
  bgmKey = k;
}
