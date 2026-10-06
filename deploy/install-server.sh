#!/usr/bin/env bash
# 英语地下城 · 服务器安装脚本（在服务器上用 root 运行；可以重复运行，数据不会丢）
#
# 前提：APP_DIR（默认 /opt/nce-dungeon）里已经有 dist/（打包好的游戏）和 server/（后端），
#       也就是 deploy/push.sh 推送过来的，或把 release 里的 bundle 解压到那里。
#
# 用法：
#   bash install-server.sh                  # 直接用 80 端口对外提供服务
#   bash install-server.sh --port 8080      # 换端口
#   bash install-server.sh --behind-proxy   # 前面有 nginx/Caddy：只监听 127.0.0.1:5180，并信任 X-Forwarded-For
#   bash install-server.sh --https          # 站点全程 HTTPS（登录 Cookie 加 Secure）；通常和 --behind-proxy 一起用
#   bash install-server.sh --reset-admin    # 重新生成管理后台密码
#
# 其他可调的环境变量：NCE_APP_DIR NCE_DATA_DIR NCE_ENV_FILE NCE_UNIT_FILE NCE_USER NCE_NODE_VERSION
#   NCE_NO_SYSTEMD=1（不装系统服务，只准备好文件，测试用）  NCE_SKIP_NODE=1（不安装 Node，测试用）
set -euo pipefail

APP_DIR="${NCE_APP_DIR:-/opt/nce-dungeon}"
DATA_DIR="${NCE_DATA_DIR:-/var/lib/nce-dungeon}"
ENV_FILE="${NCE_ENV_FILE:-/etc/nce-dungeon.env}"
UNIT_FILE="${NCE_UNIT_FILE:-/etc/systemd/system/nce-dungeon.service}"
SERVICE_USER="${NCE_USER:-nce}"
NODE_VERSION="${NCE_NODE_VERSION:-20.18.1}"
PORT=""
PROXY=0
HTTPS=0
RESET_ADMIN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --behind-proxy) PROXY=1; shift ;;
    --https) HTTPS=1; shift ;;
    --reset-admin) RESET_ADMIN=1; shift ;;
    -h|--help) sed -n 2,16p "$0"; exit 0 ;;
    *) echo "不认识的参数：$1"; exit 2 ;;
  esac
done
[ -n "$PORT" ] || { [ "$PROXY" = 1 ] && PORT=5180 || PORT=80; }
BIND=0.0.0.0
[ "$PROXY" = 1 ] && BIND=127.0.0.1

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m错误：%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "需要 root 权限（用 root 登录，或在命令前加 sudo）"
[ -f "$APP_DIR/server/index.mjs" ] || die "找不到 $APP_DIR/server/index.mjs —— 请先把 server/ 放到 $APP_DIR（见 docs/DEPLOY.md）"
[ -f "$APP_DIR/dist/index.html" ] || die "找不到 $APP_DIR/dist/index.html —— 请先把打包好的 dist/ 放到 $APP_DIR"
[ -f "$APP_DIR/dist/admin.html" ] || die "dist/ 里没有 admin.html（管理后台页面），请重新打包"

# ---------- 1. Node.js（≥ 18） ----------
node_ok() { command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
if [ "${NCE_SKIP_NODE:-0}" != 1 ] && ! node_ok; then
  say "安装 Node.js $NODE_VERSION"
  case "$(uname -m)" in x86_64|amd64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; *) die "不支持的 CPU：$(uname -m)" ;; esac
  FILE="node-v$NODE_VERSION-linux-$ARCH.tar.gz"
  TMP="$(mktemp -d)"
  ok=0
  # 国内镜像优先，官方源兜底
  for base in "https://registry.npmmirror.com/-/binary/node/v$NODE_VERSION" "https://mirrors.aliyun.com/nodejs-release/v$NODE_VERSION" "https://nodejs.org/dist/v$NODE_VERSION"; do
    echo "尝试 $base"
    if curl -fL --connect-timeout 10 --max-time 300 -o "$TMP/$FILE" "$base/$FILE" 2>/dev/null; then
      if curl -fsL --connect-timeout 10 -o "$TMP/SHASUMS256.txt" "$base/SHASUMS256.txt" 2>/dev/null; then
        want="$(grep " $FILE\$" "$TMP/SHASUMS256.txt" | awk '{print $1}')"
        got="$(sha256sum "$TMP/$FILE" | awk '{print $1}')"
        [ -n "$want" ] && [ "$want" = "$got" ] || { echo "校验失败，换下一个源"; continue; }
      fi
      ok=1; break
    fi
  done
  [ "$ok" = 1 ] || die "Node.js 下载失败。请手动安装 Node 18 或更新版本后重新运行本脚本"
  tar -xzf "$TMP/$FILE" -C /opt
  ln -sfn "/opt/node-v$NODE_VERSION-linux-$ARCH/bin/node" /usr/local/bin/node
  rm -rf "$TMP"
fi
if [ "${NCE_SKIP_NODE:-0}" != 1 ]; then node_ok || die "Node.js 不可用"; echo "Node.js $(node -v)"; fi
NODE_BIN="$(command -v node || echo /usr/local/bin/node)"

# ---------- 2. 用户与目录 ----------
say "准备目录与用户"
mkdir -p "$DATA_DIR"
if [ "${NCE_NO_SYSTEMD:-0}" != 1 ]; then
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER" 2>/dev/null || useradd -r -M -s /sbin/nologin "$SERVICE_USER"
  fi
  chown -R "$SERVICE_USER":"$SERVICE_USER" "$DATA_DIR"
fi
chmod 700 "$DATA_DIR"
# 数据目录绝不能在对外托管的 dist 里面
case "$(realpath -m "$DATA_DIR")/" in "$(realpath -m "$APP_DIR/dist")"/*) die "数据目录不能放在 dist 里面" ;; esac

# ---------- 3. 配置文件（只写一次；管理员密码只在新生成时显示） ----------
NEW_PW=""
if [ ! -f "$ENV_FILE" ] || [ "$RESET_ADMIN" = 1 ]; then
  NEW_PW="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)"
fi
if [ -n "$NEW_PW" ] || [ ! -f "$ENV_FILE" ]; then
  umask 077
  {
    echo "# 英语地下城服务配置（systemd 读取）。改完执行：systemctl restart nce-dungeon"
    echo "ADMIN_PASSWORD=$NEW_PW"
  } > "$ENV_FILE.new"
  mv "$ENV_FILE.new" "$ENV_FILE"
fi
# 其余配置每次按参数刷新，管理员密码保持不变
ADMIN_LINE="$(grep '^ADMIN_PASSWORD=' "$ENV_FILE" | head -1)"
umask 077
{
  echo "# 英语地下城服务配置（systemd 读取）。改完执行：systemctl restart nce-dungeon"
  echo "$ADMIN_LINE"
  echo "PORT=$PORT"
  echo "HOST=$BIND"
  echo "DATA_DIR=$DATA_DIR"
  echo "STATIC_DIR=$APP_DIR/dist"
  [ "$PROXY" = 1 ] && echo "TRUST_PROXY=1"
  [ "$HTTPS" = 1 ] && echo "SECURE_COOKIE=1"
} > "$ENV_FILE.new"
mv "$ENV_FILE.new" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# ---------- 4. 系统服务 ----------
if [ "${NCE_NO_SYSTEMD:-0}" = 1 ]; then
  say "已跳过系统服务（NCE_NO_SYSTEMD=1）"
  echo "手动启动：set -a; . $ENV_FILE; set +a; $NODE_BIN $APP_DIR/server/index.mjs"
else
  command -v systemctl >/dev/null 2>&1 || die "这台服务器没有 systemd；请用 NCE_NO_SYSTEMD=1 运行，再自己配置进程守护"
  # 端口被别的程序占着就不要硬上（可能是 nginx 或别的网站）
  holder="$(ss -ltnp 2>/dev/null | awk -v p=":$PORT\$" '$4 ~ p {print $0}' | grep -v nce-dungeon || true)"
  if [ -n "$holder" ] && ! systemctl is-active --quiet nce-dungeon; then
    echo "$holder"
    die "端口 $PORT 已被占用。换一个端口：bash install-server.sh --port 8080；或者让 nginx 反向代理：--behind-proxy（见 docs/DEPLOY.md）"
  fi
  say "安装系统服务 nce-dungeon"
  cat > "$UNIT_FILE" <<EOF
[Unit]
Description=English Dungeon (NCE) game and account server
After=network.target

[Service]
User=$SERVICE_USER
EnvironmentFile=$ENV_FILE
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $APP_DIR/server/index.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable nce-dungeon >/dev/null 2>&1 || true
  systemctl restart nce-dungeon
  sleep 2
  systemctl is-active --quiet nce-dungeon || { journalctl -u nce-dungeon -n 30 --no-pager || true; die "服务没有起来，日志见上方"; }
fi

# ---------- 5. 自检 ----------
say "自检"
if [ "${NCE_NO_SYSTEMD:-0}" != 1 ]; then
  H="$(curl -fsS --max-time 8 "http://127.0.0.1:$PORT/api/health" || true)"
  echo "健康检查：${H:-无响应}"
  echo "$H" | grep -q '"ok":true' || die "健康检查没通过：journalctl -u nce-dungeon -n 50"
  curl -fsS --max-time 8 -o /dev/null "http://127.0.0.1:$PORT/" || die "首页打不开"
  curl -fsS --max-time 8 -o /dev/null "http://127.0.0.1:$PORT/admin" || die "管理后台页打不开"
  echo "首页、管理后台页：正常"
fi

IP=""
for svc in https://api.ipify.org https://ifconfig.me https://myip.ipip.net https://ip.sb; do
  IP="$(curl -fsS --max-time 4 "$svc" 2>/dev/null | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -1 || true)"
  [ -n "$IP" ] && break
done
# 取不到公网地址时，不要把内网 IP 当成访问地址
[ -n "$IP" ] || IP="<服务器公网IP>"
SHOWPORT=""; [ "$PORT" != 80 ] && SHOWPORT=":$PORT"
say "完成"
cat <<EOF
游戏地址：    http://$IP$SHOWPORT/
管理后台：    http://$IP$SHOWPORT/admin
数据目录：    $DATA_DIR（备份它就等于备份所有孩子的存档）
配置文件：    $ENV_FILE
EOF
if [ -n "$NEW_PW" ]; then
  echo "管理后台密码：$NEW_PW    （只在这里显示这一次，已保存在 $ENV_FILE，请记下来）"
else
  echo "管理后台密码：沿用之前的（在 $ENV_FILE 里，--reset-admin 可重新生成）"
fi
cat <<EOF

别忘了：
  1. 云服务器控制台的“安全组”要放行 TCP $PORT（入方向），否则外面打不开。
  2. 平板访问需要 HTTPS 才能离线缓存和稳定保存；有域名时见 docs/DEPLOY.md 的“HTTPS”一节。
  3. 常用命令：systemctl status nce-dungeon   journalctl -u nce-dungeon -f   systemctl restart nce-dungeon
EOF
