// 自前のサービス死活チェック（Zabbixに無いサービス）。指定ホスト:ポートへTCP接続して
// 成否=死活、接続所要時間=Ping(ms) とし、uptimeStore に記録する。
import net from "node:net";
import { getSettings, isMatured } from "../settings.js";
import * as uptimeStore from "./uptimeStore.js";

export function tcpCheck(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const start = performance.now();
    const sock = new net.Socket();
    let done = false;
    const finish = (up) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ up, ping: up ? Math.round(performance.now() - start) : null });
    };
    sock.setTimeout(timeout);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(port, host);
  });
}

/** 設定上の全サービスをチェックして結果配列を返す */
export async function checkAll() {
  const { servers } = getSettings();
  const matured = isMatured();
  const results = [];
  for (const srv of servers || []) {
    const services = [];
    for (const svc of srv.services || []) {
      // サービス個別の host 指定があればそれを、無ければサーバーの host を使う
      // （設定画面で「IP:ポート」と入力すると svc.host が入る）。
      const host = svc.host || srv.host;
      if (!svc.port || !host) {
        services.push({ name: svc.name, host: host || null, port: svc.port || null, up: null, ping: null, uptime: null });
        continue;
      }
      const key = `${host}:${svc.port}`;
      const r = await tcpCheck(host, svc.port);
      uptimeStore.record(key, r.up);
      services.push({
        name: svc.name,
        host,
        port: svc.port,
        up: r.up,
        ping: r.ping,
        uptime: matured ? uptimeStore.uptime30(key) : null, // 1ヶ月未満は null（＝集計中）
      });
    }
    results.push({ host: srv.host, name: srv.name, services });
  }
  return { matured, servers: results };
}
