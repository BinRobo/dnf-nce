# 英语地下城 · 部署指南（给执行部署的 AI / 运维看）

**请按顺序执行，每一步都做“验证”。** 遇到和本文不符的情况先停下来报告，不要猜。
本文不包含任何密码。服务器的登录凭据由家长单独提供，只通过环境变量或 SSH 密钥使用，**不要写进任何文件、日志或 git**。

---

## 0. 这个系统由什么组成

一个 **Node.js 进程**同时做两件事，没有数据库，没有第三方依赖（不需要 `npm install`）：

| 部分 | 作用 |
|---|---|
| 静态托管 | 提供打包好的游戏页面（`dist/`，约 300 MB，含课文视频），以及家长用的管理后台 `/admin` |
| 账号与云存档 API（`/api/*`） | 孩子用邀请码注册 / 登录；存档放在服务器上，换平板也不丢；家长在后台管理账号 |

数据全在一个目录里（默认 `/var/lib/nce-dungeon`）：`users.json` 账号、`invites.json` 邀请码、`saves/` 存档、`snapshots/` 历史快照、`trash/` 被删除的存档。**备份这个目录 = 备份所有孩子的进度。**

没有后端也能运行：只把 `dist/` 放到任何静态服务器上，游戏检测不到后端会自动退回“只存本机”的模式（没有账号功能）。

## 1. 服务器要求

| 项目 | 要求 |
|---|---|
| 系统 | Linux（有 systemd；Ubuntu / Debian / CentOS / Alibaba Cloud Linux 都可以），x86_64 或 arm64 |
| 磁盘 | ≥ 2 GB 可用 |
| 内存 | ≥ 512 MB |
| Node.js | ≥ 18（没有的话安装脚本会自动装 20.x，国内镜像优先） |
| 端口 | 默认 80。云服务器控制台的**安全组**要放行对应的入方向端口，否则外面打不开 |
| 访问控制 | 管理后台有独立的管理员密码；游戏本身通过邀请码控制谁能注册。内容含《新概念英语》课文和视频，**只邀请熟人，不要公开网址** |

> ⚠ **HTTP 与 HTTPS：**平板上的“离线缓存”和“保持存储不被清理”只在 HTTPS（或 localhost）下可用；在纯 HTTP 下登录密码也是明文传输。云存档在 HTTP 下仍然能用，但**强烈建议有域名后上 HTTPS**（第 5 节）。注意：中国大陆的云服务器，域名走 80 / 443 端口需要先做 ICP 备案。

## 2. 方式 A：从开发机一键推送（推荐）

在**开发机**（有源码的机器）上执行。需要本机有 `rsync`；用密码登录时需要 `sshpass`。

```bash
cd <项目目录>
# 用 SSH 密钥登录：
deploy/push.sh root@<服务器IP>
# 只有密码时：用环境变量传，输入时不回显
read -rs SSHPASS; export SSHPASS
deploy/push.sh root@<服务器IP>
# 可选参数（原样交给服务器上的安装脚本）：--port 8080  --behind-proxy  --https
```

脚本会依次：测试 SSH 连接 → `npm run build` 打包 → 把 `dist/` 和 `server/` 同步到服务器的 `/opt/nce-dungeon` → 在服务器上运行 `install-server.sh`（装 Node、建系统服务、生成管理员密码、自检）。

**结束时会打印一次管理员密码，请让家长记下来。**（它也保存在服务器的 `/etc/nce-dungeon.env`，文件权限 600。）

**连不上时：**脚本会提示。常见原因是云服务器安全组没放行 22 端口，或没放行开发机的出口 IP。此时改用方式 B。

## 3. 方式 B：离线安装包

适合：开发机连不上服务器，或想自己 scp 过去。

```bash
# 开发机：
deploy/make-bundle.sh              # 生成 release/nce-dungeon-bundle-<日期>.tgz（约 300 MB），并打印校验和
scp release/nce-dungeon-bundle-*.tgz root@<服务器IP>:/root/

# 服务器：
sha256sum /root/nce-dungeon-bundle-*.tgz        # 与打印的校验和对比
mkdir -p /opt/nce-dungeon
tar xzf /root/nce-dungeon-bundle-*.tgz -C /opt/nce-dungeon
bash /opt/nce-dungeon/install-server.sh         # 参数同上：--port / --behind-proxy / --https
```

## 4. 部署后验证（必须全部通过）

在服务器上：

```bash
systemctl is-active nce-dungeon                       # 输出 active
curl -s http://127.0.0.1/api/health                   # {"ok":true,...}（端口按实际填写）
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/                       # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/admin                  # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/data/users.json        # 404（数据不能被下载）
curl -s -o /dev/null -w "%{http_code}\n" -H "Range: bytes=0-100" http://127.0.0.1/content/book1/media/L001.mp4   # 206
ls /opt/nce-dungeon/dist/content/book1/media | wc -l                             # 72
```

在**另一台机器的浏览器**里（验证安全组和对外访问）：

1. 打开 `http://<服务器IP>/`：出现“英语地下城”角色选择页，右上角有“☁ 登录 / 注册”。
2. 打开 `http://<服务器IP>/admin`：用管理员密码登录，看到“孩子账号”和“邀请码”。
3. 在后台创建一个邀请码 → 回到游戏用它注册 → 新建角色 → 进到城镇。
4. 在后台刷新：能看到这个孩子和角色。再换一个浏览器登录同一账号，角色应该自动出现。

## 5. HTTPS（有域名时）

让 nginx 或 Caddy 站在前面做 HTTPS，Node 只监听本机：

```bash
bash /opt/nce-dungeon/install-server.sh --behind-proxy --https      # 监听 127.0.0.1:5180，信任 X-Forwarded-For，Cookie 加 Secure
```

nginx 示例（证书用 certbot 申请：`certbot --nginx -d game.example.com`）：

```nginx
server {
    listen 80;
    server_name game.example.com;
    client_max_body_size 4m;
    location / {
        proxy_pass http://127.0.0.1:5180;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
    }
}
```

要点：`Host` 必须原样转发（服务器用它做防跨站检查）；不要在 nginx 里再叠加 `auth_basic`（后台自带登录）。

## 6. 第一次使用（交给家长）

1. 管理后台 `http://<地址>/admin` → 输入管理员密码。
2. “邀请码”→ 填孩子名字 → 创建。把 8 位邀请码发给孩子（一次性，14 天有效）。
3. 孩子在平板上打开游戏地址，点右上角“☁ 登录 / 注册”→ 输入邀请码、用户名、密码 → 创建角色开始玩。
4. **平板上“添加到主屏幕”**（iPad：Safari 点分享 → 添加到主屏幕；安卓：Chrome 菜单 → 安装应用 / 添加到主屏幕），之后从图标打开就是全屏 App。
5. 家长可以在后台：重置孩子密码、暂停账号、设置每天游戏时长、从历史快照恢复存档、下载存档。

## 7. 备份与恢复

```bash
# 备份（建议每天一次，放进 cron；停服务不是必须的，文件是原子写入的）
tar czf /root/nce-backup-$(date +%F).tgz -C /var/lib nce-dungeon
# 恢复到新服务器：先装好服务（方式 A/B），再
systemctl stop nce-dungeon
tar xzf nce-backup-XXXX.tgz -C /var/lib && chown -R nce:nce /var/lib/nce-dungeon
systemctl start nce-dungeon
```

玩家的存档同时还在各自设备的本地（IndexedDB）里，云端丢了也能从设备再上传（角色选择页的“☁ 上传”按钮）。

## 8. 更新版本

重复第 2 节（或第 3 节）。`install-server.sh` 可重复运行：不会动数据目录，不会换管理员密码，会重启服务。平板用户刷新页面即可拿到新版（离线缓存的版本号每次发布都会更新）。

## 9. 常见问题

| 现象 | 处理 |
|---|---|
| 打开页面一直黑屏 / 转圈 | 看浏览器开发者工具 Network 有没有 404；确认 `dist/index.html` 和 `dist/assets/` 都在 |
| 外面打不开，服务器上 curl 正常 | 安全组 / 防火墙没放行端口（`firewall-cmd --list-all` 或 `ufw status` 也看一下） |
| `install-server.sh` 说端口被占用 | 换端口 `--port 8080`，或让已有的 nginx 反向代理（第 5 节） |
| 孩子登录提示“尝试太多次” | 登录有限速（同一 IP + 用户名 10 分钟内错 8 次）。等 10 分钟，或在后台重置密码 |
| 课文没有原声 | 缺 `dist/content/book1/media/*.mp4`；用方式 A/B 重新部署，不要在服务器上重新运行内容生成脚本 |
| 注册说邀请码不对 | 邀请码一次性、14 天有效，大小写不敏感，中间的“-”可有可无；后台重新生成一个 |
| 忘了管理员密码 | `bash /opt/nce-dungeon/install-server.sh --reset-admin`（保留原有的端口等参数） |
| 想看日志 | `journalctl -u nce-dungeon -f` |

## 10. 安全要点

- 管理员密码只存在服务器的 `/etc/nce-dungeon.env`（600）。孩子的密码用 scrypt 加盐哈希，服务器上看不到明文。
- 数据目录必须在 `dist/` 之外（服务启动时会检查），权限 700，只有 `nce` 用户可读写。
- 服务以非 root 用户运行，systemd 开启了 `ProtectSystem=strict`、`NoNewPrivileges`。
- 接口防护：登录和注册限速、跨站请求（Origin 不一致）拒绝、请求体 3 MB 上限、只接受 JSON。
- 如果之前把服务器密码发给过别人或写进过聊天记录，部署完成后请改掉，并改用 SSH 密钥登录、关闭密码登录。

## 11. 目录速查（给需要改代码的 AI）

| 路径 | 内容 |
|---|---|
| `server/` | 后端（`app.mjs` 全部逻辑，`index.mjs` 启动入口；环境变量见文件头注释） |
| `public/admin.html` | 管理后台页面（单文件，无外部依赖） |
| `deploy/` | `push.sh` 一键推送、`make-bundle.sh` 离线包、`install-server.sh` 服务器安装脚本 |
| `src/save/cloud.ts` | 客户端云同步（登录、冲突处理、断网补传） |
| `src/` 其余 | 游戏代码；`content-src/` 源数据；`public/content/` 由 `tools/build-content.mjs` 生成 |
| `tests/` | `npm test` 单元与后端测试；`tests/e2e/*.mjs` 浏览器端到端（`cloud.mjs` 两台平板同步测试） |

本地开发：`ADMIN_PASSWORD=<至少8位> DATA_DIR=/tmp/nce-dev PORT=5180 node server/index.mjs`，另开终端 `npx vite --port 5199`（开发服务器会把 `/api` 转给 5180）。
