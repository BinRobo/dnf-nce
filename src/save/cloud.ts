import { deleteProfile, getProfile, listProfiles, saveProfile } from './db';
import { migrate, type SaveData } from './schema';

/**
 * 账号与云存档。
 * - 没有后端（本地开发、纯静态托管）时 available = false，游戏照旧只用本机存档。
 * - 登录后：每次本地保存 → 标记“待上传” → 4 秒后推送；切回前台 / 网络恢复 / 每分钟重试。
 * - 谁更新以服务器的版本号 rev 为准（不看平板的时钟）：
 *     云端 rev 比我上次同步的大 = 别的设备改过。我本地没动过就直接拉取；两边都改过就比较修改时间，
 *     输的一方留在快照里（云端快照 / 本机备份），不会丢。
 */
export interface CloudUser {
  id: string;
  username: string;
  displayName: string;
  /** 家长在后台设置的每天游戏时长（分钟），null = 用设备上的设置 */
  dailyMinutes: number | null;
  /** 家长是否允许多人功能（默认允许） */
  social?: boolean;
}
interface Meta {
  user: string;
  rev: number;
  dirty: boolean;
  /** 最近一次本地保存的时间（用来判断推送期间有没有新改动） */
  at: number;
  /** 下次推送强制覆盖（本地比云端新） */
  force?: boolean;
}
interface RemoteMeta {
  id: string;
  rev: number;
  updatedAt: number;
}

const META_KEY = 'nce_cloud_meta';
const USER_KEY = 'nce_cloud_user';

const store = {
  get<T>(k: string, d: T): T {
    try {
      return JSON.parse(localStorage.getItem(k) ?? '') as T;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* 无痕模式等：只是不缓存 */
    }
  },
};
const readMeta = () => store.get<Record<string, Meta>>(META_KEY, {});
const writeMeta = (m: Record<string, Meta>) => store.set(META_KEY, m);

async function call(method: string, path: string, body?: unknown, timeoutMs = 8000): Promise<{ status: number; json: any }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(path, {
      method, credentials: 'same-origin', signal: ctl.signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = await r.json();
    } catch {
      /* 不是 JSON（例如静态托管返回的网页） */
    }
    return { status: r.status, json };
  } finally {
    clearTimeout(t);
  }
}

export type SyncState = 'synced' | 'pending' | 'local';

class Cloud {
  /** 后端可用 */
  available = false;
  user: CloudUser | null = null;
  /** 有登录信息但现在连不上服务器 */
  offline = false;
  private timer: number | undefined;
  private flushing: Promise<void> | null = null;

  private started = false;
  private start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('online', () => void this.flush());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void this.flush());
    window.setInterval(() => void this.flush(), 60_000);
  }

  async init() {
    let h: { status: number; json: any } | null = null;
    let netError = false;
    try {
      h = await call('GET', '/api/health', undefined, 3500);
    } catch {
      netError = true;
    }
    if (netError) {
      // 断网 / 服务器暂时连不上：如果这台设备之前登录过，就保持登录，进度先存本机，连上后补传
      const cached = store.get<CloudUser | null>(USER_KEY, null);
      this.available = !!cached;
      this.user = cached;
      this.offline = !!cached;
      if (cached) this.start();
      return;
    }
    // 拿到了回应但不是我们的接口（本地开发、纯静态托管）：当作没有后端
    this.available = !!h && h.status === 200 && h.json?.ok === true;
    if (!this.available) {
      this.user = null;
      return;
    }
    this.start();
    let me: { status: number; json: any } | null = null;
    try {
      me = await call('GET', '/api/me', undefined, 5000);
    } catch {
      /* 刚才还通，现在断了：按离线处理 */
    }
    if (me?.status === 200) {
      this.setUser(me.json.user);
    } else if (me && me.status === 401) {
      this.setUser(null);
    } else {
      this.user = store.get<CloudUser | null>(USER_KEY, null);
      this.offline = !!this.user;
    }
  }

  private setUser(u: CloudUser | null) {
    this.user = u;
    this.offline = false;
    store.set(USER_KEY, u);
  }

  /** 返回错误文案；null = 成功 */
  async login(username: string, password: string): Promise<string | null> {
    return this.auth('/api/login', { username, password });
  }
  async register(invite: string, username: string, password: string): Promise<string | null> {
    return this.auth('/api/register', { invite, username, password });
  }
  private async auth(path: string, body: unknown): Promise<string | null> {
    let r;
    try {
      r = await call('POST', path, body);
    } catch {
      return '连不上服务器，请检查网络';
    }
    if (r.status !== 200) return r.json?.error ?? '出错了，请再试一次';
    this.setUser(r.json.user);
    return null;
  }

  /** 退出登录：本机上属于这个账号的角色一并清掉（云端有）。还有没上传的进度时拒绝退出，免得丢进度 */
  async logout(): Promise<string | null> {
    if (!this.user) return null;
    await this.flush();
    const meta = readMeta();
    const mine = Object.entries(meta).filter(([, m]) => m.user === this.user!.id);
    if (mine.some(([, m]) => m.dirty)) return '还有进度没上传到云端，请连上网络、等一会儿再退出';
    await call('POST', '/api/logout', {}).catch(() => null);
    for (const [id] of mine) {
      await deleteProfile(id);
      delete meta[id];
    }
    writeMeta(meta);
    this.setUser(null);
    return null;
  }

  /** 每个角色的状态（角色卡片上的小云朵） */
  state(id: string): SyncState {
    const m = readMeta()[id];
    if (!m || !this.user || m.user !== this.user.id) return 'local';
    return m.dirty ? 'pending' : 'synced';
  }

  /** 把一个还没绑定的本地角色放进账号，并马上上传 */
  async adopt(s: SaveData) {
    if (!this.user) return;
    const meta = readMeta();
    meta[s.id] = { user: this.user.id, rev: 0, dirty: true, at: s.updatedAt };
    writeMeta(meta);
    await this.flush();
  }

  async remove(id: string) {
    const meta = readMeta();
    const m = meta[id];
    delete meta[id];
    writeMeta(meta);
    if (m && this.user && m.user === this.user.id) await call('DELETE', `/api/saves/${id}`, undefined).catch(() => null);
  }

  /** 本地保存之后调用 */
  noteSaved(s: SaveData) {
    if (!this.user) return;
    const meta = readMeta();
    const m = meta[s.id];
    if (!m || m.user !== this.user.id) return;
    m.dirty = true;
    m.at = s.updatedAt;
    writeMeta(meta);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), 4000);
  }

  /** 把所有“待上传”的角色推上去（同时只跑一轮；跑的时候又来请求，就等这一轮结束） */
  flush(): Promise<void> {
    if (!this.user || !this.available) return Promise.resolve();
    if (this.flushing) return this.flushing;
    const run = (async () => {
      for (const [id, m] of Object.entries(readMeta())) if (m.user === this.user?.id && m.dirty) await this.push(id);
    })();
    // 清除标记要放在 run 结束之后（.finally 一定是异步回调），不能写进 run 里面
    this.flushing = run.finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async push(id: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const meta = readMeta();
      const m = meta[id];
      const local = await getProfile(id);
      if (!m || !local) return;
      let r;
      try {
        r = await call('PUT', `/api/saves/${id}`, { data: local, baseRev: m.rev, force: m.force || undefined }, 15000);
      } catch {
        this.offline = true;
        return;
      }
      this.offline = false;
      const cur = readMeta();
      const mm = cur[id];
      if (!mm) return;
      if (r.status === 200) {
        mm.rev = r.json.rev;
        mm.force = false;
        // 推送期间本地又保存过，就仍然是“待上传”
        if (mm.at === local.updatedAt) mm.dirty = false;
        writeMeta(cur);
        return;
      }
      if (r.status === 409) {
        // 游戏进行中遇到冲突：以正在玩的这份为准，云端旧版本会进快照
        mm.rev = r.json.rev;
        mm.force = true;
        writeMeta(cur);
        continue;
      }
      if (r.status === 401) {
        this.setUser(null);
        return;
      }
      console.warn('云存档上传失败', r.status, r.json?.error);
      return;
    }
  }

  private async pull(id: string, meta: Record<string, Meta>) {
    const r = await call('GET', `/api/saves/${id}`, undefined, 15000);
    if (r.status !== 200) return false;
    const data = migrate(r.json.data);
    await saveProfile(data, true);
    meta[id] = { user: this.user!.id, rev: r.json.rev, dirty: false, at: data.updatedAt };
    return true;
  }

  /** 登录后 / 回到角色选择页时：把云端和本机对齐。返回本机有没有变化 */
  async sync(): Promise<boolean> {
    if (!this.user || !this.available) return false;
    let list;
    try {
      list = await call('GET', '/api/saves');
    } catch {
      this.offline = true;
      return false;
    }
    if (list.status === 401) {
      this.setUser(null);
      return false;
    }
    if (list.status !== 200) return false;
    this.offline = false;
    const remote = list.json.saves as RemoteMeta[];
    const meta = readMeta();
    const locals = new Map((await listProfiles()).map((p) => [p.id, p]));
    const uid = this.user.id;
    let changed = false;
    for (const c of remote) {
      const l = locals.get(c.id);
      const m = meta[c.id];
      if (!l) {
        changed = (await this.pull(c.id, meta)) || changed;
      } else if (!m || m.user !== uid) {
        // 本机有同编号、没绑定的存档（一般是重装前上传过）：新的赢
        if (l.updatedAt > c.updatedAt) meta[c.id] = { user: uid, rev: c.rev, dirty: true, at: l.updatedAt, force: true };
        else changed = (await this.pull(c.id, meta)) || changed;
      } else if (c.rev !== m.rev) {
        if (!m.dirty || l.updatedAt < c.updatedAt) changed = (await this.pull(c.id, meta)) || changed;
        else {
          m.rev = c.rev;
          m.force = true;
        }
      }
    }
    for (const [id, m] of Object.entries(meta)) {
      if (m.user !== uid || remote.some((c) => c.id === id)) continue;
      if (m.rev > 0) delete meta[id]; // 在别的设备上删掉了：本机保留，但不再同步
      else m.dirty = true;
    }
    writeMeta(meta);
    await this.flush();
    return changed;
  }
}

export const cloud = new Cloud();
