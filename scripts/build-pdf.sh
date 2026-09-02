#!/usr/bin/env bash
# 從 MANUAL.md 重建 MANUAL.pdf（pandoc + typst + Noto Sans TC）
# 無 root 安裝方式：
#   pandoc 靜態版  → https://github.com/jgm/pandoc/releases        （放 ~/.local/bin）
#   typst 靜態版   → https://github.com/typst/typst/releases        （放 ~/.local/bin）
#   Noto Sans TC   → googlefonts/noto-cjk（NotoSansTC-{Regular,Bold}.otf 放 ~/.local/share/fonts）
set -e
cd "$(dirname "$0")/.."

PANDOC="${PANDOC:-pandoc}"
TYPST="${TYPST:-typst}"
command -v "$PANDOC" >/dev/null || PANDOC="$HOME/.local/bin/pandoc"
command -v "$TYPST" >/dev/null || TYPST="$HOME/.local/bin/typst"
command -v "$PANDOC" >/dev/null || { echo "找不到 pandoc"; exit 1; }
command -v "$TYPST" >/dev/null || { echo "找不到 typst"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# 把 TOC 的 markdown 錨點連結轉為純文字（typst 無對應 label 會報錯）
sed 's/\[\([^]]*\)\](#[^)]*)/\1/g' MANUAL.md > "$TMP/MANUAL.flat.md"

"$PANDOC" "$TMP/MANUAL.flat.md" -o MANUAL.pdf \
  --pdf-engine="$TYPST" \
  -V mainfont="Noto Sans TC" \
  -V sansfont="Noto Sans TC" \
  -V monofont="Noto Sans TC"

echo "已產生 MANUAL.pdf"
