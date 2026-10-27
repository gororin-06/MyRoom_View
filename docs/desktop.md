# WindowsデスクトップをMyRoom Viewへ拡張する

表示用Ubuntu VMのブラウザーでspacedesk HTML5 VIEWERを使い、Windowsの追加ディスプレイとして表示する構成です。MyRoom Viewに組み込んだのは、公式ビューアーのローカル導入・表示切り替え・接続設定です。Windows側のディスプレイドライバーは別途必要です。

```text
拡張元Windows PC（spacedesk DRIVER）
  ├ メイン画面
  └ 追加の画面 → 家庭内LAN → Proxmox上の表示VM
                              └ Chromium → MyRoom Viewの拡張画面
```

音楽再生用PCと拡張元PCは同じでも別でも構いません。接続先には、実際に拡張するWindows PCのIPv4アドレスを指定してください。

複数のWindows PCを登録できます。「別のWindows PCを追加」で名前とIPを登録し、「標準の接続先」を選んで保存してください。既存の1台分の設定は引き継がれます。拡張画面の「接続先PC」で、そのとき使うPCを選択します。1枚の表示端末に表示するPCは1台ずつです。接続中にPCを切り替えると、元の接続を閉じます。「拡張画面を開く」で新しいPCに接続してください。接続確認は標準のPCを対象に行います。

HTML5ビューアーは、Windows PC 1台につき同時に1接続までです。別タブや別端末のHTML5ビューアーを先に閉じてください。接続直後の切断が続く場合、MyRoom Viewはビューアーを閉じて確認事項を案内します。

## 1. Windows PCで行うこと

1. [spacedesk公式ダウンロード](https://www.spacedesk.net/download/)から、拡張元PC用の **DRIVER / Primary Machine** を選んで導入します。Viewerアプリとは別です。インストーラーの案内に従い、再起動が求められた場合は作業を保存して再起動してください。
2. spacedesk DRIVER Consoleでサービスを有効にし、PCの家庭内LANのIPv4アドレスを確認します。
3. WindowsとUbuntu表示VMが通信できる同じLANにあることを確認します。Proxmoxでは表示VMのNICを家庭内LANのブリッジへ接続します。
4. Windowsファイアウォールではspacedeskの家庭内ネットワーク通信を許可します。接続確認はTCP 28252への到達確認で、画像の表示や拡張の成功を保証するものではありません。

このリポジトリからWindows用ドライバーを自動インストールすることはありません。対象PCで公式インストーラーを実行してください。

## 2. MyRoom View側のビューアーを導入

MyRoom Viewのサーバー上で実行します。サーバーと表示VMが別の場合も、実行先はMyRoom Viewサーバーです。

```bash
npm run setup:desktop-viewer
```

公式サイトのHTML5ビューアーを `data/spacedesk-viewer/` に保存し、MyRoom Viewの `/viewer/spacedesk/` で配信します。公式サイトのページ保存によるローカル利用の説明に沿う方法です。ローカルの起動ページには、連続切断をMyRoom Viewへ通知するスクリプトの読み込みを追加します。画面の通信内容は読み取り・転送・保存しません。ベンダーのファイルはGitに含めません。初回の取得にはインターネット接続が必要です。

Dockerの場合は、更新後のイメージで次を実行します。

```bash
docker compose up -d --build
docker compose exec myroom-view npm run setup:desktop-viewer
```

`data` ボリュームに保存するため、コンテナを作り直しても保持されます。

## 3. MyRoom Viewから開く

1. 表示端末または設定用PCで `/settings#desktop` を開きます。
2. 「拡張ディスプレイを使う」を有効にして、接続名とWindows PCのIPv4アドレスを保存します。
3. 「保存して接続確認」でspacedeskの接続口への到達を確認できます。サーバーと表示VMが別の場合、これはMyRoom Viewサーバーからの確認です。表示VMからもWindows PCへ到達できる必要があります。
4. 表示用Ubuntu VMで `/desktop` を開くか、本体の「拡張画面」を選び、「拡張画面を開く」を押します。
5. 公式ビューアーがWindows PCへ接続を試みます。ドライバー・ブラウザーの版によっては、ビューアー内で接続や権限の操作が必要です。接続に失敗した場合も、MyRoom Viewは「接続済み」とは表示しません。
6. Windowsの「設定 → システム → ディスプレイ」で、追加されたディスプレイに「表示画面を拡張する」を選び、配置と解像度を調整します。複製を選ぶとミラー表示になります。

上部の「接続を閉じる」でビューアーを破棄します。「MyRoomへ戻る」で室内画面に戻ります。拡張画面を開いている間は、通常の無操作タイムアウト・深夜表示・音楽スクリーンセーバーが作業を中断しないようにします。警報の割り込みは従来どおり優先します。

全画面にする場合はMyRoom View上部の「全画面」を使います。戻る操作や警報も同じブラウザー内に残ります。ブラウザーによってはEscで全画面が解除されます。ビューアー内の全画面機能は使わず、MyRoom Viewの操作を利用してください。

## 制約と確認範囲

- HTML5版はネイティブのWindows・Androidビューアーと機能が異なります。入力、暗号化、画質・遅延、ドライバーの互換性は、導入した版で確認してください。
- この構成は家庭内LANのHTTPで開くMyRoom View向けです。HTTPSページから非TLSの画面通信を開始することはできないため、HTTPSの場合は開始ボタンを無効にして案内を表示します。ブラウザーの安全設定を無効にする操作は行いません。
- MyRoom Viewの設定・表示は家庭内の信頼できるネットワークで利用し、外部へ直接公開しないでください。
- 真の画面拡張にはWindows側の仮想ディスプレイが必要です。RDPで別セッションを開く方式ではありません。
- ローカルでは設定、接続口の確認、ビューアーの表示・破棄、画面復帰をテストできます。開発中のWindows実機テストでは1024×768の映像データを受信できました。表示用Ubuntu VMからの接続と物理モニター上での操作は別途確認が必要です。

公式情報: [HTML5ビューアー](https://manual.spacedesk.net/RunonanyMachineinHTML5Webbrowser.html)、[システム要件](https://manual.spacedesk.net/SystemRequirements1.html)、[同時接続の制限](https://manual.spacedesk.net/Limitations.html)。
