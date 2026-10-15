# Zabbix 連携（ノードのCPU/メモリ/ディスク・死活）

サービス（Minecraft 等）の死活は本アプリが自前でチェックしますが、**物理ノードのリソース**は Zabbix から取得します。

## 1. API トークンの発行
Zabbix 5.4 以降：
1. Zabbix 管理画面 → **Users → API tokens** → **Create API token**
2. 読み取り権限を持つユーザーに紐付けて発行
3. トークン文字列を控える

## 2. .env に設定
```env
ZABBIX_URL=http://192.168.1.10/zabbix
ZABBIX_TOKEN=xxxxxxxxxxxxxxxxxxxx
```

## 3. 取得内容
`host.get` と `item.get`（JSON-RPC）で以下を取得します。テンプレート依存のため、見つかったキーを使用します。

| 指標 | 参照アイテムキー（例） |
|---|---|
| CPU | `system.cpu.util` |
| メモリ使用率 | `vm.memory.utilization` / `vm.memory.size[pused]` / `pavailable` |
| ディスク使用率 | `vfs.fs.size[/,pused]` |
| 死活 | host の `available` |

表示するホストは設定画面（/settings → Zabbix ホスト）でオン/オフできます。

## 稼働率(uptime)について
- サービスの**30日稼働率**は本アプリの自前TCPチェック履歴から算出します。
- **運用開始から1ヶ月未満は「集計中」**（データが貯まるまで％を出しません）。
- ノード自体の稼働率を Zabbix の SLA から出したい場合は `service.getsla` 連携で拡張可能です（今後）。
