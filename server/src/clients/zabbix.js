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

// ここで扱う指標はすべて割合(0〜100%)。完全一致を優先し、見つからなければ
// 同じベースキーの候補を走査する。バイト数など 0〜100 の範囲外の値は誤マッチ
// とみなして除外する（例: vfs.fs.size[/,total] を使用率として拾ってしまう事故を防ぐ）。
function pick(items, keys) {
  for (const k of keys) {
    const base = k.split("[")[0];
    const cands = items
      .filter((i) => i.key_ === k)
      .concat(items.filter((i) => i.key_ !== k && i.key_.startsWith(base)));
    for (const it of cands) {
      if (it.lastvalue === undefined || it.lastvalue === "") continue;
      const v = Number(it.lastvalue);
      if (Number.isFinite(v) && v >= 0 && v <= 100) return v;
    }
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
