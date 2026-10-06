/** 平板 / 手机（触摸为主）；平板外接键盘时仍按触摸处理，可在家长页把“拼写输入”改成键盘 */
export const isTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/** 已经从主屏幕图标打开（全屏 App 模式） */
export const isStandalone =
  (typeof matchMedia === 'function' && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)) ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;
