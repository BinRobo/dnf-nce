# 英语地下城 · 部署指南（给执行部署的 AI / 运维看）

这是一个**纯前端静态网站**：Phaser 3 + TypeScript，用 Vite 打包。没有后端，也没有数据库。玩家存档保存在各自浏览器的 IndexedDB 里。部署 = 把打包产物 `dist/` 放到任意静态 Web 服务器上。

**请按顺序执行，每一步都做“验证”。** 遇到和本文不符的情况，先停下来报告，不要猜。

---

## 0. 先确认这几件事

| 项目 | 要求 |
|---|---|
| 服务器 | Linux，能装 Node.js 20+ 和 nginx（或 Caddy、任意静态服务器） |
| 磁盘 | ≥ 2 GB 可用：产物约 300 MB，源码 + node_modules 约 1 GB |
| 内存 | 构建时 ≥ 2 GB；只做静态托管 512 MB 就够 |
| 域名 / HTTPS | 推荐用 HTTPS（浏览器的“持久化存储”在 HTTPS 下才可靠，存档更安全） |
| 访问控制 | **必须加**：内容含《新概念英语》课文、角色、视频和微软语音合成，只允许家人和熟人访问，不能公开。见第 4 节 Basic Auth |

---

## 1. 选一种部署方式

### 方式 A（推荐）：直接拷贝打包好的产物，服务器上不用构建

在**原来的机器**（/home/ubuntu/dnf）上打包：

```bash
cd /home/ubuntu/dnf
npm run build                         # 类型检查 + 打包到 dist/
cp -r public/audition dist/           # 试听页（可选）
find dist/assets/art -name '*.png' -delete   # 删掉美术自查截图（不影响游戏）
tar czf nce-dungeon-dist-$(date +%Y%m%d).tgz dist
```

把 tgz 传到新服务器（`scp` / `rsync`），然后解压：

```bash
sudo mkdir -p /var/www/nce-dungeon
sudo tar xzf nce-dungeon-dist-*.tgz -C /var/www/nce-dungeon --strip-components=1
```

**验证：**

```bash
ls /var/www/nce-dungeon/index.html \
   /var/www/nce-dungeon/content/book1/manifest.json \
   /var/www/nce-dungeon/content/book1/media/L001.mp4
```

三个文件都要存在。然后跳到第 2 节。

### 方式 B：在新服务器上从源码构建

源码在 Gitee 仓库 `gitee.com/Bingou3D/dnf-nce`（私有仓库，需要家长提供访问令牌）。

> ⚠ 不要把带账号密码的 URL 写进任何文件或日志。

**仓库里没有这些（被 .gitignore 排除），必须另外从原机器拷贝：**

| 路径 | 大小 | 作用 | 缺了会怎样 |
|---|---|---|---|
| `public/content/book1/media/*.mp4` | 约 204 MB | 72 段课文动画视频，也是课文原声来源 | 没有动画；课文句子改用浏览器语音合成 |
| `.cache/video/*.json` | 小 | 视频切分时间，只有重新生成课程内容时才需要 | 只部署不需要 |
| `NewConceptEnglish/` | 大 | 原始课本 PDF 和视频 | 只部署不需要 |

```bash
# 1) 取源码（令牌由家长提供，用环境变量传入，不要明文写进命令历史）
git clone https://gitee.com/Bingou3D/dnf-nce.git nce-dungeon
cd nce-dungeon

# 2) 从原机器拷贝视频（在原机器上执行，或用 rsync 拉取）
rsync -av ubuntu@<原机器>:/home/ubuntu/dnf/public/content/book1/media/ public/content/book1/media/

# 3) 安装依赖（跳过 Playwright 浏览器下载，生产环境用不到）
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm ci

# 4) 打包
npm run build
cp -r public/audition dist/
```

**验证：**
- `npm run build` 最后输出 `✓ built in …`，没有 TypeScript 报错。
- `ls dist/content/book1/media | wc -l` 输出 `72`。
- 可选：`npm test` 应全部通过（约 170+ 项）。

> ⚠ **不要在新服务器上运行 `node tools/build-content.mjs`。**
> 仓库里的 `public/content/book1/lessons/*.json` 已经是生成好的课程（含每句课文在视频里的时间）。
> 没有 `.cache/video/` 时重新生成，会把这些时间全部丢掉，课文就会退回语音合成。
> 只有在修改了 `content-src/` 课文、并且拷贝了 `.cache/video/` 时才需要运行它。

最后把 `dist/` 的内容放到网站目录：

```bash
sudo mkdir -p /var/www/nce-dungeon
sudo rsync -a --delete dist/ /var/www/nce-dungeon/
```

---

## 2. 配置 nginx

`/etc/nginx/sites-available/nce-dungeon`：

```nginx
server {
    listen 80;
    server_name game.example.com;          # 改成实际域名；没有域名就写服务器 IP
    root /var/www/nce-dungeon;
    index index.html;

    # 家长账号密码保护（第 4 节生成 .htpasswd）
    auth_basic "English Dungeon";
    auth_basic_user_file /etc/nginx/.htpasswd-nce;

    # 文本类资源压缩（SVG 美术和 JSON 课文压缩后小很多）
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml text/plain;
    gzip_min_length 1024;

    # 打包出来的 JS（文件名带哈希）：长缓存
    location ~* ^/assets/index-[A-Za-z0-9_-]+\.js$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    # 课程清单、剧本、城镇数据等 JSON：每次都向服务器确认，保证更新后立刻生效
    location ~* \.json$ {
        add_header Cache-Control "no-cache";
    }
    # 视频、音频：支持断点 / 拖动（nginx 默认支持 Range），缓存 7 天
    location ~* \.(mp4|mp3)$ {
        expires 7d;
    }
    # 其余美术（svg/png）：缓存 1 天
    location ~* \.(svg|png)$ {
        expires 1d;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/nce-dungeon /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### HTTPS（有域名时）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d game.example.com
```

### 没有 nginx 的临时办法（不推荐长期用）

```bash
cd /var/www/nce-dungeon && npx serve -l 5174 .
```

或者在源码目录里运行 `npm run preview`，监听 5174 端口。这两种都没有访问控制。

---

## 3. 部署后验证（必须全部通过）

把 `U:P` 换成第 4 节设置的账号密码，`HOST` 换成域名或 IP。

```bash
H=http://HOST
curl -s -u U:P -o /dev/null -w "%{http_code} 首页\n"     $H/
curl -s -u U:P -o /dev/null -w "%{http_code} 课程清单\n" $H/content/book1/manifest.json
curl -s -u U:P -o /dev/null -w "%{http_code} 章节数据\n" $H/content/chapters.json
curl -s -u U:P -o /dev/null -w "%{http_code} 音频清单\n" $H/assets/audio/manifest.json
curl -s -u U:P -o /dev/null -w "%{http_code} 视频分段\n" -H "Range: bytes=0-1000" $H/content/book1/media/L001.mp4
curl -s -u U:P -o /dev/null -w "%{http_code} 未登录应被拒\n" $H/
```

期望结果：
- 前四行都是 `200`。
- 视频那行是 `206`（Range 生效）。
- 最后一行是 `401`（访问控制生效）。

再用浏览器检查：
1. 打开 `$H/`，应出现“英语地下城”角色选择页。新建角色，能选剑士、神枪手、魔法师和男女，进入城镇后有背景音乐（音乐在第一次点击后才会开始）。
2. 打开 `$H/?test`，进入测试面板（测试角色不保存）。在“地图与副本”里随便进一个副本，能打怪、听到课文原声。
3. 打开 `$H/audition/bgm2.html`，背景音乐试听页能播放。

---

## 4. 访问控制（必须）

```bash
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd-nce family     # 按提示设密码；再加人时去掉 -c
sudo systemctl reload nginx
```

把账号密码只告诉家人和熟人，不要把网址发到公开场合。

---

## 5. 玩家存档要注意

- 存档在**每个浏览器本地**，和服务器无关。换了网址（域名、IP 或端口任何一样变了）就是“新网站”，看不到旧存档。
- 换服务器前，在**旧网址**里进入游戏 → 城镇底部「💾 存档」→「⬇ 导出备份文件」，得到一个 .json。然后在**新网址**的角色选择页点「从备份文件导入」。
- 清理浏览器数据会丢存档，提醒家长定期导出备份。

---

## 6. 以后更新版本

在原机器上重复第 1 节方式 A 打包，再到服务器上执行：

```bash
sudo rsync -a --delete <解压出的 dist>/ /var/www/nce-dungeon/
```

JSON 配了 `no-cache`，玩家刷新页面就能拿到新内容。打包后的 JS 文件名带哈希，不会读到旧缓存。

---

## 7. 可选：Docker

```dockerfile
# Dockerfile（放在 dist/ 的上一级目录）
FROM nginx:1.27-alpine
COPY dist/ /usr/share/nginx/html/
COPY nginx-nce.conf /etc/nginx/conf.d/default.conf
COPY .htpasswd-nce /etc/nginx/.htpasswd-nce
```

nginx-nce.conf 用第 2 节的 server 块，把 `root` 改成 `/usr/share/nginx/html`。

```bash
docker build -t nce-dungeon .
docker run -d --name nce-dungeon -p 80:80 --restart unless-stopped nce-dungeon
```

---

## 8. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 页面一直黑屏或转圈 | 用的是开发服务器或文件不全。确认网站根目录是 `dist` 的内容，且 `index.html` 和 `assets/index-*.js` 都在 |
| 课文没有原声，变成机器朗读 | 缺 `content/book1/media/*.mp4`，或在没有 `.cache/video` 的情况下运行过 build-content。重新按第 1 节拷贝视频 / 产物 |
| 没有背景音乐 | 浏览器要求先点击一下页面才能出声；另外检查 `assets/audio/bgm/*.mp3` 是否存在 |
| 进副本卡在“加载中…” | 资源是按需加载的，检查浏览器开发者工具 Network 里有没有 404 的 svg / mp3 |
| 存档不见了 | 换了网址或清理了浏览器数据。用导出 / 导入备份恢复（第 5 节） |

---

## 9. 目录速查（给需要改代码的 AI）

| 路径 | 内容 |
|---|---|
| `src/` | 游戏代码（scenes 场景、systems 纯逻辑、battle 战斗、assets.ts 按需加载） |
| `content-src/` | 人工整理的源数据：课文、剧本、NPC、章节 Boss、职业技能 |
| `public/content/` | 由 `tools/build-content.mjs` 生成的发布数据 |
| `public/assets/` | 美术（SVG）、音效、音乐 |
| `docs/slice/*.md` | 各轮美术 / 策划规格 |
| `tests/` | `npm test` 单元测试；`tests/e2e/*.mjs` 浏览器测试，需要开发服务器 `npx vite --port 5199` 和 Playwright 浏览器 |
