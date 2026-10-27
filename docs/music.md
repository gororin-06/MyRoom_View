# 音楽操作：YouTube MusicをWindows PCから再生する

MyRoom Viewの「音楽」タブから、Music Assistantに登録した音楽サービスとライブラリーを検索し、再生先を選択して操作できます。音声はMusic Assistantから再生PCへ送られます。表示用Ubuntu VMに音声デバイスを割り当てる必要はありません。

## 構成

```text
Proxmox
├ 表示用VM（Ubuntu等）：ChromiumでMyRoom Viewを表示
├ MyRoom Viewサーバー（表示用VMに同居していても可）
└ 音楽管理用VM（Linux）：Music Assistant＋YouTube Music認証用PO Tokenサーバー
                                  │ 家庭内LAN
                                  ▼
                         Windows 11 Pro
                         Music Assistant公式アプリ
                                  │ 音声端子／USB DAC
                                  ▼
                         有線アクティブスピーカー
                         （パッシブスピーカーにはアンプが必要）
```

Music AssistantはMyRoom Viewとは別のサービスです。MyRoom Viewを起動するだけではインストールされません。Home Assistantは必須ではありません。

## 1. Music Assistantを用意する

Proxmox内のLinux VMに、[Music Assistant公式の導入手順](https://www.music-assistant.io/installation/)に沿ってサーバーを導入します。Dockerで動かす場合は、再生機器の検出のため公式指定のhostネットワークまたはmacvlanネットワークを使います。ProxmoxのVMもWindows PCと通信できるLANに接続してください。

通常は `http://<Music AssistantのVMのIP>:8095` を開き、初期ユーザーを作成します。MyRoom ViewのURL（3000番ポート）とは別です。

## 2. YouTube Musicを登録する

[公式のYouTube Music連携手順](https://www.music-assistant.io/music-providers/youtube-music/)に沿って、Music Assistant側で設定します。

- YouTube Premium／YouTube Music Premiumのアカウントが必要です。
- 公式手順が指定するPO Tokenサーバーを導入し、そのURLを登録します。対応バージョンは公式手順を確認してください。
- YouTube MusicのログインCookieを、Music Assistantの音楽ソース設定に登録します。
- CookieはMyRoom Viewへ入力しません。連携は非公式のため、YouTube側の変更やCookieの期限切れで再設定が必要になる場合があります。

最初にMusic Assistant自身の画面で検索できることを確認してください。

## 3. Windows 11 Proを再生先にする

1. [Music Assistant公式デスクトップアプリ](https://github.com/music-assistant/desktop-app/releases)のWindows向け `.msi` または `.exe` をインストールします。
2. アプリから上記Music Assistantサーバーへ接続し、必要に応じてログインします。
3. 再生プレイヤーを有効にし、Windowsの音声端子／USB DACなど、スピーカーを接続した出力先を選びます。設定名はアプリの版によって変わる場合があります。
4. Music Assistant側にWindowsのプレイヤーが現れ、曲を再生できることを確認します。
5. 常用する場合はアプリの自動起動を有効にし、Windowsの電源設定で電源接続時の自動スリープを無効にします。Windowsへのサインインとアプリの起動が必要です。

機器検出に失敗する場合は同じLANにいるかを確認し、Windowsファイアウォールでは必要なアプリの家庭内ネットワーク通信を許可します。ファイアウォール全体を無効にする必要はありません。Sendspinとデスクトップアプリは開発中のため、まずこの段階で音出しを確認します。

## 4. MyRoom Viewから接続する

1. Music Assistantのユーザープロフィール／セキュリティ設定で、長期アクセストークンを作成します。曲の読み取り、プレイヤーの読み取り・操作、キューの操作ができるユーザーを使います。
2. MyRoom Viewの `http://<MyRoom ViewのIP>:3000/settings#music` を開き、「音楽と再生先」を選びます。設定はカテゴリ別に切り替えられます。
3. 「音楽機能を使う」をオンにし、Music AssistantのサーバーURLと長期アクセストークンを入力して「保存して接続確認」を押します。URLには `/api` を付けません。サーバー自身から到達できるVMのLAN IPを指定します。
4. 「いつもの再生先」にWindows PCを選択し、「保存」を押します。
5. 本体画面をタッチして「音楽」を開きます。`http://<MyRoom ViewのIP>:3000/music` から直接開くこともできます。曲・アルバム・プレイリストの種類を選んで検索し、再生ボタンを押します。

音楽画面はYouTube Musicに近い黒基調の画面です。上部で検索、左側で画面の切り替え、下部のプレイヤーで再生・音量の操作を行います。右上または下部のデバイスボタンから再生先を選べます。画像や再生時間はMusic Assistantから取得できた場合に表示します。

接続先を変更するときは、その接続先用のトークンを再入力します。同じ接続先でトークン欄を空にすると既存の値を保持します。削除するときは接続を無効にして「登録済みトークンを削除する」にチェックして保存します。

検索はMusic Assistantに登録済みのサービスとライブラリーが対象です。検索結果の「再生」は選択した再生先のキューを置き換えます。プレイリストも同じ操作で再生できます。検索は最大25件／回です。

再生先の選択だけでは再生中の曲は移動しません。切替後に曲を選び直します。Windowsがオフラインのときは操作を無効にし、PCの起動後に「再生先を更新」で再取得できます。表示中の状態は5秒ごとに更新します。

Ubuntuキオスクで日本語を入力する場合は、OSのソフトウェアキーボードと日本語入力環境を用意してください。

## 音楽再生中のスクリーンセーバー

Music Assistantに接続した、選択中の再生先が再生中になると、待機画面は通常のスライドショーから音楽専用レイアウトへ自動的に切り替わります。操作画面を閉じている間も再生状態を5秒ごとに確認します。

- ジャケット・曲名・アーティスト・再生デバイスを大きく表示し、時計と日付は右上に小さく表示します。
- 取得できる場合は再生位置と曲の長さも表示します。ジャケットがない場合はレコードのイラストを使います。
- 画面をタッチすると、そのまま音楽の操作画面を開きます。無操作で待機画面へ戻る時間は既存の「操作後に戻るまで」の設定に従います。
- 一時停止・停止・再生先のオフライン・サーバーとの接続失敗時は通常の待機画面へ戻ります。
- 深夜モードの時間中は音楽専用レイアウトを暗くします。音楽が停止すると通常の深夜の時計表示に戻ります。災害情報の割り込みは音楽の表示より優先します。

`/settings#display` の「音楽再生中のスクリーンセーバー」で切り替えをオフにできます。初期状態はオンです。表示端末でページを表示している間に動作する機能で、Windowsで再生している任意のアプリの音声を検出する機能ではありません。

## 保存とネットワーク

接続情報はサーバーの `data/music-assistant.json` に保存され、Gitの対象外です。トークンはブラウザーへの設定取得レスポンス、`/api/state`、SSEには含めません。Dockerの場合は既存のdataボリュームで保持します。

MyRoom Viewの設定画面は従来どおりログイン機能を持たないため、家庭内の信頼できるネットワークで使ってください。MyRoom ViewのAPIからMusic Assistantの任意のコマンドを実行することはできず、音楽操作に必要な機能だけを中継します。

この変更を本番へ取り込むまでは、試用環境の自動アップデートをオフにしてください。上流のリリースへの自動切替でローカルの変更が使われなくなるのを防ぎます。

## ローカル確認

```bash
npm ci
npm test
npm start
```

`npm test` はローカルの模擬Music Assistant HTTPサーバーを使います。実際のGoogleアカウント、スピーカー、Music Assistantは不要です。検索・プレイリスト再生・音量・トークン保持と非公開・オフライン・認証エラー・不正入力・タイムアウトを確認します。

通信形式は[Music Assistant HTTP API](https://www.music-assistant.io/api/)と公式サーバーの実装に合わせています。実機では導入したMusic Assistantのバージョンで接続確認が必要です。
