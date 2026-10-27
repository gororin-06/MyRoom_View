# MyRoom View

未使用モニターを使った、室温・エアコン・天気・自宅サーバー・災害情報のスマートディスプレイ。

## できること

  * デスクトップ拡張（spacedesk連携）：Windows PCの追加画面を表示VMで受信し、MyRoom Viewへ切り替え。[導入手順](docs/desktop.md)を参照。

  * 音楽操作（Music Assistant連携）：曲・アルバム・プレイリスト検索、再生先選択、再生/一時停止・停止・前後の曲・音量。Windows PCでの再生は[音楽のセットアップ](docs/music.md)を参照。
  * 音楽再生中の待機画面：大きなジャケット・曲名と、小さな時計を表示。停止時は通常のスライドショーへ復帰（設定で切替可）。

- **室温・湿度・照度**の表示（Nature Remo）
- **エアコン操作**（ON/OFF・設定温度・運転モード・風量）
- **天気**（気象庁API・無料。地域は設定可）
- **自宅サーバー監視**
  - ノード（物理サーバー）の CPU/メモリ/ディスク・死活 … **Zabbix** から取得
  - サービス（Minecraft, voice-tts など）の死活・Ping・**30日稼働率** … 指定ポートを**自前でTCPチェック**
- **災害情報の割り込み表示**（警報クラス以上）
  - 地震：関東・千葉中心の実地図（Leaflet + GeoJSON）に市区町村の震度を表示（震度3以上かつ市原市・千葉市が揺れたとき）
  - 台風：進路・暴風域を地図に表示
- **スライドショー**（大時計 → 天気 → 室内 → サーバー、無操作時に自動巡回）
- **深夜モード**（既定 0:00〜6:00 は真っ黒＋薄い時計のみ）
- **別端末から設定**（スマホ/PC で `http://<ip>:3000/settings`）
- **自動アップデート**（GitHub Releases）

## 画面

- `http://<ip>:3000/` … ディスプレイ本体（キオスク全画面）
- `http://<ip>:3000/settings` … 設定画面（スマホ/PC 向け）

## クイックスタート

```bash
cp .env.example .env     # 値を設定（Nature Remo トークン等）
npm install
npm start                # http://localhost:3000
```

Docker:

```bash
cp .env.example .env
docker compose up -d
```

地図の市区町村データ（任意・震度の塗り分け用）:

```bash
npm run fetch:geo        # 千葉県の GeoJSON を取得
```

## 設定（.env）

| 変数 | 説明 |
|---|---|
| `NATURE_REMO_TOKEN` | Nature Remo アクセストークン（[取得方法](docs/nature-remo.md)） |
| `JMA_AREA_CODE` | 天気の地域コード（千葉=120000） |
| `QUAKE_WATCH_CITIES` | 地震を表示する対象市区町村（既定 市原市,千葉市） |
| `QUAKE_MIN_INTENSITY` | 地震を表示する最小震度（既定 3） |
| `ZABBIX_URL` / `ZABBIX_TOKEN` | Zabbix 連携（[手順](docs/zabbix.md)） |
| `AUTO_UPDATE` | 自動アップデートの有効/無効 |

## ドキュメント

  * [音楽・YouTube Music・Windows再生PC](docs/music.md)

- [セットアップ](docs/setup.md)
- [Nature Remo トークン取得](docs/nature-remo.md)
- [Zabbix 連携](docs/zabbix.md)
- [GeoJSON（地図データ）](docs/geojson.md)
- [Proxmox GPU パススルー](docs/proxmox-gpu-passthrough.md)
- [キオスク表示（自動全画面）](docs/kiosk.md)
- [自動アップデート](docs/update.md)

## 構成

```
server/   Node.js (Fastify) — API・外部連携・ポーリング・自前監視
web/      フロント（素のHTML/CSS/JS + Leaflet）。/ = 本体, /settings = 設定
docs/     セットアップ手順
scripts/  GeoJSON 取得スクリプト
```
