# Nature Remo アクセストークンの取得

1. スマホの Nature Remo アプリでエアコンを登録しておく（設定温度・モードがAPIから取れるようになる）。
2. ブラウザで <https://home.nature.global/> にログイン。
3. 「アクセストークンを発行する（Generate access token）」を押す。
4. 表示されたトークンを `.env` の `NATURE_REMO_TOKEN` に設定。

```env
NATURE_REMO_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 補足
- Cloud API はレート制限（5分あたり30リクエスト）があります。本アプリは60秒間隔でまとめて取得・キャッシュするため、画面を何台開いても外部APIは圧迫しません。
- 室温・湿度・照度は `GET /1/devices`、エアコン状態は `GET /1/appliances`、操作は `POST /1/appliances/{id}/aircon_settings` を使用します。
- 運転モードの表記: `cool`(冷房) / `warm`(暖房) / `dry`(除湿) / `blow`(送風) / `auto`(自動)。対応モードは機種により異なります。
