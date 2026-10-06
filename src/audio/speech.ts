import { CONTENT_BASE } from '../content/loader';
import type { Speakable } from '../systems/questions';

/**
 * 播放英语：有课文原声片段就播原声（从课文视频里截取），否则用浏览器语音合成（英音优先）。
 * 每个媒体文件只创建一个 <audio>，切换句子时只跳转时间，避免重复下载。
 */
const players = new Map<string, HTMLAudioElement>();
const missing = new Set<string>();
let current: HTMLAudioElement | null = null;
let stopTimer: number | undefined;
let rate = 0.85;

export function setSpeechRate(r: number) {
  rate = r;
}

function pickVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  return voices.find((v) => v.lang === 'en-GB') ?? voices.find((v) => v.lang === 'en-US') ?? voices[0];
}

function tts(text: string) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\.\.\./g, ''));
  u.lang = 'en-GB';
  u.rate = rate;
  const v = pickVoice();
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

function player(file: string) {
  let a = players.get(file);
  if (!a) {
    a = new Audio(CONTENT_BASE + file);
    a.preload = 'auto';
    players.set(file, a);
  }
  return a;
}

/** fraction < 1：只播前一部分（Boss“说糊”机制） */
export function speak(s: Speakable | undefined, fraction = 1) {
  if (!s) return;
  stop();
  const clip = s.clip;
  if (!clip || missing.has(clip.file)) return tts(fraction < 1 ? s.text.split(' ').slice(0, Math.max(1, Math.round(s.text.split(' ').length * fraction))).join(' ') : s.text);
  const a = player(clip.file);
  current = a;
  const fail = () => {
    missing.add(clip.file);
    if (current === a) tts(s.text);
  };
  const go = () => {
    if (current !== a) return;
    a.currentTime = clip.start ?? 0;
    a.play().catch(fail);
    if (clip.end !== undefined) {
      const ms = (clip.end - (clip.start ?? 0)) * 1000 * fraction + (fraction < 1 ? 0 : 100);
      stopTimer = window.setTimeout(() => current === a && a.pause(), ms);
    }
  };
  a.onerror = fail;
  if (a.readyState >= 1) go();
  else a.addEventListener('loadedmetadata', go, { once: true });
}

export function stop() {
  stopVoice();
  clearTimeout(stopTimer);
  current?.pause();
  current = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// ---------------- 中文配音（NPC 闲聊、剧情对白） ----------------
let voiceIndex: Record<string, string> = {};
let voiceAudio: HTMLAudioElement | null = null;

export async function loadVoiceIndex() {
  try {
    const r = await fetch('content/voice/index.json');
    if (r.ok) voiceIndex = await r.json();
  } catch {
    /* 没有配音时静默 */
  }
}

/** 播放某角色某句中文台词的配音；返回是否有配音 */
export function voice(who: string, zh: string, volume = 1): boolean {
  const f = voiceIndex[`${who}|${zh}`];
  stopVoice();
  if (!f) return false;
  voiceAudio = new Audio(`content/${f}`);
  voiceAudio.volume = volume;
  voiceAudio.play().catch(() => {});
  return true;
}

export function stopVoice() {
  voiceAudio?.pause();
  voiceAudio = null;
}
