// 启动：node server/index.mjs
// 环境变量：
//   ADMIN_PASSWORD  管理后台密码（必填，至少 8 位）
//   PORT            监听端口，默认 5180
//   HOST            监听地址，默认 0.0.0.0（前面有 nginx 时建议 127.0.0.1）
//   DATA_DIR        数据目录，默认 ./data
//   STATIC_DIR      打包好的游戏目录（dist），设置后本服务同时托管游戏页面
//   TRUST_PROXY=1   在 nginx 等反向代理后面时设置，才会信任 X-Forwarded-For
//   SECURE_COOKIE=1 全站使用 HTTPS 时设置，登录 Cookie 只走 HTTPS
import { createApp } from './app.mjs';

import path from 'node:path';

const port = Number(process.env.PORT ?? 5180);
// 数据目录绝不能放在对外托管的目录里，否则别人能下载到所有存档
if (process.env.STATIC_DIR) {
  const d = path.resolve(process.env.DATA_DIR ?? './data');
  const s = path.resolve(process.env.STATIC_DIR);
  if (d === s || d.startsWith(s + path.sep)) throw new Error('DATA_DIR 不能在 STATIC_DIR 里面');
}
const host = process.env.HOST ?? '0.0.0.0';
const app = createApp({
  dataDir: process.env.DATA_DIR ?? './data',
  staticDir: process.env.STATIC_DIR,
  adminPassword: process.env.ADMIN_PASSWORD,
  trustProxy: process.env.TRUST_PROXY === '1',
  secureCookie: process.env.SECURE_COOKIE === '1',
});
app.server.listen(port, host, () => console.log(`英语地下城服务已启动 http://${host}:${port}  数据目录 ${process.env.DATA_DIR ?? './data'}${process.env.STATIC_DIR ? `  托管 ${process.env.STATIC_DIR}` : ''}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.close().then(() => process.exit(0)));
