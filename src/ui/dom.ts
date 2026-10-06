/**
 * 网页原生表单弹窗：平板上输入文字要用系统键盘，Phaser 画布里没有输入框，
 * 所以登录、起名字、家长密码都用这个盖在画布上的 HTML 弹窗。
 */
export interface Field {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'number';
  placeholder?: string;
  maxLength?: number;
  autocomplete?: string;
  value?: string;
  inputMode?: 'numeric' | 'text';
}
export interface DialogOptions {
  title: string;
  /** 标题下面的小字说明 */
  hint?: string;
  fields: Field[];
  submitLabel?: string;
  /** 返回字符串 = 错误文案（弹窗保留）；返回 undefined/null = 成功关闭 */
  onSubmit: (values: Record<string, string>) => Promise<string | null | undefined | void> | string | null | undefined | void;
  onCancel?: () => void;
  /** 底部的小链接，如“还没有账号？用邀请码注册” */
  links?: { label: string; onClick: () => void }[];
}

/**
 * 弹窗盖在画布上时，Phaser 仍会收到窗口级的点击，点弹窗里的按钮会同时点到下面的游戏按钮。
 * main.ts 注册开关，弹窗打开期间关掉游戏输入，关闭后恢复。
 */
let gate: (enabled: boolean) => void = () => undefined;
let openCount = 0;
export const setInputGate = (fn: (enabled: boolean) => void) => (gate = fn);

const STYLE_ID = 'nce-dom-style';
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .nce-ov{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(5,7,16,.72);padding:16px;box-sizing:border-box;
    font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;-webkit-user-select:text;user-select:text;touch-action:manipulation}
  .nce-card{width:min(440px,100%);max-height:100%;overflow:auto;background:#161a2e;color:#e9ecff;border:2px solid #3a4170;border-radius:16px;padding:22px 22px 18px;box-sizing:border-box;box-shadow:0 12px 40px rgba(0,0,0,.5)}
  .nce-card h2{margin:0 0 6px;font-size:24px;text-align:center}
  .nce-hint{margin:0 0 14px;font-size:15px;line-height:1.5;color:#9ea6d6;text-align:center}
  .nce-card label{display:block;margin:10px 0 4px;font-size:15px;color:#b9c0ee}
  .nce-card input{width:100%;box-sizing:border-box;font-size:20px;padding:11px 12px;border-radius:10px;border:2px solid #3a4170;background:#0e1122;color:#fff;outline:none}
  .nce-card input:focus{border-color:#7fd0ff}
  .nce-err{min-height:22px;margin:10px 0 0;font-size:15px;color:#ff8a8a;text-align:center}
  .nce-row{display:flex;gap:10px;margin-top:10px}
  .nce-btn{flex:1;font-size:20px;padding:12px 10px;border-radius:12px;border:0;background:#2f7a4d;color:#fff;font-family:inherit;cursor:pointer}
  .nce-btn.sec{background:#2d3561}
  .nce-btn:disabled{opacity:.55}
  .nce-links{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 18px;margin-top:12px}
  .nce-links a{color:#7fd0ff;font-size:16px;text-decoration:underline;cursor:pointer;padding:4px}
  `;
  document.head.appendChild(s);
}

export function domDialog(o: DialogOptions): { close: () => void } {
  ensureStyle();
  const ov = document.createElement('div');
  ov.className = 'nce-ov';
  const card = document.createElement('form');
  card.className = 'nce-card';
  card.noValidate = true;
  const h = document.createElement('h2');
  h.textContent = o.title;
  card.append(h);
  if (o.hint) {
    const p = document.createElement('p');
    p.className = 'nce-hint';
    p.textContent = o.hint;
    card.append(p);
  }
  const inputs: Record<string, HTMLInputElement> = {};
  for (const f of o.fields) {
    const lab = document.createElement('label');
    lab.textContent = f.label;
    const inp = document.createElement('input');
    inp.type = f.type ?? 'text';
    inp.placeholder = f.placeholder ?? '';
    if (f.maxLength) inp.maxLength = f.maxLength;
    inp.setAttribute('autocomplete', f.autocomplete ?? 'off');
    inp.value = f.value ?? '';
    if (f.inputMode) inp.inputMode = f.inputMode;
    inp.autocapitalize = 'off';
    inp.spellcheck = false;
    inputs[f.key] = inp;
    lab.append(inp);
    card.append(lab);
  }
  const err = document.createElement('div');
  err.className = 'nce-err';
  card.append(err);
  const row = document.createElement('div');
  row.className = 'nce-row';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'nce-btn sec';
  cancel.textContent = '取消';
  const ok = document.createElement('button');
  ok.type = 'submit';
  ok.className = 'nce-btn';
  ok.textContent = o.submitLabel ?? '确定';
  row.append(cancel, ok);
  card.append(row);
  if (o.links?.length) {
    const box = document.createElement('div');
    box.className = 'nce-links';
    for (const l of o.links) {
      const a = document.createElement('a');
      a.textContent = l.label;
      a.onclick = () => {
        close();
        l.onClick();
      };
      box.append(a);
    }
    card.append(box);
  }
  ov.append(card);
  openCount++;
  gate(false);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    ov.remove();
    // 稍等一下再恢复：关闭弹窗那一下点击的 mouseup 不要落到游戏按钮上
    setTimeout(() => {
      if (--openCount === 0) gate(true);
    }, 250);
  };
  cancel.onclick = () => {
    close();
    o.onCancel?.();
  };
  card.onsubmit = async (e) => {
    e.preventDefault();
    ok.disabled = true;
    err.textContent = '';
    const vals = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
    try {
      const msg = await o.onSubmit(vals);
      if (msg) {
        err.textContent = msg;
        ok.disabled = false;
      } else close();
    } catch (ex) {
      err.textContent = (ex as Error).message || '出错了，请再试一次';
      ok.disabled = false;
    }
  };
  document.body.append(ov);
  // 等弹窗显示出来再聚焦，平板上才会弹出键盘
  setTimeout(() => Object.values(inputs)[0]?.focus(), 80);
  return { close };
}

/** 替代 window.prompt：返回输入的文字，取消返回 null */
export function domPrompt(title: string, o: { hint?: string; label?: string; type?: 'text' | 'password'; maxLength?: number; inputMode?: 'numeric' | 'text'; submitLabel?: string; value?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    domDialog({
      title, hint: o.hint, submitLabel: o.submitLabel,
      fields: [{ key: 'v', label: o.label ?? '', type: o.type, maxLength: o.maxLength, inputMode: o.inputMode, value: o.value }],
      onSubmit: (v) => {
        const t = v.v.trim();
        if (!t) return '还没有输入哦';
        done = true;
        resolve(t);
      },
      onCancel: () => {
        if (!done) resolve(null);
      },
    });
  });
}
