/**
 * 简化版 SM-2 间隔重复。每个单词/句子是一张卡片，
 * 答对间隔变长，答错回到 10 分钟后复习。
 */
export interface SrsCard {
  ease: number;
  interval: number; // 天
  reps: number;
  lapses: number;
  due: number; // 时间戳 ms
  seen: number;
  correct: number;
}

const DAY = 24 * 3600 * 1000;

/** grade: 5 秒答且对, 4 对但犹豫, 1 错 */
export function review(card: SrsCard | undefined, grade: 1 | 4 | 5, now = Date.now()): SrsCard {
  const c: SrsCard = card
    ? { ...card }
    : { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now, seen: 0, correct: 0 };
  c.seen++;
  if (grade < 3) {
    c.reps = 0;
    c.lapses++;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 10 * 60 * 1000;
    return c;
  }
  c.correct++;
  c.reps++;
  c.interval = c.reps === 1 ? 1 : c.reps === 2 ? 3 : Math.round(c.interval * c.ease);
  c.ease = Math.max(1.3, c.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  c.due = now + c.interval * DAY;
  return c;
}

export function isDue(card: SrsCard | undefined, now = Date.now()) {
  return !!card && card.due <= now;
}

/** 0~1 的掌握度，用于界面显示 */
export function mastery(card: SrsCard | undefined) {
  if (!card) return 0;
  return Math.min(1, card.reps / 4);
}
