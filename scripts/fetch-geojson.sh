#!/usr/bin/env bash
# 千葉県の市区町村 GeoJSON を取得して web/public/geo/chiba.geojson に保存する。
# 震度マップの塗り分けに使用（feature.properties.N03_004 = 市区町村名 を参照）。
# ご自宅のネットワーク（外部に到達できる環境）で実行してください。
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="web/public/geo/chiba.geojson"
mkdir -p web/public/geo

# 取得元（既定: 国土数値情報 行政区域 2023 / CODH 変換。環境変数 GEO_URL で上書き可）
# 千葉県=12。市区町村ポリゴンに properties.N03_004（市区町村名）が入っています。
GEO_URL="${GEO_URL:-https://geoshape.ex.nii.ac.jp/city/geojson/2023/12/12_2023.geojson}"

echo "GeoJSON を取得: $GEO_URL"
if command -v curl >/dev/null; then
  curl -fSL "$GEO_URL" -o "$OUT"
else
  wget -O "$OUT" "$GEO_URL"
fi
echo "保存しました: $OUT ($(wc -c <"$OUT") bytes)"
echo "※ 取得元により properties のキー名が異なる場合があります（N03_004 / name / CITY_NAME に対応済み）。"
