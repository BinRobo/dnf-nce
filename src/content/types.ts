/** 一段可播放的英语：优先使用课本音频片段，缺失时回退到语音合成。 */
export interface AudioClip {
  file: string; // 相对 content/book1/ 的路径
  start?: number; // 秒
  end?: number;
}

export interface Word {
  en: string;
  zh: string;
  ipa?: string;
  pos?: string;
  lesson?: number;
  audio?: AudioClip;
}

export interface DialogueLine {
  speaker: string;
  en: string;
  zh: string;
  audio?: AudioClip;
}

/** 双课练习里的句型填空 */
export interface Drill {
  en: string; // 用 ___ 表示空格
  zh: string;
  answer: string;
  options: string[];
}

export interface LessonPair {
  id: string; // 如 L001-002
  lessons: [number, number];
  title: string;
  titleZh: string;
  evenTitle?: string;
  evenTitleZh?: string;
  words: Word[];
  dialogue: DialogueLine[];
  drills: Drill[];
  /** 课文动画（整段对话） */
  video?: AudioClip;
}

export interface Region {
  id: string;
  name: string;
  grammar: string;
  dungeons: string[];
}

export interface Manifest {
  book: number;
  title: string;
  regions: Region[];
  titles: Record<string, { title: string; titleZh: string; lessons: [number, number] }>;
}
