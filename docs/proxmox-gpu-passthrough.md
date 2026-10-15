# Proxmox で表示VMを作る（GPU + USBタッチ パススルー）

モニターへHDMI出力し、タッチ操作するため、GPU と USB を表示VMにパススルーします。
（実機での設定が必要な領域です。手順に沿って設定してください。）

## 1. IOMMU を有効化
`/etc/default/grub` の `GRUB_CMDLINE_LINUX_DEFAULT` に追記：
- Intel: `intel_iommu=on iommu=pt`
- AMD: `amd_iommu=on iommu=pt`
```bash
update-grub && reboot
```
確認：
```bash
dmesg | grep -e DMAR -e IOMMU
```

## 2. vfio モジュール
`/etc/modules` に追記：
```
vfio
vfio_iommu_type1
vfio_pci
vfio_virqfd
```
（ホスト側GPUドライバを使わせない場合は該当GPUを vfio-pci にバインド）

## 3. GPU をVMへ
Proxmox GUI → VM → **Hardware → Add → PCI Device** → GPU を選択（`All Functions`、`Primary GPU` は環境に応じて）。
- VM の表示は `Display: none` にして物理GPU出力を使う構成が安定。

## 4. USBタッチをVMへ
タッチモニターのUSBを接続し、
Proxmox GUI → VM → **Hardware → Add → USB Device**
- まず「Use USB Vendor/Device ID」でタッチパネルのデバイスだけを割当（手軽）
- 認識が不安定なら「USB コントローラごと」PCIパススルー

## 5. VM 側 OS
- 軽量 Linux（Debian/Ubuntu + 最小GUI、または Chromium OS 系）をインストール
- タッチは多くの場合 `libinput` で自動認識。ずれる場合は `xinput_calibrator` 等で補正
- 本アプリは別サーバーでもVM内でも可。表示VMは Chromium キオスクで `http://<ip>:3000/` を開く（[kiosk.md](kiosk.md)）

> 非タッチモニターの場合は、別端末（スマホ/PC）から `/settings` と操作を行う運用が簡単です。
