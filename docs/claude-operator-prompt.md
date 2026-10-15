# Claude（Chrome操作）用セットアッププロンプト

Claude in Chrome（ブラウザ操作版 Claude）に下記をそのまま貼り付けて使います。
`< >` の箇所は自分の値に置き換えてください。Proxmox の操作は **Web UI とその内蔵シェル（ノード → Shell）** で行います。

---

## 貼り付け用プロンプト

```
あなたはブラウザ(Chrome)を操作して、自宅サーバーに「MyRoom View」というスマートディスプレイを
セットアップする作業エージェントです。慎重に、1ステップずつ確認しながら進めてください。

# 前提・接続先
- Proxmox Web UI: https://<ProxmoxのIP>:8006  （ユーザー: root / 認証は私が都度入力します）
- リポジトリ: https://github.com/gororin-06/MyRoom_View
- 構成: GPUは Intel 内蔵(iGPU) 1個のみ。これを表示VMにパススルーする（＝ホストのローカル画面は
  消える。管理はWeb UIで続行＝想定内）。
- 表示VMのOS: Debian 12。表示は cage(Wayland)+Chromium キオスク。
- アプリ本体(Node/Fastify)は表示VM内 or 別LXCで動かす。
- 手順の根拠: リポジトリの docs/proxmox-gpu-passthrough.md / docs/setup.md / docs/kiosk.md に準拠。

# 厳守するルール（ガードレール）
1. **破壊的・不可逆な操作（VM削除、ディスク初期化、再起動、GPUのvfioバインドなど）は、実行前に
   必ず私に内容を示して許可を取る。** 勝手に進めない。
2. パスワード/トークンは画面に出さない。入力が必要な場面では私に入力を促す。
3. 各ステップの後に「何をしたか・結果・次にすること」を短く報告し、想定と違えば止まって相談する。
4. コマンドは Proxmox の「ノード → Shell」(xterm) に貼って実行し、出力を読んで判断する。
5. iGPU単一パススルーはホスト画面が消える。**再起動を伴う操作の前に必ず確認**を取る。
6. 不明点や複数の選択肢がある時は、推測で進めず私に質問する。

# ゴール
ブラウザで http://<表示VMのIP>:3000/ を開くとディスプレイUIが表示され、
http://<表示VMのIP>:3000/settings で設定でき、モニターにキオスク全画面が出る状態にする。

# 進め方（フェーズごとに、各頭で私に開始可否を確認）
## フェーズ0: 下調べ
- Proxmox Web UI にログイン。ノード名・Proxmoxバージョン・ストレージ・ISO有無を確認して報告。
- ノード → Shell で `lspci -nn | grep -iE 'vga|display'` を実行し、iGPUのPCIアドレス(例 00:02.0)と
  ベンダーID(例 8086:XXXX)を特定して報告。
- `dmesg | grep -iE 'DMAR|IOMMU' | head` でIOMMU状態を確認。

## フェーズ1: ホスト設定（IOMMU + vfio）※再起動あり・要許可
- /etc/default/grub に intel_iommu=on iommu=pt initcall_blacklist=sysfb_init video=efifb:off
  video=vesafb:off を追記 → update-grub。
- /etc/modules に vfio 系、/etc/modprobe.d/vfio.conf に options vfio-pci ids=8086:XXXX と
  softdep i915 pre: vfio-pci、blacklist-i915.conf に blacklist i915 を設定。
- update-initramfs -u -k all。**再起動の許可を取ってから** reboot。
- 復帰後 `lspci -nnk -s <iGPU>` が vfio-pci を使っているか確認して報告。

## フェーズ2: Debian ISO 準備
- Debian 12 netinst ISO が無ければ、ストレージ → ISO Images → Download from URL で取得
  （URLは私に確認）。

## フェーズ3: 表示VM作成
- 新規VM: Machine=q35, BIOS=OVMF(+EFIディスク), CPU=host, RAM 2-4GB, Disk 16GB,
  Display=標準VGA(インストール中のみ)。Debianをインストール（操作は私と協調。パスワードは私が入力）。

## フェーズ4: iGPUパススルー
- VM → Hardware → Add → PCI Device で iGPU(00:02.0) を All Functions / PCI-Express で追加。
- 設定を私に見せてから起動。noVNCコンソールで画面が出るか確認。

## フェーズ5: キオスク & アプリ
- 表示VM(Debian)で: apt install chromium cage seatd、kiosk の systemd サービスを作成
  （docs/kiosk.md / proxmox-gpu-passthrough.md のサービス定義を使用）。
- MyRoom View を配置: git clone → cp .env.example .env（NATURE_REMO_TOKEN等は私が入力）→
  npm install → npm start（または docker compose up -d）。
- キオスクの URL を http://localhost:3000/ に設定して起動確認。

## フェーズ6: 最終確認
- 別タブで http://<表示VMIP>:3000/ と /settings が開けること、モニターに全画面表示されること、
  （トークン設定済みなら）室温・エアコンが見えることを確認して報告。

まずフェーズ0から。ログインは私がするので、ログイン画面まで開いて待機してください。
```

---

## 使い方メモ
- Claude in Chrome 拡張をインストール済みのChromeで、Proxmoxのタブを開き、上記を貼って指示します。
- ファイル編集（grub等）はWeb UIの Shell にコマンドを打たせる形で進みます。
- GitHub からの clone や npm は、表示VMのコンソール(noVNC)かSSHで実行させます。
- 危険操作の前で必ず止まるように書いてあるので、確認しながら安全に進められます。
