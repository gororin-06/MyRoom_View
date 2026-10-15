# 表示VMの作成（Intel iGPU 単一GPUパススルー）

本構成は **GPUが Intel 内蔵(iGPU) 1個だけ** の Proxmox ホストを前提にします。
その唯一のGPUを表示VMに渡すため、**ホスト本体のローカル画面は出なくなります**。
ホストの管理は別のPC/スマホから **Web UI（`https://<ホストIP>:8006`）/ SSH** で行います（アプライアンス用途では通常の構成）。

> iGPUの完全パススルー(GVT-d)は機種により追加の調整が要ることがあります。うまく映らない場合は末尾のトラブルシュートを参照してください。

## 0. 事前確認（ホストで）
```bash
# iGPU の PCI アドレスとベンダー:デバイスID（例 00:02.0 [8086:4680]）
lspci -nn | grep -iE 'vga|display'
# CPUが Intel であること
lscpu | grep -i 'model name'
```
`00:02.0` と `8086:XXXX` を控えます（XXXX は実機の値）。

## 1. IOMMU を有効化
`/etc/default/grub` の `GRUB_CMDLINE_LINUX_DEFAULT` に追記：
```
intel_iommu=on iommu=pt initcall_blacklist=sysfb_init video=efifb:off video=vesafb:off
```
- `initcall_blacklist=sysfb_init` / `video=*fb:off` … ホストがiGPUの画面バッファを掴んだままにしない（パススンルーに重要）。
```bash
update-grub
```

## 2. iGPU をホストから切り離し、vfio-pci にバインド
`/etc/modules` に追記：
```
vfio
vfio_iommu_type1
vfio_pci
```
`/etc/modprobe.d/vfio.conf`（`8086:XXXX` は手順0の値に置換）：
```
options vfio-pci ids=8086:XXXX
softdep i915 pre: vfio-pci
```
`/etc/modprobe.d/blacklist-i915.conf`：
```
blacklist i915
```
反映して再起動：
```bash
update-initramfs -u -k all
reboot
```
再起動後、ホストのローカル画面は消えます（Web UIで操作）。確認：
```bash
lspci -nnk -s 00:02.0   # Kernel driver in use: vfio-pci になっていればOK
```

## 3. 表示VMを作成
Proxmox Web UI で新規VM：
- **OS**: Debian 12 (netinst) の ISO
- **System**: Machine = `q35`、BIOS = `OVMF (UEFI)`、EFIディスク追加、Display = `Standard VGA`（インストール中のみ。後で `none` 可）
- CPU: `host`、メモリ 2〜4GB、ディスク 16GB 程度で十分

インストール後、**Hardware → Add → PCI Device** で iGPU を追加：
- Device: `0000:00:02.0`
- ✅ All Functions / ✅ PCI-Express
- （必要なら）Advanced で `x-vga=1`

`/etc/pve/qemu-server/<VMID>.conf` 上は概ね：
```
machine: q35
bios: ovmf
hostpci0: 0000:00:02.0,pcie=1
```
※ iGPUは機種により vBIOS(romfile) 指定が必要な場合あり（トラブルシュート参照）。

## 4. 表示VM（Debian）側のセットアップ
```bash
sudo apt update
# i915 はカーネル同梱。最小のWaylandキオスク + Chromium
sudo apt install -y chromium cage seatd
sudo systemctl enable --now seatd
```
自動ログイン＋キオスク起動（例: systemd サービス）：
```ini
# /etc/systemd/system/kiosk.service
[Unit]
Description=MyRoom View Kiosk
After=systemd-user-sessions.service
[Service]
User=kiosk
TTYPath=/dev/tty1
PAMName=login
Environment=XDG_RUNTIME_DIR=/run/user/1000
ExecStart=/usr/bin/cage -- chromium --kiosk --ozone-platform=wayland --touch-events=enabled http://<アプリのIP>:3000/
Restart=always
[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now kiosk
```
- タッチモニターは USB も接続すれば `libinput` が自動認識。
- X11派なら `cage` の代わりに最小X + `chromium --kiosk` でも可（[kiosk.md](kiosk.md)）。

## 5. アプリ本体（MyRoom View）
- 同じ表示VMに同居（`npm start` または Docker、キオスクは `http://localhost:3000/`）
- もしくは **別の LXC コンテナ(Debian)** で動かし、キオスクはそのIPを開く（表示と監視を分離できて安定）

## トラブルシュート（iGPUが映らない時）
- `dmesg | grep -iE 'DMAR|IOMMU'` でIOMMUが有効か確認。
- ホスト側で `lspci -nnk -s 00:02.0` が `vfio-pci` を使っているか確認（`i915`のままなら手順2を見直す）。
- VMが真っ暗：`video=efifb:off` と `initcall_blacklist=sysfb_init` が効いているか、VM Display を一旦 `Standard VGA` にしてOS/ドライバを入れてから iGPU に切替。
- iGPU の vBIOS が必要な機種：GPU-Z等でROM吸い出し → `/usr/share/kvm/` に置き `hostpci0: ...,romfile=xxx.rom`。
- どうしても安定しない場合：**表示専用に中古ミニPC/Raspberry Piを1台**用意し、Proxmoxは Node(LXC) のみ運用、が確実（配線も設定も最小）。
