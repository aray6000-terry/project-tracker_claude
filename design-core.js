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
  var list = Object.keys(panels).sort(function (a, b) { return floorRank(a) - floorRank(b); }).map(function (f) {
    var p = panels[f];
    var diReq = p.di + Math.ceil(p.di * P.spare), doReq = p.do + Math.ceil(p.do * P.spare);
    var n10 = Math.ceil(doReq / 8), rest = Math.max(0, diReq - n10 * 10), n18 = Math.ceil(rest / 18);
    var mods = [], k = 0;
    for (var i = 0; i < n10; i++) mods.push({ id: "IO-" + fl(f) + "-" + pad(++k), type: "10DI8DO", di: 10, do: 8, usedDi: 0, usedDo: 0 });
    for (var j = 0; j < n18; j++) mods.push({ id: "IO-" + fl(f) + "-" + pad(++k), type: "18DI", di: 18, do: 0, usedDi: 0, usedDo: 0 });
    var rows = [];
    p.points.forEach(function (pt) {
      if (pt.type === "COM") { rows.push({ module: "RS-485", ch: "COM", tag: fl(f) + "-COM-" + pad(rows.filter(function (r) { return r.ch === "COM"; }).length + 1), name: pt.name + " #" + pt.seq, note: pt.note }); return; }
      var m = mods.filter(function (x) { return pt.type === "DI" ? x.usedDi < x.di : x.usedDo < x.do; })[0];
      if (!m) return;
      var ch = pt.type === "DI" ? ++m.usedDi : ++m.usedDo;
      rows.push({ module: m.id + "（" + m.type + "）", mod: m.id, type: m.type, ch: pt.type + "-" + pad(ch), tag: m.id + "-" + pt.type + pad(ch), name: (pt.dev || pt.name) + " #" + pt.seq + (pt.point ? "－" + pt.point : ""), dev: (pt.dev || pt.name) + " #" + pt.seq, point: pt.point || "", loc: pt.loc || "", note: pt.note });
    });
    mods.forEach(function (m) { for (var a = m.usedDi + 1; a <= m.di; a++) rows.push({ module: m.id + "（" + m.type + "）", mod: m.id, type: m.type, ch: "DI-" + pad(a), tag: m.id + "-DI" + pad(a), name: "預留", dev: "預留", point: "", loc: "", note: "" });
      for (var b = m.usedDo + 1; b <= m.do; b++) rows.push({ module: m.id + "（" + m.type + "）", mod: m.id, type: m.type, ch: "DO-" + pad(b), tag: m.id + "-DO" + pad(b), name: "預留", dev: "預留", point: "", loc: "", note: "" }); });
    /* 依模組、DI 在前 DO 在後、通道順序排列（接線時照端子順序看） */
    var mi = {}; mods.forEach(function (m, i) { mi[m.id] = i; });
    rows.sort(function (a, b) { var x = (mi[a.mod] === undefined ? 999 : mi[a.mod]) - (mi[b.mod] === undefined ? 999 : mi[b.mod]); return x || (a.ch < b.ch ? -1 : a.ch > b.ch ? 1 : 0); });
    return { floor: f, panel: fl(f) + " 監控箱", di: p.di, do: p.do, proto: p.proto, n18: n18, n10: n10, modules: mods.map(function (m) { return { id: m.id, type: m.type, usedDi: m.usedDi, usedDo: m.usedDo }; }), rows: rows };
  });
  var tot = { di: 0, do: 0, proto: 0, n18: 0, n10: 0 };
  list.forEach(function (p) { tot.di += p.di; tot.do += p.do; tot.proto += p.proto; tot.n18 += p.n18; tot.n10 += p.n10; });
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
  var third = 0, subnets = [], rows = [];
  VLANS.forEach(function (v) {
    var hs = hosts[v[0]]; if (!hs.length) return;
    var need = Math.ceil(hs.length * (1 + P.growth)) + 20, pfx = prefixFor(need), blocks = Math.pow(2, 24 - pfx);
    third = Math.ceil(third / blocks) * blocks;
    var net3 = third, base = P.baseNet + "." + net3 + ".0/" + pfx;
    subnets.push({ vlan: v[1], key: v[0], name: v[2], cidr: base, gateway: P.baseNet + "." + net3 + ".1", hosts: hs.length, capacity: Math.pow(2, 32 - pfx) - 2 });
    third += blocks;
    var idx = 0, counters = {};
    function ipAt(i) { var o = 20 + i; return P.baseNet + "." + (net3 + Math.floor(o / 256)) + "." + (o % 256); }
    var servers = hs.filter(function (h) { return h.server || h.sw; }), devs = hs.filter(function (h) { return !(h.server || h.sw); });
    servers.forEach(function (h, i) { var key = h.abbr + h.floor; counters[key] = (counters[key] || 0) + 1;
      rows.push({ vlan: v[1], sys: v[2], ip: P.baseNet + "." + net3 + "." + (2 + i), name: h.sw || (h.abbr + "-" + fl(h.floor) + "-" + pad(counters[key])), floor: h.floor, device: h.name, mask: pfx, gw: P.baseNet + "." + net3 + ".1" }); });
    devs.sort(function (a, b) { return floorRank(a.floor) - floorRank(b.floor); }).forEach(function (h) {
      var key = h.abbr + h.floor; counters[key] = (counters[key] || 0) + 1;
      rows.push({ vlan: v[1], sys: v[2], ip: ipAt(idx++), name: h.abbr + "-" + fl(h.floor) + "-" + pad(counters[key]), floor: h.floor, device: h.name, mask: pfx, gw: P.baseNet + "." + net3 + ".1" });
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
  if (params) { P.ioRules = params.ioRules; P.ipRules = params.ipRules; P.extraIo = params.extraIo || []; P.systems = params.systems || []; }
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

var api = { wiring: wiring, cableClass: cableClass, plan: plan, DEFAULTS: DEFAULTS, IO_RULES: IO_RULES, COMM_RULES: COMM_RULES, ruleOf: ruleOf, IP_RULES: IP_RULES, VLANS: VLANS, CABLE: CABLE, floorRank: floorRank };
if (typeof module === "object" && module.exports) module.exports = api; else root.DESIGN = api;
})(typeof self !== "undefined" ? self : this);
