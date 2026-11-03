/* 弱電工程設計編表：中央監控 IO 模組表、設備 IP 編表、三層式網路與交換器埠數、線材估算、配線圖資料。
 * 輸入為圖面數量分析結果（各樓層設備數量），所有規則與參數都可由專案覆寫。純函式。 */
(function (root) {
"use strict";

var DEFAULTS = {
  baseNet: "10.10",          /* 前兩段，VLAN 依序取第三段 */
  spare: 0.15,               /* IO 與交換器預留比例 */
  growth: 0.3,               /* IP 網段成長預留 */
  floorHeight: 3.2,          /* 樓高（公尺） */
  avgRun: 25,                /* 樓層內平均水平配線長度（公尺） */
  slack: 1.15,               /* 線材損耗與預留 */
  distGroup: 5,              /* 每幾層設一台匯聚交換器 */
  coreFloor: "1F",           /* 核心機房所在樓層 */
  separateCctv: true         /* 影像監視使用獨立 PoE 交換器（頻寬大，建議實體分離） */
};

/* IO 整合：每種設備佔幾個 DI／DO 點（diL／doL 為各點名稱）。
 * 依公司做法：磁簧、緊急求救鈕、泵浦、風機、一氧化碳、燈光、高低水位、漏水、淹水等走 IO 整合（住戶與公共都算）；
 * 電表、水表、消防、空調、電梯、對講、攝影機等走通訊整合，不佔 IO 點。 */
var IO_RULES = [
  [/對講|攝影機|讀卡機/, null],
  [/磁簧/, { di: 1 }],
  [/押扣|壓扣|求救按鈕|求救鈕/, { di: 1 }],
  [/泵|幫浦|揚水|污水|抽水|動力監視|端末器/, { di: 2, diL: ["運轉", "故障"] }],
  [/風機|排風|送風|進風/, { di: 2, diL: ["運轉", "故障"] }],
  [/發電機/, { di: 2, diL: ["運轉", "故障"] }],
  [/鐵捲門/, { di: 1, diL: ["門位"] }],
  [/一氧化碳/, { di: 1 }],
  [/燈光|照明|燈控|燈具迴路/, { di: 1, do: 1, diL: ["狀態"], doL: ["控制"] }],
  [/液位|水位/, { di: 2, diL: ["高水位", "低水位"] }],
  [/漏水/, { di: 1 }],
  [/淹水/, { di: 1 }],
  [/水箱蓋|油位|微動開關/, { di: 1 }],
  [/地震|土壤|玻璃破碎|紅外線偵測/, { di: 1, note: "請確認接點型式" }]
];
/* 通訊整合（不佔 IO 點）：以通訊協定／閘道器整合 */
var COMM_RULES = [
  ["攝影", /攝影機|錄影/], ["對講", /對講|門口機|門口子機|室內機|智慧家庭/], ["門禁", /讀卡機|門禁/],
  ["電表", /電表|電錶/], ["水表", /水表|水錶/], ["消防", /消防|火警|受信總機/], ["空調", /空調|冷氣/], ["電梯", /電梯/], ["空氣品質", /溫濕度|空氣品質|PM2\.5|二氧化碳/]
];
var COMM_SYS = { "proto.hvac": "空調", "proto.elevator": "電梯", "proto.lighting": "照明", "proto.fire": "消防", "proto.meter": "電表", "proto.water": "水表", "proto.air": "空氣品質", "energy.meter": "電表", "energy.water": "水表", "energy.solar": "太陽能", intercom: "對講", cctv: "攝影", access: "門禁", air: "空氣品質" };

/* 需要 IP 的設備：sys 為網段歸屬，abbr 為設備代號，poe 為每台耗電（W） */
var IP_RULES = [
  [/錄影主機|NVR/i, { vlan: "cctv", abbr: "NVR", poe: 0, server: true }],
  [/攝影機/, { vlan: "cctv", abbr: "CAM", poe: 8 }],
  [/對講系統電腦主機|對講伺服/, { vlan: "intercom", abbr: "ICS", poe: 0, server: true }],
  [/智慧家庭自動化主機|室內對講/, { vlan: "intercom", abbr: "IDU", poe: 10 }],
  [/門口子機|住戶門口機/, { vlan: "intercom", abbr: "ODU", poe: 6 }],
  [/大門口機|管理總機|緊急對講|求救對講|緊急求救對講機/, { vlan: "intercom", abbr: "ICT", poe: 8 }],
  [/電梯樓層管制|Smart ?Key讀卡機|感應式讀卡機|讀卡機/i, { vlan: "access", abbr: "ACR", poe: 6 }],
  [/車牌辨識/, { vlan: "parking", abbr: "LPR", poe: 12 }],
  [/車道控制主機/, { vlan: "parking", abbr: "PKC", poe: 0 }],
  [/佈告欄|布告欄/, { vlan: "media", abbr: "SIG", poe: 0 }],
  [/生活服務平台|學習平台|設施管理電腦|括樸圖|拓樸圖|能源管理系統電腦|主機\(電腦/, { vlan: "media", abbr: "PC", poe: 0, server: true }],
  [/無線網路基地台|AP$/i, { vlan: "mgmt", abbr: "AP", poe: 15 }],
  [/交換機話機|IP話機/i, { vlan: "voice", abbr: "TEL", poe: 5 }],
  [/中央監控.*出線口/, { vlan: "bms", abbr: "WS", poe: 0, server: true }]
];
var VLANS = [
  ["mgmt", 10, "網管（交換器、AP 管理）"], ["cctv", 20, "影像監視"], ["intercom", 30, "對講"], ["access", 40, "門禁"],
  ["bms", 50, "中央監控／IO"], ["parking", 60, "停車管理"], ["energy", 70, "能源／IoT"], ["media", 80, "多媒體／平台"], ["voice", 90, "電話"]
];
var CABLE = {
  ip: "CAT.6 UTP", di: "2C 0.75mm² 遮蔽線", do: "2C 1.25mm²", proto: "RS-485 2P #22 遮蔽雙絞線",
  access: "CAT.6 UTP（至交換器）", distUp: "6C 單模光纖", coreUp: "12C 單模光纖"
};

function ruleOf(rules, name) { for (var i = 0; i < rules.length; i++) if (rules[i][0].test(name)) return rules[i][1]; return null; }
function floorRank(f) { var m = /^(B|R)?(\d+)F$/.exec(f); if (!m) return 5000; return m[1] === "B" ? 1000 - +m[2] : m[1] === "R" ? 3000 + +m[2] : 2000 + +m[2]; }
function floorNo(f) { var m = /^(B|R)?(\d+)F$/.exec(f); if (!m) return 0; return m[1] === "B" ? -(+m[2]) : m[1] === "R" ? 100 + +m[2] : +m[2]; }
function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = "0" + n; return n; }
function fl(f) { return /^(B|R)\d+F$/.test(f) ? f.replace(/F$/, "") : f; }

/* ---------- 1. IO 模組表 ---------- */
function ioRuleOf(P, name) {
  if (P.ioRules && P.ioRules[name]) return P.ioRules[name];
  /* 住戶磁簧、住戶求救鈕：接戶內對講保全主機（通訊協定），不佔 IO；公共區（含安全梯、店鋪）才接 IO */
  if (/磁簧|求救|押扣|壓扣|防盜|保全|紅外線|玻璃破碎/.test(name) && !/公共|公設|安全梯|梯廳|店鋪|店舖|社福|機房|管委|大廳|門廳|停車|車道|屋頂|地下/.test(name)) return null;
  return ruleOf(IO_RULES, name);
}
var IOC = root.IOCORE || (typeof require === "function" ? (function () { try { return require("./io-core.js"); } catch (e) { return null; } })() : null);
function ioPlan(dr, P) {
  var panels = {}, table = IOC ? IOC.build(dr, P) : null;
  var src = table ? [] : (dr.items || []).map(function (it) { return { name: it.name, floors: it.floors }; });
  if (table) {
    var dist = IOC.distribute(table, dr, P, dr.floors || []);
    Object.keys(dist).forEach(function (f) {
      var p = panels[f] = panels[f] || { floor: f, points: [], di: 0, do: 0, proto: 0 }, seq = {};
      /* 同一台設備的點排在一起（揚水泵 #1 運轉、#1 警報、#2 運轉…），接線時同台設備落在相鄰端子 */
      var order = [], byDev = {};
      dist[f].forEach(function (pt) {
        var d = byDev[pt.name]; if (!d) { d = byDev[pt.name] = { name: pt.name, loc: pt.loc, labels: [], pts: {} }; order.push(d); }
        var lk = pt.type + "|" + pt.label; if (!d.pts[lk]) { d.pts[lk] = []; d.labels.push(lk); } d.pts[lk].push(pt);
      });
      order.forEach(function (d) {
        var n = d.labels.reduce(function (m, lk) { return Math.max(m, d.pts[lk].length); }, 0);
        for (var i = 0; i < n; i++) d.labels.forEach(function (lk) {
          var pt = d.pts[lk][i]; if (!pt) return;
          p.points.push({ type: pt.type, dev: pt.name, point: pt.label, name: pt.name + "－" + pt.label, seq: i + 1, loc: d.loc, note: "" });
          if (pt.type === "DI") p.di++; else p.do++;
        });
      });
    });
  }
  (P.extraIo || []).forEach(function (x) { if (x && x.name && x.floor && +x.n > 0) { var o = {}; o[x.floor] = +x.n; src.push({ name: x.name, floors: o, extra: true }); } });
  src.forEach(function (it) {
    var r = ioRuleOf(P, it.name);
    if (!r || !((r.di || 0) + (r.do || 0))) return;
    Object.keys(it.floors).forEach(function (f) {
      var n = it.floors[f]; if (!n) return;
      var p = panels[f] = panels[f] || { floor: f, points: [], di: 0, do: 0, proto: 0 };
      for (var i = 0; i < n; i++) {
        for (var a = 0; a < (r.di || 0); a++) p.points.push({ type: "DI", dev: it.name, point: (r.diL && r.diL[a]) || (r.di > 1 ? "DI" + (a + 1) : "狀態"), name: it.name + (r.diL && r.diL[a] ? "－" + r.diL[a] : (r.di > 1 ? "－" + (a + 1) : "")), seq: i + 1, note: r.note || "" });
        for (var b = 0; b < (r.do || 0); b++) p.points.push({ type: "DO", dev: it.name, point: (r.doL && r.doL[b]) || (r.do > 1 ? "DO" + (b + 1) : "控制"), name: it.name + ((r.doL && r.doL[b]) ? "－" + r.doL[b] : (r.do > 1 ? "－" + (b + 1) : "")), seq: i + 1, note: r.note || "" });
      }
      p.di += (r.di || 0) * n; p.do += (r.do || 0) * n;
    });
  });
  /* 模組配置：先放手動指定的點（P.ioMove：點位鍵 → 端子編號或 "pending"），其餘依序放進同樓層模組的空端子；
     放不下或指定「待配置」的點列在最後（待配置） */
  var moves = P.ioMove || {}, slots = {}, built = [];
  Object.keys(panels).sort(function (a, b) { return floorRank(a) - floorRank(b); }).forEach(function (f) {
    var p = panels[f];
    var diReq = p.di + Math.ceil(p.di * P.spare), doReq = p.do + Math.ceil(p.do * P.spare);
    var n10 = Math.ceil(doReq / 8), rest = Math.max(0, diReq - n10 * 10), n18 = Math.ceil(rest / 18);
    var mods = [], k = 0;
    for (var i = 0; i < n10; i++) mods.push({ id: "IO-" + fl(f) + "-" + pad(++k), type: "10DI8DO", di: 10, do: 8 });
    for (var j = 0; j < n18; j++) mods.push({ id: "IO-" + fl(f) + "-" + pad(++k), type: "18DI", di: 18, do: 0 });
    mods.forEach(function (m) {
      for (var a = 1; a <= m.di; a++) slots[m.id + "-DI" + pad(a)] = { floor: f, mod: m, t: "DI", ch: a, pt: null };
      for (var b = 1; b <= m.do; b++) slots[m.id + "-DO" + pad(b)] = { floor: f, mod: m, t: "DO", ch: b, pt: null };
    });
    built.push({ f: f, p: p, mods: mods, n10: n10, n18: n18, auto: [], pending: [], com: [] });
  });
  function ptKey(f, pt) { return f + "|" + (pt.dev || pt.name) + " #" + pt.seq + "|" + (pt.point || ""); }
  built.forEach(function (b) {
    b.p.points.forEach(function (pt) {
      if (pt.type === "COM") { b.com.push(pt); return; }
      pt.key = ptKey(b.f, pt);
      var mv = moves[pt.key], sl = mv && slots[mv];
      if (mv === "pending") { b.pending.push(pt); pt.why = "手動設為待配置"; return; }
      if (sl && !sl.pt && sl.t === pt.type) { sl.pt = pt; pt.moved = true; return; }
      b.auto.push(pt);
    });
  });
  built.forEach(function (b) {
    b.auto.forEach(function (pt) {
      var hit = null;
      b.mods.some(function (m) {
        var n = pt.type === "DI" ? m.di : m.do;
        for (var c = 1; c <= n; c++) { var sl = slots[m.id + "-" + pt.type + pad(c)]; if (!sl.pt) { hit = sl; return true; } }
        return false;
      });
      if (hit) hit.pt = pt; else { pt.why = "模組端子不足"; b.pending.push(pt); }
    });
  });
  var list = built.map(function (b) {
    var f = b.f, p = b.p, rows = [];
    b.com.forEach(function (pt, i) { rows.push({ module: "RS-485", ch: "COM", tag: fl(f) + "-COM-" + pad(i + 1), name: pt.name + " #" + pt.seq, note: pt.note }); });
    b.mods.forEach(function (m) {
      m.usedDi = 0; m.usedDo = 0;
      ["DI", "DO"].forEach(function (t) {
        var n = t === "DI" ? m.di : m.do;
        for (var c = 1; c <= n; c++) {
          var tag = m.id + "-" + t + pad(c), sl = slots[tag], pt = sl.pt;
          if (pt) { if (t === "DI") m.usedDi++; else m.usedDo++; }
          rows.push(pt ? { module: m.id + "（" + m.type + "）", mod: m.id, type: m.type, ch: t + "-" + pad(c), tag: tag, name: (pt.dev || pt.name) + " #" + pt.seq + (pt.point ? "－" + pt.point : ""), dev: (pt.dev || pt.name) + " #" + pt.seq, point: pt.point || "", loc: pt.loc || "", note: pt.note, key: pt.key, ptype: pt.type, moved: !!pt.moved, floor: pt.floor || f }
            : { module: m.id + "（" + m.type + "）", mod: m.id, type: m.type, ch: t + "-" + pad(c), tag: tag, name: "預留", dev: "預留", point: "", loc: "", note: "" });
        }
      });
    });
    b.pending.forEach(function (pt, i) {
      rows.push({ module: "待配置", mod: "", type: "", ch: pt.type + "-—", tag: "待配置-" + fl(f) + "-" + pad(i + 1), name: (pt.dev || pt.name) + " #" + pt.seq + (pt.point ? "－" + pt.point : ""), dev: (pt.dev || pt.name) + " #" + pt.seq, point: pt.point || "", loc: pt.loc || "", note: pt.why || "", key: pt.key, ptype: pt.type, pending: true });
    });
    return { floor: f, panel: fl(f) + " 監控箱", di: p.di, do: p.do, proto: p.proto, n18: b.n18, n10: b.n10, pending: b.pending.length,
      modules: b.mods.map(function (m) { return { id: m.id, type: m.type, usedDi: m.usedDi, usedDo: m.usedDo, di: m.di, do: m.do }; }), rows: rows };
  });
  /* 模組可接收其他樓層的點（例：B2 的點拉到 B1 的模組）：移過去的點跟著模組所在監控箱列出 */
  list.forEach(function (pl) { pl.rows.forEach(function (r) { if (r.key && r.key.split("|")[0] !== pl.floor) { r.from = r.key.split("|")[0]; r.loc = (r.loc ? r.loc + "，" : "") + "來自 " + r.from; } }); });
  var tot = { di: 0, do: 0, proto: 0, n18: 0, n10: 0, pending: 0 };
  list.forEach(function (p) { tot.di += p.di; tot.do += p.do; tot.proto += p.proto; tot.n18 += p.n18; tot.n10 += p.n10; tot.pending += p.pending; });
  return { panels: list, total: tot, table: table };
}

/* ---------- 2. 交換器與三層式架構 ---------- */
var SW_SIZES = [8, 16, 24, 48];
function swSize(n) { for (var i = 0; i < SW_SIZES.length; i++) if (n <= SW_SIZES[i]) return SW_SIZES[i]; return 48; }
function devicesByFloor(dr, P, io) {
  var out = {};   /* floor -> vlan -> [{abbr,name,n,poe}] */
  function add(f, vlan, d) { var x = (out[f] = out[f] || {}); (x[vlan] = x[vlan] || []).push(d); }
  (dr.items || []).forEach(function (it) {
    var r = (P.ipRules && P.ipRules[it.name]) || ruleOf(IP_RULES, it.name);
    if (!r) return;
    Object.keys(it.floors).forEach(function (f) { if (it.floors[f]) add(f, r.vlan, { abbr: r.abbr, name: it.name, n: it.floors[f], poe: r.poe, server: !!r.server }); });
  });
  io.panels.forEach(function (p) { var n = p.n18 + p.n10; if (n) add(p.floor, "bms", { abbr: "IO", name: "IO 模組", n: n, poe: 0 }); });
  return out;
}
function network(dr, P, io) {
  var byF = devicesByFloor(dr, P, io), floors = Object.keys(byF).sort(function (a, b) { return floorRank(a) - floorRank(b); });
  var access = [], servers = [];
  floors.forEach(function (f) {
    var groups = {};
    Object.keys(byF[f]).forEach(function (v) {
      byF[f][v].forEach(function (d) {
        if (d.server) { for (var i = 0; i < d.n; i++) servers.push({ floor: f, vlan: v, name: d.name }); return; }
        var g = (P.separateCctv && v === "cctv") ? "cctv" : "conv";
        var x = groups[g] = groups[g] || { n: 0, poe: 0, vlans: {} };
        x.n += d.n; x.poe += d.n * d.poe; x.vlans[v] = (x.vlans[v] || 0) + d.n;
      });
    });
    Object.keys(groups).forEach(function (g) {
      var x = groups[g], need = x.n + Math.ceil(x.n * P.spare), left = need, k = 0, cnt = Math.ceil(need / 48);
      while (left > 0) {
        var sz = swSize(left), used = Math.min(x.n - (k * 48 > x.n ? x.n : 0), sz);
        access.push({ floor: f, group: g, vlans: Object.keys(x.vlans), vlanCount: x.vlans, id: "SW-" + fl(f) + (g === "cctv" ? "-CAM" : "-") + pad(++k),
          ports: sz, used: Math.min(x.n, sz), poe: x.poe > 0, poeW: Math.ceil(x.poe * 1.3 / cnt) });
        x.n -= Math.min(x.n, sz); left -= sz;
      }
    });
  });
  var groups = [], g = [];
  floors.forEach(function (f, i) { g.push(f); if (g.length >= P.distGroup || i === floors.length - 1) { groups.push(g); g = []; } });
  var dist = groups.map(function (gf, i) {
    var sws = access.filter(function (a) { return gf.indexOf(a.floor) >= 0; });
    return { id: "DSW-" + pad(i + 1), floors: gf, label: gf[0] + (gf.length > 1 ? "～" + gf[gf.length - 1] : ""), downlinks: sws.length, ports: swSize(sws.length + 2), at: gf[Math.floor((gf.length - 1) / 2)] };
  });
  var srv = servers.length ? { id: "SW-SRV-01", floor: P.coreFloor, ports: swSize(servers.length + Math.ceil(servers.length * P.spare) + 2), used: servers.length, list: servers } : null;
  var core = { id: "CORE-01", floor: P.coreFloor, ports: swSize(dist.length * 2 + (srv ? 2 : 0) + 4), note: "L3 核心：各系統分 VLAN，VLAN 之間預設不互通，只開放管理電腦與必要的整合主機" };
  return { core: core, dist: dist, access: access, server: srv, floors: floors, byFloor: byF };
}

/* ---------- 3. IP 編表 ---------- */
function prefixFor(n) { var p = 24; while ((Math.pow(2, 32 - p) - 2) < n && p > 16) p--; return p; }
function ipPlan(dr, P, io, net) {
  var hosts = {}; VLANS.forEach(function (v) { hosts[v[0]] = []; });
  net.floors.forEach(function (f) {
    Object.keys(net.byFloor[f]).forEach(function (v) {
      net.byFloor[f][v].forEach(function (d) { for (var i = 0; i < d.n; i++) hosts[v].push({ floor: f, abbr: d.abbr, name: d.name, server: d.server }); });
    });
  });
  net.access.forEach(function (a) { hosts.mgmt.push({ floor: a.floor, abbr: "SW", name: "接取交換器 " + a.id + "（" + a.ports + " 埠" + (a.poe ? " PoE" : "") + "）", sw: a.id }); });
  if (net.server) hosts.mgmt.push({ floor: net.server.floor, abbr: "SW", name: "主機交換器 " + net.server.id, sw: net.server.id });
  net.dist.forEach(function (d) { hosts.mgmt.push({ floor: d.at, abbr: "DSW", name: "匯聚交換器 " + d.id, sw: d.id }); });
  hosts.mgmt.unshift({ floor: net.core.floor, abbr: "CORE", name: "核心交換器 " + net.core.id, sw: net.core.id });
  /* 各系統網段：預設依 VLAN 順序自動切（基底 P.baseNet）；P.ipNet[系統] = {vlan, cidr, gw} 可自訂（例：192.168.20.0/24） */
  var third = 0, subnets = [], rows = [], custom = P.ipNet || {}, used = [];
  function toInt(ip) { var a = String(ip).split(".").map(Number); return ((a[0] << 24) >>> 0) + (a[1] << 16) + (a[2] << 8) + a[3]; }
  function toIp(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."); }
  function parseCidr(c) {
    var m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*\/\s*(\d{1,2})\s*$/.exec(String(c || ""));
    if (!m || [m[1], m[2], m[3], m[4]].some(function (x) { return +x > 255; }) || +m[5] < 8 || +m[5] > 30) return null;
    var pf = +m[5], mask = pf ? (0xffffffff << (32 - pf)) >>> 0 : 0, net = (toInt(m[1] + "." + m[2] + "." + m[3] + "." + m[4]) & mask) >>> 0;
    return { net: net, pfx: pf, size: Math.pow(2, 32 - pf) };
  }
  var customRanges = [];
  VLANS.forEach(function (v) { var c = custom[v[0]] && parseCidr(custom[v[0]].cidr); if (c && hosts[v[0]].length) customRanges.push({ a: c.net, b: c.net + c.size - 1 }); });
  VLANS.forEach(function (v) {
    var hs = hosts[v[0]]; if (!hs.length) return;
    var need = Math.ceil(hs.length * (1 + P.growth)) + 20, cu = custom[v[0]] || {}, pc = cu.cidr ? parseCidr(cu.cidr) : null, net, pfx, size, vid = +cu.vlan > 0 && +cu.vlan < 4095 ? +cu.vlan : v[1], warn = "";
    if (cu.cidr && !pc) warn = "自訂網段「" + cu.cidr + "」格式不正確，改用預設";
    if (pc) { net = pc.net; pfx = pc.pfx; size = pc.size; }
    else {
      pfx = prefixFor(need); var blocks = Math.pow(2, 24 - pfx);
      size = Math.pow(2, 32 - pfx);
      for (var guard = 0; guard < 256; guard++) {   /* 自動切的網段避開自訂網段 */
        third = Math.ceil(third / blocks) * blocks; net = toInt(P.baseNet + "." + third + ".0");
        var clash = customRanges.some(function (u) { return net <= u.b && net + size - 1 >= u.a; });
        if (!clash) break; third += blocks;
      }
      third += blocks;
    }
    var bcast = net + size - 1, gwI = cu.gw && /^\d{1,3}(\.\d{1,3}){3}$/.test(cu.gw) ? toInt(cu.gw) : net + 1;
    if (gwI <= net || gwI >= bcast) { warn = (warn ? warn + "；" : "") + "閘道 " + (cu.gw || toIp(gwI)) + " 不在網段內，改用 " + toIp(net + 1); gwI = net + 1; }
    if (size - 2 < hs.length + 20) warn = (warn ? warn + "；" : "") + "網段可用 " + (size - 2) + " 個位址，不夠 " + hs.length + " 台設備（含保留 .2～.19），超出的設備標「位址不足」";
    used.forEach(function (u) { if (net <= u.b && bcast >= u.a) warn = (warn ? warn + "；" : "") + "與「" + u.name + "」網段重疊"; });
    used.push({ a: net, b: bcast, name: v[2] });
    var gw = toIp(gwI);
    subnets.push({ vlan: vid, key: v[0], name: v[2], cidr: toIp(net) + "/" + pfx, gateway: gw, hosts: hs.length, capacity: size - 2, custom: !!pc, warn: warn });
    var idx = 0, counters = {};
    function ipAt(off) { var n = net + off; if (n === gwI) n++; return n < bcast ? toIp(n) : "位址不足"; }
    var servers = hs.filter(function (h) { return h.server || h.sw; }), devs = hs.filter(function (h) { return !(h.server || h.sw); });
    servers.forEach(function (h, i) { var key = h.abbr + h.floor; counters[key] = (counters[key] || 0) + 1;
      rows.push({ vlan: vid, sys: v[2], key: v[0], ip: ipAt(2 + i), name: h.sw || (h.abbr + "-" + fl(h.floor) + "-" + pad(counters[key])), floor: h.floor, device: h.name, mask: pfx, gw: gw }); });
    devs.sort(function (a, b) { return floorRank(a.floor) - floorRank(b.floor); }).forEach(function (h) {
      var key = h.abbr + h.floor; counters[key] = (counters[key] || 0) + 1;
      rows.push({ vlan: vid, sys: v[2], key: v[0], ip: ipAt(20 + idx++), name: h.abbr + "-" + fl(h.floor) + "-" + pad(counters[key]), floor: h.floor, device: h.name, mask: pfx, gw: gw });
    });
  });
  return { subnets: subnets, rows: rows };
}

/* ---------- 4. 線材 ---------- */
function cables(dr, P, io, net) {
  var hRun = P.avgRun * P.slack, out = {};
  var pos = {}; net.floors.forEach(function (f, i) { pos[f] = i; });
  function vd(a, b) { return Math.abs((pos[a] || 0) - (pos[b] || 0)) * P.floorHeight; }
  function add(type, use, runs, len) { if (!runs) return; var k = type + "|" + use; var x = out[k] = out[k] || { type: type, use: use, runs: 0, meters: 0 }; x.runs += runs; x.meters += runs * len; }
  net.access.forEach(function (a) { add(CABLE.ip, a.group === "cctv" ? "攝影機至樓層 PoE 交換器" : "IP 設備至樓層交換器", a.used, hRun); });
  if (net.server) add(CABLE.ip, "主機至機房交換器", net.server.used, 10 * P.slack);
  io.panels.forEach(function (p) { add(CABLE.di, "DI 點至樓層監控箱", p.di, hRun); add(CABLE.do, "DO 點至樓層監控箱", p.do, hRun); if (p.proto) add(CABLE.proto, "通訊點（串接）", Math.ceil(p.proto / 16), hRun * 2); });
  net.dist.forEach(function (d) {
    d.floors.forEach(function (f) { var n = net.access.filter(function (a) { return a.floor === f; }).length; add(CABLE.distUp, "樓層交換器 → 匯聚交換器", n, (vd(f, d.at) + 15) * P.slack); });
    add(CABLE.coreUp, "匯聚交換器 → 核心", 1, (vd(d.at, net.core.floor) + 20) * P.slack);
  });
  return Object.keys(out).map(function (k) { var x = out[k]; x.meters = Math.ceil(x.meters / 10) * 10; return x; });
}

/* 有平面圖座標時，水平配線改用實測長度；主幹（光纖）仍用樓高估算 */
function measuredCables(cb, wr) {
  var keep = cb.filter(function (c) { return /光纖|主機至機房|通訊點/.test(c.use + c.type); }).map(function (c) { c.basis = "估算"; return c; });
  var add = {};
  wr.plans.forEach(function (p) { p.totals.forEach(function (t) {
    var k = t.cable; add[k] = add[k] || { type: k, use: "各層設備配線（依平面圖實測）", runs: 0, meters: 0, basis: "實測" }; add[k].runs += t.runsAll; add[k].meters += t.mAll;
  }); });
  return Object.keys(add).map(function (k) { var x = add[k]; x.meters = Math.ceil(x.meters / 10) * 10; return x; }).concat(keep);
}
function commPlan(dr, P) {
  var out = {};
  (dr.items || []).forEach(function (it) {
    var r = ioRuleOf(P, it.name); if (r && ((r.di || 0) + (r.do || 0))) return;
    for (var i = 0; i < COMM_RULES.length; i++) if (COMM_RULES[i][1].test(it.name)) {
      var k = COMM_RULES[i][0], o = out[k] = out[k] || { sys: k, devices: 0, items: [] };
      o.devices += it.total; if (o.items.indexOf(it.name) < 0) o.items.push(it.name); break;
    }
  });
  (P.systems || []).forEach(function (k) { var n = COMM_SYS[k]; if (n && !out[n]) out[n] = { sys: n, devices: 0, items: [] }; });
  return Object.keys(out).map(function (k) { return out[k]; });
}
/* ---------- 5. 佈線圖：依平面座標計算每條配線（直角走線） ---------- */
var BOX_RE = /配電箱|配線箱|接線盒|接線箱|出線口|預埋/;
function cableClass(name, P) {
  if (!name || BOX_RE.test(name)) return null;
  var first = name.split("／")[0];
  if (/電子門鎖|瓦斯偵測/.test(first)) return "unit";
  if (/開門按鈕|陽極|電鎖|門磁/.test(first) && !/柵欄/.test(first)) return "door";
  if (/紅綠燈|警示燈|閃光燈|感應線圈|車輛偵測|柵欄|出車注意/.test(first)) return "lane";
  if (/語音播報|喇叭/.test(first)) return "audio";
  if (/調光|情境控制|燈控/.test(first)) return "bus";
  var ip = (P.ipRules && P.ipRules[first]) || ruleOf(IP_RULES, first);
  if (ip) return ip.vlan === "cctv" && P.separateCctv ? "cam" : "ip";
  var r = ioRuleOf(P, first);
  if (r && (r.di || 0) + (r.do || 0)) return (r.do && !r.di) ? "do" : "di";
  if (/求救|磁簧|押扣|偵測|感知|開關|水位|液位/.test(first)) return "di";
  return "other";
}
var CABLE_OF = { ip: CABLE.ip, cam: CABLE.ip, di: CABLE.di, do: CABLE.do, unit: "2C 0.5mm²（至宅內配線箱）", door: "2C 1.25mm²（至門禁讀卡機／控制器）",
  lane: "4C 1.25mm²（至車道控制主機）", audio: "喇叭線 2C 1.25mm²", bus: CABLE.proto, other: "依原廠規定" };
var TARGET_OF = { unit: /宅內配線箱/, door: /讀卡機/, lane: /車道控制主機/ };
function wiring(dr, P) {
  var unitM = Number(P.unitM) > 0 ? Number(P.unitM) : (dr.unitM || 0.01), drop = Number(P.drop) > 0 ? Number(P.drop) : 3;
  var plans = (dr.plans || []).map(function (pl) {
    var devs = pl.devs, panels = devs.filter(function (d) { return /監控系統配電箱/.test(d.n); });
    var cx = 0, cy = 0, cnt = 0;
    devs.forEach(function (d) { if (cableClass(d.n, P)) { cx += d.x; cy += d.y; cnt++; } });
    cx = cnt ? cx / cnt : (pl.box[0] + pl.box[2]) / 2; cy = cnt ? cy / cnt : (pl.box[1] + pl.box[3]) / 2;
    var panel = panels.length ? panels.reduce(function (a, b) { return Math.hypot(a.x - cx, a.y - cy) <= Math.hypot(b.x - cx, b.y - cy) ? a : b; }) : { x: Math.round(cx), y: Math.round(cy), n: "（未標示監控箱，假設在中央）", assumed: true };
    var runs = [];
    devs.forEach(function (d) {
      var c = cableClass(d.n, P); if (!c || d === panel) return;
      var to = panel, tg = TARGET_OF[c] ? devs.filter(function (x) { return x !== d && TARGET_OF[c].test(x.n); }) : [];
      if (tg.length) to = tg.reduce(function (a, b) { return Math.abs(a.x - d.x) + Math.abs(a.y - d.y) <= Math.abs(b.x - d.x) + Math.abs(b.y - d.y) ? a : b; });
      var len = (Math.abs(d.x - to.x) + Math.abs(d.y - to.y)) * unitM * P.slack + drop;
      runs.push({ n: d.n.split("／")[0], c: c, cable: CABLE_OF[c], x: d.x, y: d.y, tx: to.x, ty: to.y, m: Math.round(len * 10) / 10 });
    });
    var mult = (pl.floors || []).length || 1, tot = {};
    runs.forEach(function (r) { var k = r.cable; tot[k] = tot[k] || { cable: k, runs: 0, m: 0 }; tot[k].runs += 1; tot[k].m += r.m; });
    return { title: pl.title, table: pl.table, floors: pl.floors, mult: mult, box: pl.box, segs: pl.segs, panel: panel, runs: runs,
      totals: Object.keys(tot).map(function (k) { var t = tot[k]; return { cable: k, runs: t.runs, m: Math.round(t.m), runsAll: t.runs * mult, mAll: Math.round(t.m * mult) }; }) };
  });
  return { unitM: unitM, plans: plans };
}

function plan(dr, params) {
  var P = {}; Object.keys(DEFAULTS).forEach(function (k) { P[k] = params && params[k] !== undefined && params[k] !== "" ? params[k] : DEFAULTS[k]; });
  ["spare", "growth", "floorHeight", "avgRun", "slack", "distGroup"].forEach(function (k) { P[k] = Number(P[k]); });
  if (params) { P.unitM = params.unitM; P.drop = params.drop; }
  P.separateCctv = P.separateCctv === true || P.separateCctv === "true";
  if (params) { P.ioRules = params.ioRules; P.ipRules = params.ipRules; P.extraIo = params.extraIo || []; P.systems = params.systems || []; P.ioQty = params.ioQty || {}; P.ioFloor = params.ioFloor || {}; P.ioMove = params.ioMove || {}; P.ipNet = params.ipNet || {}; P.panelFloors = params.panelFloors || {}; }
  var io = ioPlan(dr, P); io.comm = commPlan(dr, P);
  var net = network(dr, P, io), ip = ipPlan(dr, P, io, net), cb = cables(dr, P, io, net);
  var ipOf = {}; ip.rows.forEach(function (r) { if (/^IO-/.test(r.name)) ipOf[r.name] = r; });   /* IO 模組 IP（與 IP 編表同名） */
  io.panels.forEach(function (p) {
    p.modules.forEach(function (m) { var r = ipOf[m.id]; if (r) { m.ip = r.ip; m.mask = r.mask; m.gw = r.gw; m.vlan = r.vlan; } });
    p.rows.forEach(function (r) { var x = ipOf[r.mod]; r.ip = x ? x.ip : ""; });
  });
  var wr = wiring(dr, P);
  if (wr.plans.length) cb = measuredCables(cb, wr);
  return { params: P, io: io, net: { core: net.core, dist: net.dist, access: net.access, server: net.server, floors: net.floors, byFloor: net.byFloor }, ip: ip, cables: cb, wiring: wr };
}

/* ---------- 設備昇位圖：各樓層設備依系統分組 ---------- */
/* 四個昇位系統：key、名稱、昇位主幹接到的主機 */
var RISER_SYS = [
  ["bms", "中央監控", "中央監控主機"],
  ["access", "門禁", "門禁控制主機"],
  ["cctv", "攝影系統", "NVR 錄影主機"],
  ["intercom", "對講保全系統", "對講管理主機"]
];
var PUBLIC_RE = /公共|公設|安全梯|梯廳|店鋪|店舖|社福|機房|管委|大廳|門廳|停車|車道|屋頂|地下/;
/** 設備歸到哪個昇位系統。停車、能源、環境、佈告欄等其他子系統都整合進中央監控；
 *  住戶的磁簧、求救鈕、瓦斯偵測接戶內對講保全主機，歸對講保全；公共區的接 IO，歸中央監控。 */
function riserSysOf(name, sys) {
  name = String(name || ""); sys = sys || "";
  var pub = PUBLIC_RE.test(name);
  /* 先看設備名稱（圖面分析的系統分類較粗，例如「液位開關(監視高液位)」會因「監視」被歸成攝影） */
  if (sys === "parking" || /車牌|車道|柵欄|E-?TAG|感應線圈|紅綠燈|旋轉警示燈|繳費機|車位計數|滿車/i.test(name)) return "bms";
  if (/攝影機|錄影|NVR|監視器|CCTV|鏡頭/i.test(name)) return "cctv";
  if (/讀卡機|讀頭|讀碼機/.test(name)) return "access";   /* 含「整合於大門口機內」的讀頭 */
  if (/對講|門口機|門口子機|防盜|宅內箱|智慧家庭|交換機|話機|CMS/i.test(name)) return "intercom";
  if (/電子鎖|電子門鎖/.test(name) && !pub) return "intercom";   /* 住戶電子鎖接戶內對講機 */
  if (/讀卡機|讀頭|讀碼機|陽極|電鎖|電子鎖|門鎖|開門按鈕|出門按鈕|門禁|自動開門|Smart ?Key/i.test(name)) return "access";
  if (/磁簧|求救|押扣|壓扣|瓦斯|保全/.test(name) && !pub) return "intercom";
  if (/液位|水位|油位|水箱|一氧化碳|偵測|感知器|感測器|配電箱|接線盒|出線口|開關|泵|風機|監控/.test(name)) return "bms";
  if (sys === "cctv" || sys === "access" || sys === "intercom") return sys;
  return "bms";
}
/** 昇位圖資料：floors 由下往上；cells[樓層][系統] = [{name,n}]；totals[樓層][系統] = 台數 */
function riser(dr, opt) {
  opt = opt || {};
  var fset = {}, cells = {}, totals = {}, sysTotal = {}, extra = opt.extra || [];
  (dr.floors || []).forEach(function (f) { fset[f] = 1; });
  var src = (dr.items || []).map(function (it) { return { name: it.name, sys: it.sys, floors: it.floors || {} }; });
  extra.forEach(function (x) { if (x && x.name && x.floor && +x.n > 0) { var o = {}; o[x.floor] = +x.n; src.push({ name: x.name, sys: "", floors: o }); } });
  src.forEach(function (it) {
    var s = riserSysOf(it.name, it.sys);
    Object.keys(it.floors).forEach(function (f) {
      var n = +it.floors[f] || 0; if (n <= 0) return;
      fset[f] = 1;
      var c = (cells[f] = cells[f] || {}); (c[s] = c[s] || []).push({ name: it.name, n: n });
      var t = (totals[f] = totals[f] || {}); t[s] = (t[s] || 0) + n;
      sysTotal[s] = (sysTotal[s] || 0) + n;
    });
  });
  var floors = Object.keys(fset).sort(function (a, b) { return floorRank(a) - floorRank(b); });
  var core = opt.coreFloor && fset[opt.coreFloor] ? opt.coreFloor : (fset["1F"] ? "1F" : floors[0]);
  return { floors: floors, cells: cells, totals: totals, sysTotal: sysTotal, core: core, systems: RISER_SYS };
}

/* ---------- 設備昇位圖：版面（單位 mm，Y 向下）→ 畫面 SVG 與 DXF 共用 ---------- */
var RISER_LAYER = { bms: ["RISER-BMS", 5], access: ["RISER-ACCESS", 3], cctv: ["RISER-CCTV", 30], intercom: ["RISER-INTERCOM", 6], all: ["RISER-ALL", 5] };
var RISER_TRUNK = { bms: "主幹：CAT.6 UTP（IO 模組經樓層交換器）", access: "主幹：CAT.6 UTP（讀卡機經樓層交換器）", cctv: "主幹：6C 單模光纖（PoE 交換器上連）", intercom: "主幹：CAT.6 UTP（對講經樓層交換器）", all: "主幹：6C 單模光纖／CAT.6 UTP（經樓層交換器至中央監控室）" };
/* 圖例符號：[規則, 代號, 形狀] ；圓形＝感知／偵測／按鈕／攝影，方形＝主機／箱體／讀卡機／對講機 */
var RISER_SYM = [
  [/配電箱/, "P", "rect"], [/出線口/, "WS", "rect"], [/副控/, "SUB", "rect"], [/接線盒/, "J", "rect"],
  [/液位.*高低|高低液位/, "LW", "circle"], [/液位|水位/, "LH", "circle"], [/水箱蓋/, "TC", "circle"], [/油位/, "OL", "circle"],
  [/一氧化碳/, "CO", "circle"], [/瓦斯/, "G", "circle"], [/多功能感應/, "MS", "circle"], [/磁簧/, "M", "circle"], [/求救|押扣|壓扣/, "E", "circle"],
  [/車牌辨識.*攝影/, "LPR", "circle"], [/全功/, "PTZ", "circle"], [/紅外線/, "IR", "circle"], [/攝影.*電梯|電梯.*攝影/, "EC", "circle"], [/半球/, "D", "circle"], [/吊桿/, "BC", "circle"], [/攝影機/, "C", "circle"],
  [/E-?tag/i, "ET", "rect"], [/讀卡機|讀頭|讀碼機/, "R", "rect"], [/開門按鈕|出門按鈕/, "PB", "circle"], [/陽極鎖|電鎖/, "EL", "rect"], [/電子鎖|電子門鎖/, "DL", "rect"], [/自動開門/, "AD", "circle"],
  [/宅內箱/, "HB", "rect"], [/防盜主機|室內機|室內對講/, "IDU", "rect"], [/門口子機/, "ODU", "rect"], [/大門口機/, "MD", "rect"], [/緊急對講/, "EI", "rect"],
  [/管理總機|CMS/, "MC", "rect"], [/交換機主機/, "PBX", "rect"], [/話機/, "T", "circle"],
  [/檢知器/, "LD", "rect"], [/感應線圈/, "LP", "circle"], [/紅綠燈/, "TL", "rect"], [/警示燈/, "WL", "circle"], [/柵欄/, "BG", "rect"], [/車道控制/, "LC", "rect"], [/車牌辨識/, "LPR", "rect"],
  [/繳費/, "PS", "rect"], [/計數器/, "CNT", "rect"], [/滿車/, "FL", "rect"], [/佈告欄|布告欄/, "SIG", "rect"], [/水錶|水表/, "WM", "circle"], [/電錶|電表/, "KWH", "circle"],
  [/投影機/, "PJ", "rect"], [/布幕/, "SCR", "rect"], [/安全島/, "SI", "rect"]
];
/** 每種設備的圖例：代號重複時加序號（E、E2、E3…），全案一致 */
function riserLegend(R) {
  var names = [], seen = {}, out = {}, used = {};
  R.systems.forEach(function (s) { R.floors.forEach(function (f) { ((R.cells[f] || {})[s[0]] || []).forEach(function (e) { if (!seen[e.name]) { seen[e.name] = 1; names.push({ name: e.name, sys: s[0] }); } }); }); });
  /* 名稱較單純的（沒有括號註記）先取得基本代號 */
  names.slice().sort(function (a, b) { return (/[()（）]/.test(a.name) ? 1 : 0) - (/[()（）]/.test(b.name) ? 1 : 0) || a.name.length - b.name.length; }).forEach(function (x) {
    var sym = null; for (var i = 0; i < RISER_SYM.length; i++) if (RISER_SYM[i][0].test(x.name)) { sym = RISER_SYM[i]; break; }
    var code = sym ? sym[1] : "X", shape = sym ? sym[2] : "circle", c = code, k = 1;
    while (used[c]) c = code + (++k);
    used[c] = 1; out[x.name] = { code: c, shape: shape, sys: x.sys };
  });
  var ordered = {}; names.forEach(function (x) { ordered[x.name] = out[x.name]; });
  return ordered;
}
function riserCable(name, P) {
  if (/宅內箱|配線箱/.test(name)) return "—（箱體，不另配線）";
  var c = cableClass(name, P || DEFAULTS);
  return c ? CABLE_OF[c] : "—（箱體，不另配線）";
}
function shortCable(s) { return String(s).replace(/（.*?）/g, "").replace(/\s+遮蔽線/, " 遮蔽").trim(); }
/** 某樓層某欄的設備；key 為 "all" 時依系統順序合併 */
function riserEntries(R, f, key) {
  var c = R.cells[f] || {};
  if (key !== "all") return (c[key] || []).slice();
  var list = []; R.systems.forEach(function (s) { (c[s[0]] || []).forEach(function (e) { list.push(e); }); });
  return list;
}
/** sel：null＝不分系統（一欄全部設備）；陣列＝分系統時勾選的系統 key */
function riserCols(R, sel) {
  if (!sel) return [{ key: "all", name: "全部設備", host: "中央監控室" }];
  return R.systems.filter(function (s) { return sel.indexOf(s[0]) >= 0; }).map(function (s) { return { key: s[0], name: s[1], host: s[2] }; });
}
/** 版面：prims 為 line／circle／rect／text（a: "l" 靠左基線、"m" 置中），座標 mm、Y 向下 */
function riserLayout(R, sel, P, opt) {
  opt = opt || {};
  var cols = riserCols(R, sel), legend = riserLegend(R), prims = [];
  var SLOT = 15, SYM = 3.2, LINE = 15, LW = 34, PAD = 16, CAP = sel ? 8 : 24;
  function L(x1, y1, x2, y2, ly, w) { prims.push({ t: "line", x1: x1, y1: y1, x2: x2, y2: y2, ly: ly, w: w || 0 }); }
  function C(x, y, r, ly) { prims.push({ t: "circle", x: x, y: y, r: r, ly: ly }); }
  function B(x, y, w, h, ly, fill) { prims.push({ t: "rect", x: x, y: y, w: w, h: h, ly: ly, fill: !!fill }); }
  function T(x, y, h, s, ly, a, cls) { prims.push({ t: "text", x: x, y: y, h: h, s: String(s), ly: ly, a: a || "l", cls: cls || "" }); }
  function fit(s, w, h) { s = String(s); var acc = 0, out = ""; for (var i = 0; i < s.length; i++) { var cw = (s.charCodeAt(i) > 255 ? 1 : 0.62) * h; if (acc + cw > w) return out + "…"; acc += cw; out += s[i]; } return out; }
  function sym(x, y, lg, ly) {
    if (lg.shape === "rect") B(x - SYM, y - SYM, SYM * 2, SYM * 2, ly); else C(x, y, SYM, ly);
    T(x, y, lg.code.length > 2 ? 1.5 : 2, lg.code, ly, "m");
  }
  var sumOf = function (f, key) { return riserEntries(R, f, key).reduce(function (a, e) { return a + e.n; }, 0); };
  var hostW = function (c) { return Math.max(22, c.host.length * 3 + 6); };
  /* 欄寬：依最多設備的樓層決定每列放幾個符號 */
  cols.forEach(function (c) {
    var most = 1; R.floors.forEach(function (f) { most = Math.max(most, riserEntries(R, f, c.key).length + (f === R.core ? Math.ceil((hostW(c) + 4) / SLOT) : 0)); });
    c.per = Math.min(most, Math.max(CAP, Math.ceil(most / 3))); c.lines = Math.ceil(most / c.per); c.w = PAD + c.per * SLOT + SLOT / 2 + 6;   /* 最多 3 排，錯開排列讓支線從符號間通過 */
  });
  var top = 34, x = LW; cols.forEach(function (c) { c.x = x; c.rx = x + 8; x += c.w; });
  var W0 = x;
  T(0, 8, 6, opt.title || "各樓層設備昇位圖" + (sel ? "（分系統）" : ""), "RISER-TEXT", "l", "ttl");
  T(0, 15, 2.8, "昇位主幹接到 " + R.core + " " + (sel ? "各系統主機" : "中央監控室") + "；符號旁 ×N 為該層數量，各層支線下方標示配置線材" + (opt.source ? "；來源：" + opt.source : ""), "RISER-TEXT");
  T(2, top - 3, 3, "樓層", "RISER-TEXT");
  cols.forEach(function (c) {
    var ly = RISER_LAYER[c.key][0], tot = R.floors.reduce(function (a, f) { return a + sumOf(f, c.key); }, 0);
    B(c.x + 2, top - 14, c.w - 4, 12, ly); T(c.x + 5, top - 8.6, 3.5, fit(c.name + "　共 " + tot + " 台", c.w - 10, 3.5), ly, "l", "hd");
    T(c.x + 5, top - 4, 2, fit(RISER_TRUNK[c.key], c.w - 10, 2), ly);
  });
  var rows = [], y = top;
  R.floors.slice().reverse().forEach(function (f) {
    var lines = 1; cols.forEach(function (c) { var n = riserEntries(R, f, c.key).length + (f === R.core ? Math.ceil((hostW(c) + 4) / SLOT) : 0); lines = Math.max(lines, Math.ceil(n / c.per)); });
    var h = 12 + lines * LINE + 6; rows.push({ f: f, y: y, h: h, bus: y + h - 7 }); y += h;
  });
  var bottom = y;
  rows.forEach(function (r) {
    var ft = cols.reduce(function (a, c) { return a + sumOf(r.f, c.key); }, 0);
    L(0, r.y, W0, r.y, "RISER-FLOOR"); T(3, r.y + 7, 4, r.f, "RISER-FLOOR", "l", "fl"); T(3, r.y + 12, 2.5, ft ? ft + " 台" : "—", "RISER-FLOOR");
  });
  L(0, bottom, W0, bottom, "RISER-FLOOR"); L(LW - 1, top - 16, LW - 1, bottom, "RISER-FLOOR");
  cols.forEach(function (c) {
    var ly = RISER_LAYER[c.key][0], rx = c.rx;
    var used = rows.filter(function (r) { return r.f === R.core || riserEntries(R, r.f, c.key).length; });
    if (used.length > 1) { L(rx - 0.6, used[0].bus, rx - 0.6, used[used.length - 1].bus, ly, 1); L(rx + 0.6, used[0].bus, rx + 0.6, used[used.length - 1].bus, ly, 1); }
    rows.forEach(function (r) {
      var es = riserEntries(R, r.f, c.key), core = r.f === R.core;
      if (!es.length && !core) return;
      /* 樓層監控箱（斜線方塊）在主幹上，支線匯流到箱 */
      B(rx - 4, r.bus - 2.5, 8, 5, ly); L(rx - 4, r.bus + 2.5, rx + 4, r.bus - 2.5, ly);
      var skip = 0;
      if (core) { var hw = hostW(c); B(rx + 8, r.y + 4, hw, 7, ly, true); T(rx + 8 + hw / 2, r.y + 7.5, 2.8, c.host, ly, "m", "host"); L(rx + 8, r.y + 7.5, rx, r.y + 7.5, ly); L(rx, r.y + 7.5, rx, r.bus - 2.5, ly); skip = Math.ceil((hw + 4) / SLOT); }
      var lastX = rx + 4, cables = {};
      es.forEach(function (e, k) {
        var i = k + skip, li = Math.floor(i / c.per), sx = rx + PAD + (i % c.per) * SLOT + li * SLOT / 3, sy = r.y + 12 + li * LINE, lg = legend[e.name];
        sym(sx, sy, lg, ly); T(sx + SYM + 0.6, sy - SYM - 0.3, 2, "×" + e.n, ly, "l", "qty");
        L(sx, sy + SYM, sx, r.bus, ly); lastX = Math.max(lastX, sx);
        var cb = shortCable(riserCable(e.name, P)); if (!/^—/.test(cb)) cables[cb] = (cables[cb] || 0) + e.n;
      });
      if (es.length) L(rx + 4, r.bus, lastX, r.bus, ly);
      var ctxt = Object.keys(cables).map(function (k) { return k + "×" + cables[k]; }).join("；");
      if (ctxt) T(rx + 6, r.bus + 4.2, 1.8, fit("線材：" + ctxt, c.w - 12, 1.8), ly, "l", "cab");
    });
  });
  /* 圖例表 */
  var lx = W0 + 10, cw = [14, 62, 56, 16], LH = 8, ly0 = top - 14, tw = cw.reduce(function (a, b) { return a + b; }, 0);
  T(lx, ly0 - 3, 4, "圖例", "RISER-LEGEND", "l", "hd");
  var hdr = ["圖例", "說明", "配置線材", "數量"], yy = ly0, cx = [lx]; cw.forEach(function (w, i) { cx.push(cx[i] + w); });
  function rowLine(yv) { L(lx, yv, lx + tw, yv, "RISER-LEGEND"); }
  rowLine(yy); hdr.forEach(function (h, i) { T(cx[i] + cw[i] / 2, yy + LH / 2, 2.6, h, "RISER-LEGEND", "m", "hd"); }); yy += LH; rowLine(yy);
  var start = ly0, shownKeys = cols.map(function (c) { return c.key; });
  R.systems.forEach(function (s) {
    if (shownKeys.indexOf("all") < 0 && shownKeys.indexOf(s[0]) < 0) return;
    var items = Object.keys(legend).filter(function (n) { return legend[n].sys === s[0]; }); if (!items.length) return;
    var ly = RISER_LAYER[s[0]][0];
    T(lx + 2, yy + LH / 2 + 1, 2.6, s[1], ly, "l", "hd"); yy += LH; rowLine(yy);
    items.forEach(function (n) {
      var lg = legend[n], tot = R.floors.reduce(function (a, f) { return a + (((R.cells[f] || {})[s[0]] || []).filter(function (e) { return e.name === n; }).reduce(function (a2, e) { return a2 + e.n; }, 0)); }, 0);
      sym(cx[0] + cw[0] / 2, yy + LH / 2, lg, ly);
      T(cx[1] + 1.5, yy + LH / 2 + 1, 2.2, fit(n, cw[1] - 3, 2.2), "RISER-LEGEND");
      T(cx[2] + 1.5, yy + LH / 2 + 1, 2, fit(riserCable(n, P), cw[2] - 3, 2), "RISER-LEGEND");
      T(cx[3] + cw[3] / 2, yy + LH / 2, 2.2, tot, "RISER-LEGEND", "m");
      yy += LH; rowLine(yy);
    });
  });
  cx.forEach(function (xv, i) { if (i === 1 || i === 2 || i === 3) L(xv, start, xv, yy, "RISER-LEGEND"); });
  L(lx, start, lx, yy, "RISER-LEGEND"); L(lx + tw, start, lx + tw, yy, "RISER-LEGEND");
  T(lx, yy + 5, 2, "符號旁 ×N 為該層數量；配置線材依平台「線材」規則（可在參數調整）。", "RISER-LEGEND");
  var W = lx + tw + 4, H = Math.max(bottom, yy + 8) + 4;
  B(-4, -2, W + 8, H + 4, "RISER-FRAME");
  return { W: W, H: H, prims: prims, legend: legend, cols: cols };
}
function dxfStr(s) {
  return String(s).replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7e]/g, function (ch) { var h = ch.charCodeAt(0).toString(16).toUpperCase(); while (h.length < 4) h = "0" + h; return "\\U+" + h; });
}
/** AutoCAD R12 ASCII DXF；單位 mm；中文以 \U+XXXX 寫入，不受字碼頁影響 */
function riserDxf(R, sel, opt) {
  opt = opt || {};
  var Lo = riserLayout(R, sel, opt.params, opt), E = [];
  var num = function (v) { return (Math.round(v * 1000) / 1000).toString(); };
  var Y = function (y) { return -y; };
  function line(x1, y1, x2, y2, ly) { E.push("0\nLINE\n8\n" + ly + "\n10\n" + num(x1) + "\n20\n" + num(Y(y1)) + "\n30\n0\n11\n" + num(x2) + "\n21\n" + num(Y(y2)) + "\n31\n0"); }
  Lo.prims.forEach(function (p) {
    if (p.t === "line") line(p.x1, p.y1, p.x2, p.y2, p.ly);
    else if (p.t === "rect") { line(p.x, p.y, p.x + p.w, p.y, p.ly); line(p.x + p.w, p.y, p.x + p.w, p.y + p.h, p.ly); line(p.x + p.w, p.y + p.h, p.x, p.y + p.h, p.ly); line(p.x, p.y + p.h, p.x, p.y, p.ly); }
    else if (p.t === "circle") E.push("0\nCIRCLE\n8\n" + p.ly + "\n10\n" + num(p.x) + "\n20\n" + num(Y(p.y)) + "\n30\n0\n40\n" + num(p.r));
    else if (p.t === "text") {
      var s = "0\nTEXT\n8\n" + p.ly + "\n10\n" + num(p.x) + "\n20\n" + num(Y(p.y)) + "\n30\n0\n40\n" + num(p.h) + "\n1\n" + dxfStr(p.s) + "\n7\nCHT";
      if (p.a === "m") s += "\n72\n1\n11\n" + num(p.x) + "\n21\n" + num(Y(p.y)) + "\n31\n0\n73\n2";
      E.push(s);
    }
  });
  var layers = [["0", 7], ["RISER-TEXT", 7], ["RISER-FLOOR", 8], ["RISER-FRAME", 7], ["RISER-LEGEND", 7]].concat(Lo.cols.map(function (c) { return RISER_LAYER[c.key]; }));
  if (!sel) Object.keys(RISER_LAYER).forEach(function (k) { if (k !== "all" && layers.every(function (l) { return l[0] !== RISER_LAYER[k][0]; })) layers.push(RISER_LAYER[k]); });
  var out = [
    "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$DWGCODEPAGE\n3\nANSI_950\n9\n$INSBASE\n10\n0\n20\n0\n30\n0\n9\n$EXTMIN\n10\n-4\n20\n" + num(-Lo.H - 2) + "\n30\n0\n9\n$EXTMAX\n10\n" + num(Lo.W + 4) + "\n20\n2\n30\n0\n0\nENDSEC",
    "0\nSECTION\n2\nTABLES",
    "0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n0\nENDTAB",
    "0\nTABLE\n2\nLAYER\n70\n" + layers.length + "\n" + layers.map(function (l) { return "0\nLAYER\n2\n" + l[0] + "\n70\n0\n62\n" + l[1] + "\n6\nCONTINUOUS"; }).join("\n") + "\n0\nENDTAB",
    "0\nTABLE\n2\nSTYLE\n70\n1\n0\nSTYLE\n2\nCHT\n70\n0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n0\n42\n2.5\n3\nmsjh.ttc\n4\n\n0\nENDTAB",
    "0\nENDSEC",
    "0\nSECTION\n2\nENTITIES\n" + E.join("\n") + "\n0\nENDSEC",
    "0\nEOF\n"
  ];
  return out.join("\n").replace(/\n/g, "\r\n");
}

var api = { riser: riser, riserSysOf: riserSysOf, riserDxf: riserDxf, riserLayout: riserLayout, riserLegend: riserLegend, riserEntries: riserEntries, riserCols: riserCols, RISER_SYS: RISER_SYS, wiring: wiring, cableClass: cableClass, plan: plan, DEFAULTS: DEFAULTS, IO_RULES: IO_RULES, COMM_RULES: COMM_RULES, ruleOf: ruleOf, IP_RULES: IP_RULES, VLANS: VLANS, CABLE: CABLE, floorRank: floorRank };
if (typeof module === "object" && module.exports) module.exports = api; else root.DESIGN = api;
})(typeof self !== "undefined" ? self : this);
