#!/usr/bin/env bash
# Builds review sheets: one row of 4 photos per bird, 5 birds per sheet, in species.json order.
# Usage: tools/contact-sheets.sh <ffmpeg.exe> <out-dir>
set -euo pipefail
FF="$1"; OUT="$2"
cd "$(dirname "$0")/../app"
mkdir -p "$OUT"
ids=$(node -e "require('./data/birds.json').forEach(b => console.log(b.id))")
rows=()
for id in $ids; do
  inputs=(); filters=""
  for i in 0 1 2 3; do
    f=$(node -e "const b=require('./data/birds.json').find(b=>b.id==='$id'); console.log((b.photos[$i]||b.photos[0]).src)")
    inputs+=(-i "$f")
    filters+="[$i:v]scale=300:225:force_original_aspect_ratio=increase,crop=300:225[p$i];"
  done
  "$FF" -y -loglevel error "${inputs[@]}" -filter_complex "${filters}[p0][p1][p2][p3]hstack=4" "$OUT/row-$id.jpg"
  rows+=("$OUT/row-$id.jpg")
done
n=0
for ((s=0; s<${#rows[@]}; s+=5)); do
  chunk=("${rows[@]:s:5}"); args=()
  for r in "${chunk[@]}"; do args+=(-i "$r"); done
  "$FF" -y -loglevel error "${args[@]}" -filter_complex "vstack=${#chunk[@]}" "$OUT/sheet-$n.jpg"
  n=$((n+1))
done
echo "Wrote $n sheets to $OUT"
