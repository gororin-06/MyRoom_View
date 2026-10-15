# セットアップ

## 1. 準備するもの
- 表示用コンピュータ（Proxmox VM / 古いPC / Raspberry Pi など）
- 未使用モニター（タッチ対応なら HDMI + USB の2本接続でタッチ操作可）
- Nature Remo（室温センサー＋エアコンIR操作）
- （任意）Zabbix（ノードのCPU/メモリ等の監視）

## 2. インストール
```bash
git clone https://github.com/gororin-06/MyRoom_View.git
cd MyRoom_View
cp .env.example .env
# .env を編集（最低限 NATURE_REMO_TOKEN）
npm install
npm start
```
ブラウザで `http://<サーバーIP>:3000/` を開く。設定は `http://<サーバーIP>:3000/settings`。

## 3. Docker で動かす
```bash
docker compose up -d
docker compose logs -f
```
LAN内ホストへの自前監視（TCPチェック）が通らない場合は `docker-compose.yml` の `network_mode: host` を有効化。

## 4. 常時起動
- Docker: `restart: unless-stopped`（既定）
- bare: systemd サービス化（例）
```ini
# /etc/systemd/system/myroom-view.service
[Unit]
Description=MyRoom View
After=network-online.target
[Service]
WorkingDirectory=/opt/MyRoom_View
ExecStart=/usr/bin/node server/src/index.js
Restart=always
EnvironmentFile=/opt/MyRoom_View/.env
[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now myroom-view
```

## 5. キオスク全画面表示
[kiosk.md](kiosk.md) を参照。
