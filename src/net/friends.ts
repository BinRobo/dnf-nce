/** 好友：服务器接口的小封装 + 本地缓存（城镇里用来给好友头顶加星标、角标提示） */
export interface FriendView {
  id: string;
  name: string;
  lv: number;
  cls: 'sword' | 'gunner' | 'mage';
  gender: 'm' | 'f';
  /** 在线时所在的街区 id（在副本里为 null）；不在线整个是 null */
  online: { district: string | null } | null;
}
export interface FriendsData {
  code: string;
  max: number;
  friends: FriendView[];
  incoming: FriendView[];
  outgoing: FriendView[];
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? '出错了，请再试一次');
  return j as T;
}

class Friends {
  data: FriendsData | null = null;
  /** 好友列表变化时（刷新、接受、删除）通知界面 */
  onChange: (() => void) | null = null;

  get ids() {
    return new Set(this.data?.friends.map((f) => f.id) ?? []);
  }
  get pending() {
    return this.data?.incoming.length ?? 0;
  }
  isFriend(id: string) {
    return !!this.data?.friends.some((f) => f.id === id);
  }
  asked(id: string) {
    return !!this.data?.outgoing.some((f) => f.id === id);
  }

  async refresh() {
    this.data = await api<FriendsData>('GET', '/api/friends');
    this.onChange?.();
    return this.data;
  }
  async request(by: { code: string } | { id: string }) {
    const r = await api<{ status: 'requested' | 'friends'; friend?: FriendView; to?: FriendView }>('POST', '/api/friends/request', by);
    await this.refresh();
    return r;
  }
  async accept(id: string) {
    await api('POST', '/api/friends/accept', { id });
    await this.refresh();
  }
  async decline(id: string) {
    await api('POST', '/api/friends/decline', { id });
    await this.refresh();
  }
  async remove(id: string) {
    await api('DELETE', `/api/friends/${id}`);
    await this.refresh();
  }
  clear() {
    this.data = null;
  }
}

export const friends = new Friends();
