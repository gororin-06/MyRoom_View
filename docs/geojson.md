# 地図データ（GeoJSON）

災害情報の地図は **Leaflet + OpenStreetMap タイル**（実地図）で描画します。
地震の**市区町村ごとの震度塗り分け**には、千葉県の市区町村ポリゴン GeoJSON を使います。

## 取得
ご自宅のネットワーク（外部に到達できる環境）で：
```bash
npm run fetch:geo
# → web/public/geo/chiba.geojson に保存
```
別の取得元を使う場合：
```bash
GEO_URL="https://example.com/chiba.geojson" npm run fetch:geo
```

## 必要なプロパティ
各 feature（市区町村）に名前が入っていること。以下のキーに対応しています：
- `properties.N03_004`（国土数値情報・行政区域）
- `properties.name`
- `properties.CITY_NAME`

## 取得元の例
- 国土数値情報「行政区域」（千葉県=コード12）
- CODH / uedayou.net などの変換済み GeoJSON

## 無くても動く
`chiba.geojson` が無い場合でも、地図は OSM 実地図＋市原市・千葉市のマーカー＋各地の震度リストで表示されます。塗り分けを使いたいときだけ取得してください。

## オフライン運用
キオスクがオフラインだと OSM タイルが読めません。完全オフラインにしたい場合は、タイルをローカルにキャッシュする（例: tile server / mbtiles）か、GeoJSON のみで描画するモードに切り替えてください（拡張予定）。
