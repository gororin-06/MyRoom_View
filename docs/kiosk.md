# キオスク表示（Chromium 全画面・自動起動）

表示VM/PC で、起動時に自動でブラウザを全画面表示します。

## Chromium キオスク（Linux）
```bash
chromium --kiosk --noerrordialogs --disable-infobars \
  --incognito --check-for-update-interval=31536000 \
  --touch-events=enabled \
  "http://localhost:3000/"
```
- タッチモニターなら `--touch-events=enabled` を付与。
- 画面のスリープ/スクリーンセーバーを無効化：
```bash
xset s off; xset -dpms; xset s noblank
```

## 自動起動（例: systemd --user / autostart）
`~/.config/autostart/myroom-kiosk.desktop`:
```ini
[Desktop Entry]
Type=Application
Name=MyRoom Kiosk
Exec=chromium --kiosk --touch-events=enabled http://localhost:3000/
X-GNOME-Autostart-enabled=true
```

## 深夜モードについて
アプリ側で 0:00〜6:00（設定変更可）に自動で暗い時計表示へ切り替わるため、OSの画面オフは任意です。

## ソフトウェアキーボード
キオスクでの文字入力が必要な場合は OS の仮想キーボード（`onboard` 等）を使えますが、
**設定はスマホ/PCから `/settings` を開く**のが確実です（日本語入力も快適）。
