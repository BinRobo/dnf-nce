#!/usr/bin/env bash
# 打一个离线安装包（连不上服务器、或想自己拷过去时用）。
# 生成 release/nce-dungeon-bundle-<日期>.tgz，里面是 dist/ server/ install-server.sh。
# 在服务器上：
#   mkdir -p /opt/nce-dungeon && tar xzf nce-dungeon-bundle-*.tgz -C /opt/nce-dungeon
#   bash /opt/nce-dungeon/install-server.sh            # 参数同 install-server.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ "${1:-}" = "--no-build" ] || npm run build
cp -r public/audition dist/ 2>/dev/null || true
find dist/assets/art -name '*.png' -delete 2>/dev/null || true
sed -i "s/const VER = '[^']*'/const VER = '$(date +%Y%m%d%H%M%S)'/" dist/sw.js
[ -f dist/admin.html ] && [ -f dist/index.html ] || { echo "dist/ 不完整"; exit 1; }
mkdir -p release
STAGE="$(mktemp -d)"
cp -r dist server "$STAGE/"
cp deploy/install-server.sh "$STAGE/"
OUT="release/nce-dungeon-bundle-$(date +%Y%m%d).tgz"
tar czf "$OUT" -C "$STAGE" dist server install-server.sh
rm -rf "$STAGE"
ls -lh "$OUT"
echo "校验和：$(sha256sum "$OUT" | awk '{print $1}')"
