import type { AnswerLog, Question } from '../systems/questions';
import type { ContentIndex } from '../systems/questions';
import { altQuestion, qtype, type BattlePlan, type Enemy, type QType, type Room } from './plan';

/**
 * 战斗状态机（纯逻辑，不依赖 Phaser，可单测）。
 * 题量由副本决定：每个敌人携带的题全部答对才倒下；数值只影响容错、演出和评分。
 */

export type Grade = 'miss' | 'hit' | 'nice' | 'perfect';

export interface PlayerKit {
  atk: number;
  crit: number; // 0~1
  critMult: number;
  hearts: number;
  shield: number; // 每个房间回满
  hints: number; // 每局
  /** 3–4 年级模式：流畅时间 ×1.5 */
  youngMode: boolean;
}

export interface AnswerInput {
  correct: boolean;
  /** 第一次就答对、没有失误、没用提示 */
  clean: boolean;
  ms: number;
  hintUsed?: boolean;
}

export interface Outcome {
  grade: Grade;
  /** 每一段命中的伤害（演出用）；答错为空 */
  segments: number[];
  crit: boolean;
  enemy: Enemy;
  enemyDefeated: boolean;
  /** 本题之后敌人出手：none / blocked（漂亮档自动格挡）/ shield / heart */
  enemyAttack: 'none' | 'blocked' | 'shield' | 'heart';
  rescued: boolean;
  runOver: boolean;
  roomCleared: boolean;
  /** 觉醒槽刚满 */
  gaugeFull: boolean;
  /** 本题是觉醒技 */
  awaken: boolean;
  /** Boss 阶段变化（1→2、2→3） */
  bossPhase?: number;
  combo: number;
}

const FLUENT_MS: Record<QType, (q: Question) => number> = {
  listen: () => 6000,
  meaning: () => 6000,
  fill: () => 10000,
  spell: (q) => (q.kind === 'spell' ? q.word.length * 1500 + 3000 : 8000),
  order: (q) => (q.kind === 'order' ? q.answer.length * 2000 + 4000 : 10000),
};

export function fluentMs(q: Question, young: boolean) {
  return FLUENT_MS[qtype(q)](q) * (young ? 1.5 : 1);
}

const SEGMENTS: Record<Exclude<Grade, 'miss'>, number> = { hit: 2, nice: 4, perfect: 5 };
const GAUGE_GAIN: Record<Exclude<Grade, 'miss'>, number> = { hit: 12, nice: 20, perfect: 28 };

export class BattleController {
  readonly logs = new Map<string, AnswerLog>();
  roomIdx = 0;
  visited = new Set<string>();
  queue: Enemy[] = [];
  hearts: number;
  shield: number;
  hintsLeft: number;
  rescueLeft = 1;
  combo = 0;
  bestCombo = 0;
  gauge = 0;
  awakenReady = false;
  answersInRoom = 0;
  totalHits = 0;
  /** 当前题是否已经答错过（同一道题再答对不算 clean） */
  private bossTotal = 0;
  private bossPhase = 1;
  private currentStart = 0;

  constructor(
    readonly plan: BattlePlan,
    readonly kit: PlayerKit,
    private readonly idx: ContentIndex,
    private readonly rnd: () => number = Math.random,
  ) {
    this.hearts = kit.hearts;
    this.shield = kit.shield;
    this.hintsLeft = kit.hints;
  }

  get room(): Room {
    return this.plan.rooms[this.roomIdx];
  }

  get maxHearts() {
    return this.kit.hearts;
  }

  /** 进入房间（按 id）；返回该房间 */
  enter(roomId: string): Room {
    const i = this.plan.rooms.findIndex((r) => r.id === roomId);
    if (i < 0) throw new Error(`no room ${roomId}`);
    this.roomIdx = i;
    this.visited.add(roomId);
    this.queue = this.room.enemies.map((e) => ({ ...e, questions: [...e.questions] }));
    this.shield = this.kit.shield;
    this.answersInRoom = 0;
    const boss = this.queue.find((e) => e.tier === 'boss');
    this.bossTotal = boss?.questions.length ?? 0;
    this.bossPhase = 1;
    return this.room;
  }

  /** 当前要答的敌人与题目 */
  get current(): { enemy: Enemy; question: Question } | null {
    const enemy = this.queue[0];
    if (!enemy || !enemy.questions.length) return null;
    return { enemy, question: enemy.questions[0] };
  }

  /** 开始计时（题目出现时调用） */
  markShown(now: number) {
    this.currentStart = now;
  }

  get bossProgress() {
    const boss = this.queue.find((e) => e.tier === 'boss');
    if (!boss || !this.bossTotal) return null;
    return { left: boss.questions.length, total: this.bossTotal, phase: this.bossPhase };
  }

  useHint(): boolean {
    if (this.hintsLeft <= 0) return false;
    this.hintsLeft--;
    return true;
  }

  answer(input: AnswerInput): Outcome {
    const cur = this.current;
    if (!cur) throw new Error('no question');
    const { enemy, question } = cur;
    const clean = input.correct && input.clean && !input.hintUsed;
    if (!this.logs.has(question.itemId)) {
      this.logs.set(question.itemId, { itemId: question.itemId, firstTry: clean, ms: input.ms });
    }

    const base: Omit<Outcome, 'grade'> = {
      segments: [], crit: false, enemy, enemyDefeated: false, enemyAttack: 'none', rescued: false,
      runOver: false, roomCleared: false, gaugeFull: false, awaken: false, combo: this.combo,
    };

    if (!input.correct) {
      this.combo = 0;
      const hit = this.takeHit();
      // 换一种题型，稍后再考
      const alt = altQuestion(question, this.idx) ?? question;
      enemy.questions.shift();
      if (enemy.tier === 'boss') {
        enemy.questions.push({ ...alt, ...('boss' in question ? { boss: (question as { boss?: unknown }).boss } : {}) } as Question);
      } else {
        enemy.questions.unshift(alt);
        this.queue.push(this.queue.shift()!);
      }
      this.answersInRoom++;
      return { ...base, grade: 'miss', enemyAttack: hit.kind, rescued: hit.rescued, runOver: hit.over, combo: 0 };
    }

    // ---- 答对 ----
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const fluent = input.ms <= fluentMs(question, this.kit.youngMode);
    const grade: Grade = clean && fluent ? (this.combo >= 3 ? 'perfect' : 'nice') : 'hit';
    const awaken = this.awakenReady && question.kind === 'order';
    if (awaken) {
      this.awakenReady = false;
      this.gauge = 0;
    }
    const crit = this.rnd() < this.kit.crit;
    const nSeg = question.kind === 'spell' ? question.word.length + 1 : awaken ? 6 : SEGMENTS[grade];
    const segments = Array.from({ length: nSeg }, (_, i) => {
      const finisher = i === nSeg - 1 ? 1.8 : 1;
      const v = this.kit.atk * (0.85 + this.rnd() * 0.3) * finisher * (crit && i === nSeg - 1 ? this.kit.critMult : 1) * (awaken ? 1.6 : 1);
      return Math.max(1, Math.round(v));
    });
    this.totalHits += nSeg;

    let gaugeFull = false;
    if (!awaken && !this.awakenReady) {
      this.gauge = Math.min(100, this.gauge + GAUGE_GAIN[grade] + Math.min(10, this.kit.atk / 20));
      if (this.gauge >= 100) {
        this.awakenReady = true;
        gaugeFull = true;
      }
    }

    enemy.questions.shift();
    const enemyDefeated = enemy.questions.length === 0;
    if (enemyDefeated) this.queue.shift();

    let bossPhase: number | undefined;
    if (enemy.tier === 'boss' && this.bossTotal) {
      const done = 1 - enemy.questions.length / this.bossTotal;
      const phase = done >= 2 / 3 ? 3 : done >= 1 / 3 ? 2 : 1;
      if (phase > this.bossPhase && !enemyDefeated) {
        this.bossPhase = phase;
        bossPhase = phase;
      }
    }

    // 每答 3 题，还活着的敌人出手一次；漂亮/完美档自动格挡
    this.answersInRoom++;
    let enemyAttack: Outcome['enemyAttack'] = 'none';
    let rescued = false;
    let runOver = false;
    if (this.queue.length && this.answersInRoom % 3 === 0) {
      if (grade !== 'hit') enemyAttack = 'blocked';
      else {
        const hit = this.takeHit();
        enemyAttack = hit.kind;
        rescued = hit.rescued;
        runOver = hit.over;
      }
    }

    return {
      ...base, grade, segments, crit, enemyDefeated, enemyAttack, rescued, runOver, gaugeFull, awaken, bossPhase,
      roomCleared: this.queue.length === 0, combo: this.combo,
    };
  }

  /** 受到一次攻击：先扣护盾，再扣心；心归零时伙伴救援一次 */
  private takeHit(): { kind: 'shield' | 'heart'; rescued: boolean; over: boolean } {
    if (this.shield > 0) {
      this.shield--;
      return { kind: 'shield', rescued: false, over: false };
    }
    this.hearts--;
    if (this.hearts > 0) return { kind: 'heart', rescued: false, over: false };
    if (this.rescueLeft > 0) {
      this.rescueLeft--;
      this.hearts = Math.min(3, this.kit.hearts);
      return { kind: 'heart', rescued: true, over: false };
    }
    return { kind: 'heart', rescued: false, over: true };
  }

  /** 已清房间后可去的房间：主线下一间 + 相邻未访问的可选房间 */
  exits(): Room[] {
    const rooms = this.plan.rooms;
    const out: Room[] = [];
    const nextMain = rooms.slice(this.roomIdx + 1).find((r) => !r.optional && !this.visited.has(r.id));
    const [cx, cy] = this.room.cell;
    for (const r of rooms) {
      if (!r.optional || this.visited.has(r.id)) continue;
      if (Math.abs(r.cell[0] - cx) + Math.abs(r.cell[1] - cy) === 1) out.push(r);
    }
    if (nextMain) out.unshift(nextMain);
    return out;
  }

  get isLastRoom() {
    return this.room.type === 'boss';
  }

  answerLogs(): AnswerLog[] {
    return [...this.logs.values()];
  }

  elapsedSince(now: number) {
    return now - this.currentStart;
  }
}
