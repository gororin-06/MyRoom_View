// Zabbix API (JSON-RPC) クライアント。ノード(物理サーバー)のCPU/メモリ/ディスク・死活を取得。
import { config } from "../config.js";

let rpcId = 1;

async function rpc(method, params) {
  if (!config.zabbix.url || !config.zabbix.token) throw new Error("Zabbix 未設定");
  const url = config.zabbix.url.replace(/\/$/, "") + "/api_jsonrpc.php";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json-rpc", Authorization: `Bearer ${config.zabbix.token}` },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: rpcId++ }),
  });
  if (!res.ok) throw new Error(`Zabbix HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`Zabbix: ${j.error.data || j.error.message}`);
  return j.result;
}

// よく使われるアイテムキー（テンプレート依存。見つかったものを使う）
const KEYS = {
  cpu: ["system.cpu.util", "system.cpu.util[,user]"],
  memPused: ["vm.memory.utilization", "vm.memory.size[pused]"],
  memPavail: ["vm.memory.size[pavailable]", "vm.memory.size[available]"],
  diskPused: ["vfs.fs.size[/,pused]", "vfs.fs.dependent.size[/,pused]"],
};

function pick(items, keys) {
  for (const k of keys) {
    const it = items.find((i) => i.key_ === k || i.key_.startsWith(k.split("[")[0]));
    if (it && it.lastvalue !== undefined) return Number(it.lastvalue);
  }
  return null;
}

/** 監視ホスト一覧をメトリクス付きで返す */
export async function getNodes() {
  const hosts = await rpc("host.get", {
    output: ["hostid", "name", "status", "available"],
    selectInterfaces: ["ip"],
    filter: { status: 0 }, // 有効なホスト
  });

  const hostids = hosts.map((h) => h.hostid);
  const items = hostids.length
    ? await rpc("item.get", { output: ["hostid", "key_", "lastvalue", "name"], hostids })
    : [];
  const byHost = {};
  for (const it of items) (byHost[it.hostid] ||= []).push(it);

  return hosts.map((h) => {
    const its = byHost[h.hostid] || [];
    const memPused = pick(its, KEYS.memPused) ?? (() => {
      const avail = pick(its, KEYS.memPavail);
      return avail != null ? Math.round(100 - avail) : null;
    })();
    return {
      hostid: h.hostid,
      name: h.name,
      ip: h.interfaces?.[0]?.ip || null,
      up: h.available === "1" || h.available === 1,
      cpu: round(pick(its, KEYS.cpu)),
      mem: round(memPused),
      disk: round(pick(its, KEYS.diskPused)),
    };
  });
}

function round(v) {
  return v == null || Number.isNaN(v) ? null : Math.round(v);
}
