# 自動アップデート（GitHub Releases）

GitHub に新しいリリースが公開されると、自動で取得・展開・再起動します。

## 仕組み
1. 6時間ごと（`config.intervals.update`）に GitHub Releases API で最新タグを確認
2. 現行バージョン（`package.json` の version）より新しければ適用
3. 再起動して反映（失敗時はログに記録）

## 適用方法（運用形態で自動分岐）
- **git 運用**: `git fetch --tags && git checkout <tag> && npm ci --omit=dev` → プロセス終了（systemd 等が再起動）
- **Docker 運用**: `docker compose pull && docker compose up -d`

## 設定
```env
GITHUB_REPO=gororin-06/MyRoom_View
AUTO_UPDATE=true
```
- 設定画面（/settings → アップデート）で ON/OFF と「今すぐ確認」が可能。
- 手動確認: `POST /api/update/check`

## リリースの作り方（配布側）
- セマンティックバージョニングのタグ（例 `v1.2.0`）で Release を作成。
- Docker 配布の場合はイメージを push し、`docker-compose.yml` のタグを運用に合わせて調整。

## 注意
- 自動で本番を入れ替えるため、重要環境では段階導入を推奨。
- 失敗時のロールバック（前タグへ戻す）は今後の拡張ポイント。
