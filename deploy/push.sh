#!/usr/bin/env bash
# 从开发机一键把游戏和后端推到服务器，并（重新）安装服务。
#
# 用法：
#   deploy/push.sh root@47.107.163.156                 # 默认 80 端口
#   deploy/push.sh root@47.107.163.156 --port 8080     # 其余参数原样交给 install-server.sh
#   deploy/push.sh root@host --no-build                # 跳过打包，用现有的 dist/
#
# 登录方式：优先用 SSH 密钥。只有密码时，用环境变量传，别写进命令行或文件：
#   read -rs SSHPASS; export SSHPASS; deploy/push.sh root@host     （需要本机装了 sshpass）
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"
[ -n "$TARGET" ] && [ "${TARGET#-}" = "$TARGET" ] || { sed -n 2,11p "$0"; exit 2; }
shift
BUILD=1
ARGS=()
for a in "$@"; do [ "$a" = "--no-build" ] && BUILD=0 || ARGS+=("$a"); done

APP_DIR="${NCE_APP_DIR:-/opt/nce-dungeon}"
# 不是 root 登录（如腾讯云 Ubuntu 的 ubuntu 用户）时，服务器上的写操作都加 sudo
SUDO=""; RSYNC_PATH="rsync"
if [ "${TARGET%@*}" != "root" ]; then SUDO="sudo"; RSYNC_PATH="sudo rsync"; fi
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval=30)
if [ -n "${SSHPASS:-}" ]; then
  command -v sshpass >/dev/null || { echo "用密码登录需要先安装 sshpass"; exit 1; }
  SSH=(sshpass -e ssh "${SSH_OPTS[@]}")
  RSH="sshpass -e ssh ${SSH_OPTS[*]}"
else
  SSH=(ssh "${SSH_OPTS[@]}")
  RSH="ssh ${SSH_OPTS[*]}"
fi
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

say "检查能不能连上 $TARGET"
"${SSH[@]}" "$TARGET" 'echo 已连接：$(hostname)；$(. /etc/os-release; echo $PRETTY_NAME)' || {
  echo "连不上。常见原因：云服务器“安全组”没放行 22 端口（或没放行这台开发机的 IP），或密码 / 密钥不对。" >&2
  echo "连不上时可以改用离线包：deploy/make-bundle.sh，把生成的 tgz 拷到服务器，见 docs/DEPLOY.md。" >&2
  exit 1
}

if [ "$BUILD" = 1 ]; then
  say "打包"
  npm run build
fi
[ -f dist/index.html ] || { echo "没有 dist/，请先打包"; exit 1; }
cp -r public/audition dist/ 2>/dev/null || true
find dist/assets/art -name '*.png' -delete 2>/dev/null || true
# 离线缓存的版本号：每次发布都换，玩家才会拿到新版
STAMP="$(date +%Y%m%d%H%M%S)"
sed -i "s/const VER = '[^']*'/const VER = '$STAMP'/" dist/sw.js
[ -f dist/admin.html ] || { echo "dist/ 里缺 admin.html"; exit 1; }

say "上传到 $TARGET:$APP_DIR"
# 目录归登录用户，上传完再由安装脚本改成合适的权限
"${SSH[@]}" "$TARGET" "$SUDO mkdir -p $APP_DIR && $SUDO chown -R \$(id -un) $APP_DIR"
if "${SSH[@]}" "$TARGET" 'command -v rsync >/dev/null'; then
  rsync -az --delete --info=progress2 --rsync-path="$RSYNC_PATH" -e "$RSH" dist/ "$TARGET:$APP_DIR/dist/"
  rsync -az --delete --rsync-path="$RSYNC_PATH" -e "$RSH" server/ "$TARGET:$APP_DIR/server/"
else
  echo "服务器上没有 rsync，改用 tar 传输（会比较慢）"
  tar czf - dist | "${SSH[@]}" "$TARGET" "rm -rf $APP_DIR/dist && tar xzf - -C $APP_DIR"
  tar czf - server | "${SSH[@]}" "$TARGET" "rm -rf $APP_DIR/server && tar xzf - -C $APP_DIR"
fi
"${SSH[@]}" "$TARGET" "cat > $APP_DIR/install-server.sh" < deploy/install-server.sh

say "在服务器上安装 / 重启服务"
"${SSH[@]}" "$TARGET" "$SUDO bash $APP_DIR/install-server.sh ${ARGS[*]:-}"
