import { normalizeSkills } from './battle/skilldata';
import { setSpeechRate } from './audio/speech';
import type { LessonPair, Manifest } from './content/types';
import { saveProfile } from './save/db';
import { cloud } from './save/cloud';
import { fetchLesson } from './content/loader';
import { refreshDaily, type SaveData } from './save/schema';
import { ContentIndex } from './systems/questions';

/** 全局运行状态：当前角色存档 + 课程内容 */
class GameState {
  manifest!: Manifest;
  index!: ContentIndex;
  save: SaveData | null = null;
  private pending: Promise<void> = Promise.resolve();
  lastSaveError: string | null = null;
  /** 测试面板（?test）：测试角色不写入存档 */
  testMode = false;

  setContent(manifest: Manifest, lessons: LessonPair[]) {
    this.manifest = manifest;
    this.index = new ContentIndex(lessons);
  }

  /** 确保这些课已下载并加入索引（只下载缺的） */
  async ensureLessons(ids: string[]) {
    const missing = [...new Set(ids)].filter((id) => !this.index.lesson(id) && this.manifest.titles?.[id] !== undefined);
    const got = await Promise.all(missing.map(fetchLesson));
    for (const l of got) if (l) this.index.add(l);
  }

  /** 玩过的课（复习、图鉴、深渊要用） */
  playedLessons(s = this.s) {
    const ids = new Set(Object.keys(s.dungeons));
    for (const id of Object.keys(s.dayLog ?? {}).flatMap((d) => s.dayLog[d].lessons)) ids.add(id);
    return [...ids];
  }

  get s(): SaveData {
    if (!this.save) throw new Error('没有选择角色');
    return this.save;
  }

  use(save: SaveData) {
    this.save = save;
    // 只有测试角色不保存；切回真实角色时自动恢复保存
    this.testMode = save.id === '__test__';
    normalizeSkills(save);
    // 家长在后台给这个账号设了每天游戏时长，就以它为准
    if (cloud.user?.dailyMinutes) save.settings.dailyMinutes = cloud.user.dailyMinutes;
    setSpeechRate(save.settings.speechRate);
    if (refreshDaily(save)) void this.persist();
  }

  /** 串行写入，避免并发保存互相覆盖 */
  persist(): Promise<void> {
    if (!this.save || this.testMode) return Promise.resolve();
    const snapshot = this.save;
    this.pending = this.pending
      .then(() => saveProfile(snapshot))
      .then(() => cloud.noteSaved(snapshot))
      .then(() => {
        this.lastSaveError = null;
      })
      .catch((e) => {
        this.lastSaveError = String(e);
        console.error('存档失败', e);
      });
    return this.pending;
  }
}

export const game = new GameState();
