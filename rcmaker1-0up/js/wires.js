/* Public Release Build
   Cleaned: 2025-09-16T13:01:51
   Notes: Debug logs removed; minor whitespace tidy. No behavior changes intended.
*/
'use strict';
// wires.js

//デバッグ用インポート。「//デバッグ（削除）」で検索して出てきた行は、本番時削除してください。
import {
  attachWireDebugHandlers,
  notifyWireDebugWireUpdated,
  clearWireDebugIfMatches,
} from "./wire-debug-panel.js";

import { openWireMenu } from "./wire-menu.js";
import {
  attachWireStatus,
  removeWireStatusById,
  setWireStatusColor,
  setWireStatusState,
  setWireStatusDisplay,
  setWireStatusIconPosition,
  getWireStatusDuplexId,
  setWireStatusDuplexId,
  clearWireStatusDuplexId,
  getWireStatus,
  updateWireStatusPositionFromPath,
  setWireStatusTextOffset,
  getWireStatusIconCenter,
  setWireStatusTextTheta,
  getWireStatusTextTheta,
  getTextOffsetFromTheta,
} from "./wire-admin.js";
import { updateBoxCounterUI } from "./boxes.js";

const DEFAULT_WIDTH = 7; //線の太さ。規定値7
const ARROW_SIZE_PX = 8; // マーカー三角形の奥行きと合わせる　deffault:8
const ARROW_MARGIN_PX = 8; // 見た目のゆとり deffault:2
const NO_ARROW_PAD_PX = 4; // 矢印なし時の見切れ防止パッド
const ARROW_SCALE = 3; // ★ 2倍
const DUPLEX_MARGIN = 40; //平行線のマージン
const TEXTBOX_X = 0;
const TEXTBOX_Y = 280;
const ICON_CIRCLE_SIZE = 15; //アイコンエリアの半径px（直径は2倍サイズ）
const IC_TEXT_GAP = 2; //アイコンとテキストのマージンpx
const DEFAULT_TEXT = "ダブルクリックで入力"; //テキストボックスのデフォルト入力値
const size = ARROW_SIZE_PX * ARROW_SCALE;
const ELLIPSE_W = 30; // 楕円横幅(px)
const ELLIPSE_H = 45; // 楕円縦幅(px)
const ELLIPSE_STRICT_CENTER_PATH = false;
const MAX_TEXTBOX_SIZE_X = 250; //テキストボックス最大サイズX
const MAX_TEXTBOX_SIZE_Y = 70; //テキストボックス最大サイズY
const TEXTBOX_MAXCHARACOUNT = 60; //テキストボックス最大文字数
const WIRE_ICON_TEXT_MAX_LINES = 4; //アイコンテキスト状態の最大行数
const WIRE_ICON_TEXT_MAX_XY = [150, 200]; //アイコンテキスト状態のテキストボックス最大サイズpx

//テキストボックスドラッグ時の角度
const SMOOTH_ALPHA = 0.25; // 0..1（大きいほど追従が速い）
const SNAP_DEG = 45; // スナップ刻み（度）
const SNAP_STICKY_DEG = 8; // 近接時だけ吸着する幅（度）※常時スナップなら 180 に
const SNAP_RAD = (SNAP_DEG * Math.PI) / 180;
const SNAP_STICKY_RAD = (SNAP_STICKY_DEG * Math.PI) / 180;
const SNAP_PRESETS_DEG = [0, 25, 90, 155, 180, 205, 270, 335]; //スナップ角度のプリセット
const SNAP_PRESETS = SNAP_PRESETS_DEG.map((d) => (d * Math.PI) / 180);
const SNAP_PRESET_STICKY_DEG = 8;
const SNAP_PRESET_STICKY_RAD = (SNAP_PRESET_STICKY_DEG * Math.PI) / 180;
export const DRAG_AREA_LIMITS = { widthRatio: 0.65, heightRatio: 0.6 }; //ドラッグエリアの最大比率

function _normAngle(rad) {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}
function _mixAngle(prev, next, alpha) {
  const d = _normAngle(next - prev);
  return prev + d * alpha;
}
function _closestAngle(theta, targetsRad) {
  let best = targetsRad[0],
    bestAbs = Math.PI * 2;
  for (const t of targetsRad) {
    const d = Math.abs(_normAngle(theta - t)); // 円周上の最短差
    if (d < bestAbs) {
      bestAbs = d;
      best = t;
    }
  }
  return best;
}
function _snapAnglePreset(theta) {
  const snapped = _closestAngle(theta, SNAP_PRESETS);
  const diff = Math.abs(_normAngle(theta - snapped));
  return diff <= SNAP_PRESET_STICKY_RAD ? snapped : theta;
}

// 平行線ペアIDの簡易採番（フェーズ27ではローカル採番でOK）
let _duplexSeq = 1;
function _nextDuplexId() {
  return `d${_duplexSeq++}`;
}

//線色変更プリセット
const PRESET_COLORS = [
  "#0d244dff",
  "#f10e0eff",
  "#33CC00",
  "#440ad7ff",
  "#00DDAA",
  "#00BFFF",
  "#FF007F",
  "#FFCC00",
  "#8B0000",
  "#1ab3b3ff",
  "#a47102ff",
  "#8B008B",
  "#7e311aff",
  "#a4a4a4ff",
  "#000000ff",
  "#ffffffff",
];
//アイコンプリセット
const PRESET_ICONS = [
  "./images/1_heart.png",
  "./images/2_bheart.png",
  "./images/3_star.png",
  "./images/4_ikari.png",
  "./images/5_bikkuri.png",
  "./images/6_hatena.png",
  "./images/7_akushu.png",
  "./images/8_punch.png",
  "./images/9_vs.png",
  "./images/10_sweat.png",
  "./images/11_bakudan.png",
  "./images/12_search.png",
  "./images/13_yandere.png",
  "./images/14_shield.png",
  "./images/15_game.png",
  "./images/blankicontitele.png",
];
const BLANK_ICON_PATH = [
  "./images/blankicontitele.png",
  "./images/blankicon.png",
]; //ブランクアイコンセット。配列0がメニュー表示、配列1が実際の表示
const DEFAULT_COLOR = PRESET_COLORS[0]; // 既定色をプリセット0番に揃える

let _canvas = null;
let _svg = null;
let _layer; // 線の可視レイヤ <g>
let _hitLayer; // 当たり判定レイヤ <g>（必要に応じて）
let _defsPrepared = false;
let _defsEl = null;
let _overlay = null; //テキスト・アイコンを載せるHTMLオーバーレイ
let _defaultDragAreaCaptured = false;
let _resizeClampBound = false;
let _dragAreaRO = null;
const DRAG_DEFAULT_AREA = [1200, 800]; //ドラッグエリアXとYの初期値

//初期ドラッグエリアサイズセット
export function setDefaultDragAreaSize(w, h, { force = false } = {}) {
  if (_defaultDragAreaCaptured && !force) return;
  if (w > 0 && h > 0) {
  }
}

// ★ ドラッグエリアのサイズを px 指定で反映
export function setDragAreaSize(width, height) {
  if (!_canvas || !_svg) return;
  _canvas.style.width = `${width}px`;
  _canvas.style.height = `${height}px`;
  _svg.setAttribute("width", String(_canvas.style.width));
  _svg.setAttribute("height", String(_canvas.style.height));
}
export function getDragAreaSize() {
  // 1) 内部状態 _dragArea があれば最優先
  if (
    typeof _dragArea !== "undefined" &&
    _dragArea &&
    typeof _dragArea.w === "number" &&
    typeof _dragArea.h === "number"
  ) {
    return { w: _dragArea.w, h: _dragArea.h };
  }
  // 2) SVG の width/height 属性 or 実測
  const attrW = parseInt(_svg?.getAttribute?.("width") || "", 10);
  const attrH = parseInt(_svg?.getAttribute?.("height") || "", 10);
  if (!Number.isNaN(attrW) && !Number.isNaN(attrH)) {
    return { w: attrW, h: attrH };
  }
  const bb = _svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
  if (bb.width && bb.height) {
    return { w: Math.round(bb.width), h: Math.round(bb.height) };
  }
  // 3) 既定の DRAG_DEFAULT_AREA にフォールバック
  if (
    typeof DRAG_DEFAULT_AREA !== "undefined" &&
    Array.isArray(DRAG_DEFAULT_AREA)
  ) {
    return { w: DRAG_DEFAULT_AREA[0] | 0, h: DRAG_DEFAULT_AREA[1] | 0 };
  }
  return { w: 0, h: 0 };
}

// 実際の表示サイズ（DOMの実測）を返す：SVG/オーバーレイ双方
export function getDragAreaComputedSize() {
  const svgBB = _svg?.getBoundingClientRect?.();
  const ovBB = _overlay?.getBoundingClientRect?.();
  return {
    svg: {
      w: Math.round(svgBB?.width || 0),
      h: Math.round(svgBB?.height || 0),
    },
    overlay: {
      w: Math.round(ovBB?.width || 0),
      h: Math.round(ovBB?.height || 0),
    },
  };
}
// コンソール等から使えるように（開発用）
if (typeof window !== "undefined") {
  window.getDragAreaSize = getDragAreaSize;
  window.getDragAreaComputedSize = getDragAreaComputedSize;
}

// 現在のブラウザから算出される最大サイズ（px
function getMaxDragAreaSize() {
  const vw = window?.innerWidth ?? document.documentElement.clientWidth ?? 0;
  const vh = window?.innerHeight ?? document.documentElement.clientHeight ?? 0;
  return {
    maxW: Math.max(0, Math.round(vw * DRAG_AREA_LIMITS.widthRatio)),
    maxH: Math.max(0, Math.round(vh * DRAG_AREA_LIMITS.heightRatio)),
  };
}

//★削除かも
//画面構成が落ち着いた“あと”のサイズを初回自動保存
export function captureDefaultDragAreaSizeWhenStable() {
  if (_defaultDragAreaCaptured) return;
  let prevW = 0,
    prevH = 0,
    stableFrames = 0;

  const tick = () => {
    if (_defaultDragAreaCaptured) return;
    if (!_canvas) {
      requestAnimationFrame(tick);
      return;
    }

    //const w = _canvas.clientWidth || 0;
    //const h = _canvas.clientHeight || 0;
    const w = DRAG_DEFAULT_AREA[0];
    const h = DRAG_DEFAULT_AREA[1];

    if (w > 0 && h > 0 && w === prevW && h === prevH) {
      stableFrames += 1;
      if (stableFrames >= 2) {
        // 2フレーム連続で不変＝安定
        return;
      }
    } else {
      stableFrames = 0;
      prevW = w;
      prevH = h;
    }
    requestAnimationFrame(tick);
  };

  // レイアウトが動き切った“本当に最後”を狙う
  // - window.load 後にも呼ぶ
  // - すぐにも呼んでおき、RAFで安定を待つ
  requestAnimationFrame(tick);
}

function _ensureDefs() {
  if (_defsEl && _defsEl.isConnected) return _defsEl;
  _defsEl = _svg.querySelector("defs");
  if (!_defsEl) {
    _defsEl = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    _svg.prepend(_defsEl);
  }
  return _defsEl;
}

// ワイヤ固有のマーカーを <defs> に用意（色連動）
function _ensureMarkerForWire(wire) {
  _ensureDefs();
  const sid = `m-start-${wire.id}`;
  const eid = `m-end-${wire.id}`;

  let mStart = _defsEl.querySelector(`#${sid}`);
  if (!mStart) {
    mStart = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    mStart.setAttribute("id", sid);
    mStart.setAttribute("markerWidth", size);
    mStart.setAttribute("markerHeight", size);
    mStart.setAttribute("refX", 8);
    mStart.setAttribute("refY", size / 2);
    mStart.setAttribute("orient", "auto-start-reverse");
    mStart.setAttribute("markerUnits", "userSpaceOnUse");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", `M0,0 L0,${size} L${size},${size / 2} Z`);
    mStart.appendChild(p);
    _defsEl.appendChild(mStart);
  }

  let mEnd = _defsEl.querySelector(`#${eid}`);
  if (!mEnd) {
    mEnd = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    mEnd.setAttribute("id", eid);
    mEnd.setAttribute("markerWidth", size);
    mEnd.setAttribute("markerHeight", size);
    mEnd.setAttribute("refX", 8);
    mEnd.setAttribute("refY", size / 2);
    mEnd.setAttribute("orient", "auto-start-reverse");
    mEnd.setAttribute("markerUnits", "userSpaceOnUse");
    const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p2.setAttribute("d", `M0,0 L0,${size} L${size},${size / 2} Z`);
    mEnd.appendChild(p2);
    _defsEl.appendChild(mEnd);
  }

  const color = wire.color || DEFAULT_COLOR;
  _applyMarkerColor(mStart, color);
  _applyMarkerColor(mEnd, color);

  return { startId: sid, endId: eid };
}

// マーカー色塗り関数
function _applyMarkerColor(markerEl, color) {
  if (!markerEl) return;
  const p = markerEl.firstElementChild;
  if (p) {
    p.setAttribute("fill", color);
    p.setAttribute("stroke", color);
  }
}

// 矢印の付与/解除（arrowTypeに応じて）
function _applyMarkers(wire) {
  const { arrowType, path, path2 } = wire;

  // いったん全クリア
  [path, path2].filter(Boolean).forEach((p) => {
    p.removeAttribute("marker-start");
    p.removeAttribute("marker-end");
  });
  //★削除P27if (arrowType === 'roundtrip') {
  // 往復線は矢印なし（仕様）
  //★削除P27  return;
  //★削除P27}
  if (arrowType === "single_noarrow") {
    setWireStatusState(wire, arrowType);
    return;
  }

  // 必要に応じてマーカー生成＆適用
  const ids = _ensureMarkerForWire(wire);

  if (arrowType === "single_both") {
    path.setAttribute("marker-start", `url(#${ids.startId})`);
    path.setAttribute("marker-end", `url(#${ids.endId})`);
  } else if (arrowType === "single_sted") {
    path.setAttribute("marker-start", `url(#${ids.startId})`);
  } else if (arrowType === "single_edst") {
    path.setAttribute("marker-end", `url(#${ids.endId})`);
  }
  setWireStatusState(wire, arrowType);
}

// === 矢印タイプ設定 ===
export function setWireArrowType(wireId, type) {
  const w = _wires.get(wireId);
  if (!w) return;

  // 正規化
  const allowed = new Set([
    "single_both",
    "single_sted",
    "single_edst",
    "single_noarrow",
  ]);
  const t = allowed.has(type) ? type : "single_noarrow";

  w.arrowType = t;

  //★削除P27if (t === 'roundtrip') {
  if (!w.path2) {
    const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p2.classList.add("wire-stroke2");
    p2.setAttribute("fill", "none");
    p2.setAttribute("stroke", w.color || DEFAULT_COLOR);
    p2.setAttribute("stroke-width", String(w.width || DEFAULT_WIDTH));
    p2.setAttribute("stroke-linecap", "round");
    w.g.appendChild(p2);
    w.path2 = p2;
  }
  //★削除P27} else {
  if (w.path2) {
    w.path2.remove();
    w.path2 = null;
  }
  //★削除P27}

  _updateWireGeometry(w);
  _applyMarkers(w);
}

// ボックスと線の管理
const _boxes = new Map();
const _wires = new Map();
const _wiresByBox = new Map();
let _wireSeq = 1;

// ========== 公開関数 ==========

// 新規追加（内部構造刷新に伴う再実装）
export function initWires(canvasEl, svgEl) {
  _canvas = canvasEl;
  _svg = svgEl;
  captureDefaultDragAreaSizeWhenStable();
  _beginDragAreaClampObserver();

  if (!_resizeClampBound) {
    window.addEventListener("resize", () => {
      if (!_canvas) return;
      const { maxW, maxH } = getMaxDragAreaSize();
      const cw = _canvas.clientWidth,
        ch = _canvas.clientHeight;
      const nw = Math.min(cw, maxW),
        nh = Math.min(ch, maxH);
      if (nw !== cw || nh !== ch) setDragAreaSize(nw, nh);
    });
    _resizeClampBound = true;
  }

  // SVG初期化
  _svg.setAttribute("width", String(_canvas.clientWidth));
  _svg.setAttribute("height", String(_canvas.clientHeight));
  _svg.style.pointerEvents = "none"; // ひとまずステップ1では線に直接触らない

  // <defs> ひな形（矢印マーカー等は後段で使用）
  if (!_defsPrepared) {
    const defs = ensureChild(_svg, "defs");
    // ここで将来の <marker> を定義予定（ステップ1は未使用）
    _defsPrepared = true;
  }

  // レイヤ構成
  _layer = ensureChild(_svg, "g", { class: "wires-layer" });
  _hitLayer = ensureChild(_svg, "g", { class: "wires-hit-layer" }); // 今は未使用

  //HTMLオーバーレイ（テキスト/アイコン用）
  if (!_overlay || !_overlay.isConnected) {
    _overlay = document.createElement("div");
    _overlay.className = "wire-overlay";
    _canvas.appendChild(_overlay);
  }

  // Canvasサイズ変化に追従（リサイズでSVGを追従）
  const ro = new ResizeObserver(() => {
    _svg.setAttribute("width", String(_canvas.clientWidth));
    _svg.setAttribute("height", String(_canvas.clientHeight));
    if (_overlay) {
      _overlay.style.transform = "translateZ(0)";
    }
    updateAllConnections(); // 既存線を再配置（ズレ防止）
  });
  ro.observe(_canvas);
  _ensureDefs();
}

// _canvas の実サイズが変わったら即クランプする
function _beginDragAreaClampObserver() {
  if (!("ResizeObserver" in window)) return;
  try {
    _dragAreaRO && _dragAreaRO.disconnect();
  } catch {}

  _dragAreaRO = new ResizeObserver((entries) => {
    if (!_canvas) return;
    const rect = entries[0]?.contentRect;
    const curW = Math.round(rect?.width ?? _canvas?.clientWidth ?? 0);
    const curH = Math.round(rect?.height ?? _canvas?.clientHeight ?? 0);
    const { maxW, maxH } = getMaxDragAreaSize();
    const overW = curW > maxW;
    const overH = curH > maxH;
    if (overW || overH) {
      // ★ 超過している側だけ指定して更新
      setDragAreaSize(overW ? maxW : undefined, overH ? maxH : undefined);
    }
  });
  if (_canvas && _canvas.isConnected) {
    _dragAreaRO.observe(_canvas);
  }
}

// ボックス登録
export function registerBox(boxId, boxEl) {
  _boxes.set(boxId, { el: boxEl });
  if (!_wiresByBox.has(boxId)) _wiresByBox.set(boxId, new Set());
  try {
    updateBoxCounterUI();
  } catch {}
}

// ボックス登録解除（紐づく線も削除）
export function unregisterBox(boxId) {
  const set = _wiresByBox.get(boxId);
  if (set) {
    // 関連線を全削除
    [...set].forEach((wid) => _deleteWireInternal(wid));
  }
  _wiresByBox.delete(boxId);
  _boxes.delete(boxId);
  try {
    updateBoxCounterUI();
  } catch {}
}

// ファイル名で PRESET_ICONS のインデックスを絶対/相対に関わらず見つける
function _iconIndexFromKey(key) {
  if (!key) return -1;
  const name = String(key).split("/").pop(); // 例: "3_star.png"
  return PRESET_ICONS.findIndex((p) => p.endsWith(name));
}

// ボックス接続
export function connectBoxes(fromBoxId, toBoxId, opts = {}) {
  if (!_boxes.has(fromBoxId) || !_boxes.has(toBoxId)) return null;

  const id = `w${_wireSeq++}`;
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("data-wire-id", id);
  g.dataset.wireId = id;
  g.classList.add("wire");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.classList.add("wire-stroke");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", DEFAULT_COLOR);
  path.setAttribute("stroke-width", String(DEFAULT_WIDTH));
  path.setAttribute("stroke-linecap", "round");
  path.style.pointerEvents = "stroke";

  g.appendChild(path);
  _layer.appendChild(g);

  const wire = {
    id,
    fromId: fromBoxId,
    toId: toBoxId,
    g,
    path,
    color: DEFAULT_COLOR,
    width: DEFAULT_WIDTH,
    arrowType: "single_noarrow",
    lineType: "none",
    text: "",
    iconKey: PRESET_ICONS[0],
  };
  _wires.set(id, wire);

  //P27追加
  if (opts && typeof opts === "object") {
    if (opts.duplexId) wire.duplexId = opts.duplexId; // 同一ならペア扱い
    if (opts.duplexSide) wire.duplexSide = opts.duplexSide; // -1 = 左側 / +1 = 右側
    if (opts.arrowType) setWireArrowType(wire.id, opts.arrowType);
  }

  // 右クリックメニュー（UIは wire-menu.js へ委譲）
  const openMenuAt = (ev) => {
    ev.preventDefault();
    const curIconIdx = _iconIndexFromKey(wire.iconKey);
    openWireMenu({
      anchorX: ev.clientX,
      anchorY: ev.clientY,
      current: {
        arrowType: wire.arrowType || "single_noarrow",
        lineType: wire.lineType || "none",
        color: wire.color || DEFAULT_COLOR,
        iconIndex: curIconIdx >= 0 ? curIconIdx : -1,
        duplexId: wire.duplexId ?? null,
      },
      presets: {
        colors: PRESET_COLORS,
        icons: PRESET_ICONS,
      },
      onApply: ({ arrowType, lineType, color, iconIndex, duplexAction }) => {
        setWireArrowType(wire.id, arrowType);
        setWireLineType(wire.id, lineType);
        setWireColor(wire.id, color);
        if (
          (lineType === "icon" || lineType === "iconText") &&
          iconIndex >= 0
        ) {
          setWireIcon(wire.id, PRESET_ICONS[iconIndex]);
        }
        if (duplexAction === "make") {
          toParallel && toParallel(wire.id);
        } else if (duplexAction === "single") {
          toSingle && toSingle(wire.id);
        }
      },
      onDelete: () => {
        deleteWire(wire.id);
      },
      onCancel: () => {
        /* 何もしない（初期に戻して閉じる） */
      },
      onMakeParallel: () => {
        toParallel && toParallel(wire.id);
      },
      onMakeSingle: () => {
        toSingle && toSingle(wire.id);
      },
    });
  };

  g.addEventListener("contextmenu", openMenuAt);
  path.addEventListener("contextmenu", openMenuAt);

  if (!_wiresByBox.has(fromBoxId)) _wiresByBox.set(fromBoxId, new Set());
  if (!_wiresByBox.has(toBoxId)) _wiresByBox.set(toBoxId, new Set());
  _wiresByBox.get(fromBoxId).add(id);
  _wiresByBox.get(toBoxId).add(id);

  _updateWireGeometry(wire);
  attachWireStatus(wire);
  //P27 平行線ペアID（あれば保存＋wireにも保持）
  if (opts && opts.duplexId) {
    wire.duplexId = String(opts.duplexId);
    setWireStatusDuplexId(id, wire.duplexId);
  }
  //attachWireDebugHandlers(wire); //デバッグ（削除）
  return id;

  //P27追加モジュール
  // 単線→平行線化：元線を削除し、A/B 2本を新規作成
  function _makeParallelFromWire(wireId) {
    const src = _wires.get(wireId);
    if (!src) return;
    const fromId = src.fromId;
    const toId = src.toId;
    // テキスト/アイコンごと削除
    deleteWire(wireId);
    const duplexId = _nextDuplexId();
    // A：左側、終点矢印（single_sted）
    const aId = connectBoxes(fromId, toId, {
      duplexId,
      duplexSide: -1,
      arrowType: "single_sted",
    });
    // B：右側、始点矢印（single_edst）
    const bId = connectBoxes(fromId, toId, {
      duplexId,
      duplexSide: +1,
      arrowType: "single_edst",
    });
    // ここでは色/テキスト/アイコンは引き継がない（仕様）
  }
}

// 対象ボックスに紐づく線を更新
export function updateConnectionsForBox(boxId) {
  const set = _wiresByBox.get(boxId);
  if (!set) return;
  set.forEach((wid) => {
    const w = _wires.get(wid);
    if (w) _updateWireGeometry(w);
  });
}

// 全線削除
export function clearAllWires() {
  // 1) 各ワイヤを内部削除（SVGとHTMLオーバーレイをまとめて除去）
  const ids = Array.from(_wires.keys());
  ids.forEach((id) => _deleteWireInternal(id));

  // 2) 管理マップ類をリセット
  _wires.clear();
  _wiresByBox.forEach((set) => set.clear());
  _wiresByBox.clear();
  _wireSeq = 1;

  // 3) 矢印マーカー（このモジュールが作ったもの）を掃除
  _ensureDefs?.();
  if (typeof _defsEl !== "undefined" && _defsEl) {
    [..._defsEl.querySelectorAll('[id^="m-start-"],[id^="m-end-"]')].forEach(
      (n) => n.remove()
    );
  }

  // 4) 念のため：オーバーレイ直下の残骸を全消去（安全網）
  if (typeof _overlay !== "undefined" && _overlay && _overlay.isConnected) {
    _overlay.replaceChildren(); // or: _overlay.innerHTML = '';
  }
}

// 線色設定
export function setWireColor(wireId, colorOrIndex) {
  const w = _wires.get(wireId);
  if (!w) return;
  w.color = _normalizeColor(colorOrIndex);

  // パスの色更新
  const color = w.color;
  w.path.setAttribute("stroke", color);
  if (w.path2) w.path2.setAttribute("stroke", color);

  // マーカー色も同期
  _ensureMarkerForWire(w);
  _applyMarkers(w);

  // 幾何再計算（短線での見切れ微調整）
  _updateWireGeometry(w);
  setWireStatusColor(w, w.color);
  //notifyWireDebugWireUpdated(w); //デバッグ（削除）
}

// 線タイプを設定
export function setWireLineType(wireId, type) {
  const w = _wires.get(wireId);
  if (!w) return;
  w.lineType = type;
  const isIconText = type === "iconText" || type === "texticon";
  if (isIconText) {
    const { dx, dy } = _readSavedTextOffset(w);
    const th = _readSavedTextTheta(w);
    w.textDx = typeof dx === "number" ? dx : 0;
    w.textDy = typeof dy === "number" ? dy : 0;
    w.textTheta = typeof th === "number" ? th : 0;
  }
  // テキスト系へ切り替えた直後、未設定ならデフォルト文言
  if (
    (type === "text" || type === "iconText") &&
    (!w.text || String(w.text).trim() === "")
  ) {
    w.text = DEFAULT_TEXT;
  }
  setWireStatusDisplay(w, type);
  _ensureWireWidgets(w);
  _updateWireGeometry(w);
  //notifyWireDebugWireUpdated(w);
}

// テキスト設定
export function setWireText(wireId, s) {
  const w = _wires.get(wireId);
  if (!w) return;
  w.text = isBlankText(s) ? DEFAULT_TEXT : _clampTextLength(s);
  if (w.textEl) {
    tEl.textContent = w.text ?? DEFAULT_TEXT;
    if (w.lineType === "iconText" && tEl) {
      _autoFitWireText(
        tEl,
        typeof WIRE_ICON_TEXT_MAX_WIDTH !== "undefined"
          ? WIRE_ICON_TEXT_MAX_WIDTH
          : MAX_TEXTBOX_SIZE_X
      );
    }
  } else {
    _ensureWireWidgets(w);
  }
  _updateWireGeometry(w);
  setWireStatusDisplay(w, "text");
  //notifyWireDebugWireUpdated(w);
}

//テキスト文字数クランプ用ヘルパ
function _clampTextLength(s) {
  try {
    const str = String(s ?? "");
    const max = (TEXTBOX_MAXCHARACOUNT | 0) > 0 ? TEXTBOX_MAXCHARACOUNT | 0 : 0;
    if (!max) return str;
    return str.length > max ? str.slice(0, max) : str;
  } catch {
    return String(s ?? "");
  }
}

//テキスト空欄判定ヘルパ
function isBlankText(s) {
  try {
    const str = String(s ?? "");
    // \s（改行/タブ/空白）全角空白（\u3000）を除去して判定
    return str.replace(/[\s\u3000]/g, "").length === 0;
  } catch {
    return true;
  }
}

// アイコン設定
export function setWireIcon(wireId, iconKey) {
  const w = _wires.get(wireId);
  if (!w) return;
  w.iconKey = iconKey || w.iconKey || PRESET_ICONS[0];
  if (w.iconKey == BLANK_ICON_PATH[0]) {
    w.iconKey = BLANK_ICON_PATH[1];
  }
  if (w.iconEl) w.iconEl.src = w.iconKey;
  _updateWireGeometry(w);
}

export function deleteWire(wireId) {
  const w = _wires.get(wireId);
  if (!w) return;

  if (w.duplexId) {
    // 同じ duplexId を持つ線をすべて拾う（通常は2本）
    const targets = [];
    _wires.forEach((vw, vid) => {
      if (vw.duplexId === w.duplexId) targets.push(vid);
    });
    // まとめて内部削除（片方→相方の順でも多重呼び出しは安全）
    targets.forEach((id) => _deleteWireInternal(id));
  } else {
    _deleteWireInternal(wireId);
  }
}

// ========== 内部ヘルパー ==========

// SVG子要素を確実に用意
function ensureChild(parent, tag, attrs = null) {
  let el = parent.querySelector(
    `:scope > ${tag}${attrs?.class ? "." + attrs.class : ""}`
  );
  if (!el) {
    el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs)
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el);
  }
  return el;
}

// === iconText: テキスト幅を内容に合わせて自動調整（上限で折返し） ===
function _measureTextPx(el) {
  // el と同じフォントでテキストの自然幅を測る（パディング等は含めない）
  const s = getComputedStyle(el);
  const m = document.createElement("span");
  m.textContent = el.textContent || "";
  Object.assign(m.style, {
    position: "absolute",
    left: "-9999px",
    top: "-9999px",
    visibility: "hidden",
    whiteSpace: "pre", // 1行で計測
    font: s.font,
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    fontWeight: s.fontWeight,
    letterSpacing: s.letterSpacing,
  });
  document.body.appendChild(m);
  const w = Math.ceil(m.getBoundingClientRect().width);
  m.remove();
  return w;
}

// === iconText: テキスト幅を内容に合わせて自動調整（上限で折返し） ===
function _autoFitWireText(el, maxPx) {
  if (!el) return;
  const maxW = (maxPx | 0) > 0 ? maxPx | 0 : 150;

  // 自然幅を計測し、丸め誤差の安全マージンを足す
  const natural = _measureTextPx(el);
  const fudge = 2; // ← ここが効きます（早期改行の防止）

  // 折返し設定と幅制御（途中改行を抑制）
  el.style.display = "block"; // shrink-to-fit回避
  el.style.boxSizing = "content-box";
  el.style.whiteSpace = "pre-wrap"; // 改行保持＋折返し
  el.style.wordBreak = "break-word"; // 長い単語のみ分割
  el.style.overflowWrap = "break-word"; // anywhere は使わない
  el.style.overflow = "hidden";

  el.style.minWidth = "1ch"; // 1文字でも縦積みにならない保険
  el.style.maxWidth = maxW + "px";
  el.style.width = Math.min(natural + fudge, maxW) + "px";
}

// このWireに必要なウィジェット（HTML）を用意/破棄
function _ensureWireWidgets(w) {
  if (!_overlay || !_overlay.isConnected) return;
  if (w.container && w.container.isConnected) {
    w.container.remove();
    w.container = null;
    w.textEl = null;
    w.iconEl = null;
  }
  if (w.lineType === "none") return;
  // コンテナ
  const cont = document.createElement("div");
  cont.className = "wire-widget";
  if (isBlankText(w.text)) {
    w.text = DEFAULT_TEXT;
  }
  // クリックでボックスドラッグ等と競合しないように
  cont.addEventListener("pointerdown", (ev) => ev.stopPropagation(), {
    capture: true,
  });
  cont.addEventListener("mousedown", (ev) => ev.stopPropagation(), {
    capture: true,
  });

  cont.addEventListener("contextmenu", (ev) => {
    const curIconIdx = _iconIndexFromKey(w.iconKey);
    ev.preventDefault();
    openWireMenu({
      anchorX: ev.clientX,
      anchorY: ev.clientY,
      current: {
        arrowType: w.arrowType || "single_noarrow",
        lineType: w.lineType || "none",
        color: w.color || DEFAULT_COLOR,
        iconIndex: curIconIdx >= 0 ? curIconIdx : -1,
        duplexId: w.duplexId ?? null,
      },
      presets: {
        colors: PRESET_COLORS,
        icons: PRESET_ICONS,
      },
      onApply: ({ arrowType, lineType, color, iconIndex, duplexAction }) => {
        setWireArrowType(w.id, arrowType);
        setWireLineType(w.id, lineType);
        setWireColor(w.id, color);
        if (
          (lineType === "icon" || lineType === "iconText") &&
          iconIndex >= 0
        ) {
          setWireIcon(w.id, PRESET_ICONS[iconIndex]);
        }
        if (duplexAction === "make") {
          toParallel && toParallel(w.id);
        } else if (duplexAction === "single") {
          toSingle && toSingle(w.id);
        }
      },
      onDelete: () => {
        deleteWire(w.id);
      },
      onCancel: () => {},
    });
  });

  _overlay.appendChild(cont);
  w.container = cont;

  if (w.lineType === "text") {
    if (isBlankText(w.text)) {
      w.text = DEFAULT_TEXT;
    }
    const txt = document.createElement("div");
    txt.className = "wire-text";
    txt.textContent = w.text;
    // 中央固定（線の中点）
    txt.style.position = "absolute";
    txt.style.left = "50%";
    txt.style.top = "50%";
    txt.style.transform = "translate(-50%,-50%)";
    txt.style.pointerEvents = "auto";
    txt.style.userSelect = "none";
    txt.style.touchAction = "none";
    txt.style.width = "auto";
    txt.style.maxWidth = MAX_TEXTBOX_SIZE_X + "px";
    txt.style.maxHeight = MAX_TEXTBOX_SIZE_Y + "px";
    txt.style.overflow = "hidden";

    cont.appendChild(txt);
    w.textEl = txt;
    _attachTextEditing(w);
  } else if (w.lineType === "icon") {
    const img = document.createElement("img");
    img.className = "wire-icon";
    if (!w.iconKey) w.iconKey = PRESET_ICONS[0];
    img.src = w.iconKey || PRESET_ICONS[0];
    img.alt = "";
    img.style.position = "absolute";
    img.style.left = "50%";
    img.style.top = "50%";
    img.style.transform = "translate(-50%, -50%)";
    img.style.pointerEvents = "auto";
    cont.appendChild(img);
    w.iconEl = img;
  } else if (w.lineType === "iconText") {
    const wrap = document.createElement("div");
    wrap.className = "wire-icontext";
    const img = document.createElement("img");
    img.className = "wire-icon";
    if (!w.iconKey) w.iconKey = PRESET_ICONS[0];
    img.src = w.iconKey || PRESET_ICONS[0];
    img.alt = "";
    if (isBlankText(w.text)) {
      w.text = DEFAULT_TEXT;
    }
    const txt = document.createElement("div");
    /*
    txt.className = "wire-text";
    txt.textContent = w.text ?? DEFAULT_TEXT;
    txt.style.maxWidth = MAX_TEXTBOX_SIZE_X + "px";
    txt.style.maxHeight = MAX_TEXTBOX_SIZE_Y + "px";
    txt.style.width = "auto";
    txt.style.display = "block";
    txt.style.minWidth = "80px";
    txt.style.whiteSpace = "pre-wrap";
    txt.style.wordBreak = "break-word";
    txt.style.overflowWrap = "anywhere";
    txt.style.overflow = "hidden";
    */
    txt.className = "wire-text";
    txt.textContent = w.text ?? DEFAULT_TEXT;

    // ←ここからスタイル（折返し可にして、見た目の上限も付与）
    txt.style.display = "block";
    txt.style.whiteSpace = "pre-wrap";
    txt.style.wordBreak = "break-word";
    txt.style.overflowWrap = "break-word";
    txt.style.overflow = "hidden";
    txt.style.boxSizing = "content-box";

    // 既存の最大サイズ（お持ちの定数に合わせて）
    const MAXW =
      typeof WIRE_ICON_TEXT_MAX_WIDTH !== "undefined"
        ? WIRE_ICON_TEXT_MAX_WIDTH
        : MAX_TEXTBOX_SIZE_X;
    const MAXH =
      typeof WIRE_ICON_TEXT_MAX_HEIGHT !== "undefined"
        ? WIRE_ICON_TEXT_MAX_HEIGHT
        : MAX_TEXTBOX_SIZE_Y;
    txt.style.maxWidth = MAXW + "px";
    txt.style.maxHeight = MAXH + "px";
    txt.style.minWidth = "1ch";

    // ★生成直後に“初期文言の長さ”で幅を決定（最大幅まで、以降は折返し）
    _autoFitWireText(txt, MAXW);

    // 編集中にも都度フィット（重複ガード）
    if (txt.__fitListener)
      txt.removeEventListener("input", txt.__fitListener, true);
    txt.__fitListener = () => _autoFitWireText(txt, MAXW);
    txt.addEventListener("input", txt.__fitListener, true);

    // ★編集中も入力のたびに幅を再計算（最大幅で折返しに到達）
    txt.addEventListener("input", () => {
      _autoFitWireText(
        txt,
        typeof WIRE_ICON_TEXT_MAX_WIDTH !== "undefined"
          ? WIRE_ICON_TEXT_MAX_WIDTH
          : MAX_TEXTBOX_SIZE_X
      );
    });

    wrap.appendChild(img);
    wrap.appendChild(txt);
    cont.appendChild(wrap);
    w.iconEl = img;
    w.textEl = txt;
    _attachTextEditing(w);
    _ensureIconRing(w);
    _ensureTextSizeObserver(w);
  }
}

// 現在の線の中点へウィジェットを配置
function _positionWireWidgets(w, x1, y1, x2, y2) {
  _ensureIconRingAttached(w);
  if (w.iconRingEl) {
    w.iconRingEl.style.width = ICON_CIRCLE_SIZE * 2 + "px";
    w.iconRingEl.style.height = ICON_CIRCLE_SIZE * 2 + "px";
  }
  if (!w.container || !w.container.isConnected) return;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  // まずは中央アンカー（CSS translate(-50%,-50%) と組み合わせる前提）
  w.container.style.left = `${mx}px`;
  w.container.style.top = `${my}px`;
  // texticon/iconText のときは「アイコンの中心」を線の中点に一致させる補正
  if (
    w.lineType === "iconText" ||
    w.lineType === "texticon" ||
    w.display === "iconText" ||
    w.display === "texticon"
  ) {
    try {
      const ovb = _overlay.getBoundingClientRect();
      const icon = w.iconEl || w.container;
      const ib = icon.getBoundingClientRect();
      const iconCX = ib.left - ovb.left + ib.width / 2;
      const iconCY = ib.top - ovb.top + ib.height / 2;
      const dx = mx - iconCX;
      const dy = my - iconCY;
      const curL = parseFloat(w.container.style.left) || 0;
      const curT = parseFloat(w.container.style.top) || 0;
      w.container.style.left = curL + dx + "px";
      w.container.style.top = curT + dy + "px";
    } catch {}
    // アイコン中心は (mx,my)
    setWireStatusIconPosition(w, mx, my);
  }
  // アイコン単体のときは実測（従来）
  else if (w.lineType === "icon") {
    let ix = null,
      iy = null;
    try {
      const ovb = _overlay.getBoundingClientRect();
      const t = w.iconEl || w.container;
      if (ovb && t) {
        const r = t.getBoundingClientRect();
        ix = r.left - ovb.left + r.width / 2;
        iy = r.top - ovb.top + r.height / 2;
      }
    } catch {}
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) {
      ix = mx;
      iy = my;
    }
    setWireStatusIconPosition(w, ix, iy);
  }
  // テキストのみ/非表示のときはクリア
  else {
    setWireStatusIconPosition(w, null, null);
  }
  if (
    (w.lineType === "iconText" ||
      w.lineType === "texticon" ||
      w.display === "iconText" ||
      w.display === "texticon") &&
    w.textEl
  ) {
    const t = w.textEl;
    t.style.position = "absolute";
    t.style.left = "50%";
    t.style.top = "50%";
    t.style.pointerEvents = "auto";
    t.style.userSelect = "none";
    t.style.touchAction = "none";
    // ★ ドラッグ中は上書きしない（既存ガード）
    if (!w._isTextDragging) {
      // ★ アイコン実寸が未確定(0×0)のフレームは transform を触らない＝前位置のまま維持
      let iconReady = true;
      try {
        const ib = (w.iconEl || w.container).getBoundingClientRect();
        iconReady = ib.width > 0 && ib.height > 0;
      } catch {}
      if (iconReady) {
        const st = getWireStatus(w);
        const hasSaved =
          Number.isFinite(st?.textDx) && Number.isFinite(st?.textDy);
        let dx, dy;
        if (hasSaved) {
          // ★ 最優先：保存済みの dx/dy をそのまま使う → アイコン変更でも位置が変わらない
          dx = st.textDx;
          dy = st.textDy;
        } else {
          // フォールバック：角度 or 既定値から計算（環境にある方だけ使う）
          const th =
            typeof getWireStatusTextTheta === "function"
              ? getWireStatusTextTheta(w)
              : 0;
          if (typeof _offsetNoOverlapEllipse === "function") {
            const off = _offsetNoOverlapEllipse(w, th);
            dx = Math.round(off.dx);
            dy = Math.round(off.dy);
          } else if (typeof _offsetNoOverlapCircular === "function") {
            const off = _offsetNoOverlapCircular(w, th);
            dx = Math.round(off.dx);
            dy = Math.round(off.dy);
          } else {
            const duplex =
              typeof getWireStatusDuplexId === "function"
                ? getWireStatusDuplexId(w)
                : null;
            dx =
              duplex == null && typeof TEXTBOX_X !== "undefined"
                ? TEXTBOX_X
                : 0;
            dy =
              duplex == null && typeof TEXTBOX_Y !== "undefined"
                ? TEXTBOX_Y
                : 0;
          }
          // 以後は保存が効くように同期
          if (typeof setWireStatusTextOffset === "function") {
            setWireStatusTextOffset(w, dx, dy);
          }
        }
        // 画面反映（既存の transform と同じ書き方）
        t.style.transform = `translate(-50%,-50%) translate(${dx}px, ${dy}px)`;
      }
      // iconReady でなければ何もしない：前の transform を維持
    }

    _bindTextDragStrong(w); // 既存どおり
  }
  if (w.lineType === "text" && w.textEl && !w._isTextDragging) {
    const t = w.textEl;
    t.style.position = "absolute";
    t.style.left = "50%";
    t.style.top = "50%";
    t.style.transform = "translate(-50%,-50%)";
    t.style.pointerEvents = "auto";
  }
  if (w.iconRingEl) {
    const { x, y } = getWireStatusIconCenter(w);
    w.iconRingEl.style.display = x != null && y != null ? "" : "none";
  }
}

// アイコン中心のデバッグ用リング（半径 ICON_CIRCLE_SIZE）
function _ensureIconRing(w) {
  const c = w?.container;
  if (!c) return;

  if (!w.iconRingEl) {
    const ring = document.createElement("div");
    ring.className = "wire-icon-ring";
    Object.assign(ring.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: ICON_CIRCLE_SIZE * 2 + "px",
      height: ICON_CIRCLE_SIZE * 2 + "px",
      transform: "translate(-50%, -50%)",
      borderRadius: "999px",
      //background: 'rgba(0, 200, 0, 0.20)', // ←デバッグ用の薄緑。後で透明にします
      background: "transparent", // ←こっちが透明表示
      pointerEvents: "none",
    });
    // テキストなどより背面に置きたいので先頭に追加
    c.prepend(ring);
    w.iconRingEl = ring;
  }
}
function _ensureIconRingAttached(w) {
  const c = w?.container;
  if (!c) return;
  if (!w.iconRingEl || w.iconRingEl.parentNode !== c) {
    if (w.iconRingEl && w.iconRingEl.parentNode) {
      w.iconRingEl.parentNode.removeChild(w.iconRingEl);
    }
    w.iconRingEl = null;
    _ensureIconRing(w);
  }
}

//リングまわり系
function _ensureTextSizeObserver(w) {
  const t = w && w.textEl;
  // ★ textEl が無い/計測不能なら即やめる
  if (!t || typeof t.getBoundingClientRect !== "function") return;

  // ★ 既に同じ要素を監視中なら何もしない（再入抑止）
  if (w._textRo && w._textRoTarget === t) return;

  // 監視先が変わった/残骸がある場合はクリーンアップ
  if (w._textRo) {
    try {
      w._textRo.disconnect();
    } catch {}
  }
  w._textRo = null;
  w._textRoTarget = t;

  // 初回サイズ（try/catchで安全に）
  let bb = { width: 0, height: 0 };
  try {
    bb = t.getBoundingClientRect();
  } catch {}
  w._textSize = { w: bb.width || 0, h: bb.height || 0 };

  // 監視を開始
  const ro = new ResizeObserver(() => {
    // ★ コールバック時点でも現在の textEl を取り直して確認
    const cur = w && w.textEl;
    if (
      !cur ||
      cur !== w._textRoTarget ||
      typeof cur.getBoundingClientRect !== "function"
    ) {
      try {
        ro.disconnect();
      } catch {}
      w._textRo = null;
      w._textRoTarget = null;
      return;
    }
    // 安全にサイズ更新
    let b = { width: 0, height: 0 };
    try {
      b = cur.getBoundingClientRect();
    } catch {}
    w._textSize = { w: b.width || 0, h: b.height || 0 };

    // 角度があるなら再配置（既存関数のみ使用）
    if (typeof w._lastAngle === "number") {
      const { dx, dy } = _offsetOnCircleByTheta(w, w._lastAngle);
      _applyTextOffset(w, dx, dy);
    }
  });

  w._textRo = ro;
  ro.observe(t);
}

function _offsetOnCircleByTheta(w, theta) {
  const t = w?.textEl;
  const c = w?.container;
  if (!t || !c) return { dx: 0, dy: 0 };
  const bw = (w._textSize?.w ?? t.getBoundingClientRect().width) || 0;
  const bh = (w._textSize?.h ?? t.getBoundingClientRect().height) || 0;
  const proj =
    Math.abs(Math.cos(theta)) * (bw / 2) + Math.abs(Math.sin(theta)) * (bh / 2);
  const R = ICON_CIRCLE_SIZE + proj + IC_TEXT_GAP;
  const dx = Math.round(Math.cos(theta) * R);
  const dy = Math.round(Math.sin(theta) * R);
  return { dx, dy };
}

function _applyTextOffset(w, dx, dy) {
  const t = w?.textEl;
  if (!t) return;
  t.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
  setWireStatusTextOffset(w, dx, dy);
}

// ===== Helpers for iconText line-break limiting (explicit newlines) =====
function _getLogicalTextFromEditable(el) {
  // innerHTML を正規化して、明示的な改行を \n に揃える
  try {
    let html = String(el.innerHTML ?? "");
    html = html.replace(/<div><br><\/div>/gi, "\n"); // 空行DIV
    html = html.replace(/<div>/gi, "\n");
    html = html.replace(/<\/div>/gi, "");
    html = html.replace(/<br\s*\/?>/gi, "\n");
    html = html.replace(/&nbsp;/gi, " ");
    html = html.replace(/<[^>]*>/g, "");
    html = html.replace(/\r\n?/g, "\n");
    return html;
  } catch {
    return String(el.textContent ?? "");
  }
}

function _countLogicalLines(el) {
  const t = _getLogicalTextFromEditable(el);
  return t.length ? t.split("\n").length : 1;
}

function _placeCaretEnd(el) {
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  } catch {}
}

function _enableIconTextMaxLineBreaks(el, maxLines) {
  if (!el || !(+maxLines > 0)) return;
  if (el.__iconTextMaxLineHandlers) return; // 重複付与防止

  const onBeforeInput = (e) => {
    // 入力前スナップショット（超過時の復元用）
    el.__prevHTML = el.innerHTML;

    const type = e.inputType || "";
    if (type === "insertParagraph" || type === "insertLineBreak") {
      // 既に上限行なら次の改行をブロック
      if (_countLogicalLines(el) >= maxLines) {
        e.preventDefault();
      }
    } else if (type === "insertFromPaste") {
      // 貼り付けは行数の残り枠内でのみ改行を許可
      e.preventDefault();
      let text = "";
      try {
        text = (e.clipboardData || window.clipboardData).getData("text") || "";
      } catch {}
      const cur = _countLogicalLines(el);
      const remain = Math.max(0, maxLines - cur);
      const parts = String(text).replace(/\r\n?/g, "\n").split("\n");
      if (remain <= 0) {
        // 改行は空白に変換して挿入
        const insert = parts.join(" ");
        document.execCommand("insertText", false, insert);
      } else {
        const limited = parts.slice(0, remain + 1).join("\n");
        const leftover = parts.slice(remain + 1).join(" ");
        const finalInsert = leftover
          ? limited + (limited ? " " : "") + leftover
          : limited;
        document.execCommand("insertText", false, finalInsert);
      }
    }
    // 他の入力タイプは onInput 側でチェック
  };

  const onInput = () => {
    // 適用後に超過していたら直前状態へ復元（ブラウザ差異対策）
    if (
      _countLogicalLines(el) > maxLines &&
      typeof el.__prevHTML === "string"
    ) {
      el.innerHTML = el.__prevHTML;
      _placeCaretEnd(el);
    }
  };

  const onKeyDown = (e) => {
    // beforeinput 非対応ブラウザの保険
    if (e.isComposing) return;
    if (e.key === "Enter" && _countLogicalLines(el) >= maxLines) {
      e.preventDefault();
    }
  };

  const onCompEnd = () => {
    // IME確定後も超過チェック
    if (
      _countLogicalLines(el) > maxLines &&
      typeof el.__prevHTML === "string"
    ) {
      el.innerHTML = el.__prevHTML;
      _placeCaretEnd(el);
    }
  };

  el.addEventListener("beforeinput", onBeforeInput, true);
  el.addEventListener("input", onInput, true);
  el.addEventListener("keydown", onKeyDown, true);
  el.addEventListener("compositionend", onCompEnd, true);
  el.__iconTextMaxLineHandlers = {
    onBeforeInput,
    onInput,
    onKeyDown,
    onCompEnd,
  };
}

function _disableIconTextMaxLineBreaks(el) {
  const h = el && el.__iconTextMaxLineHandlers;
  if (!h) return;
  el.removeEventListener("beforeinput", h.onBeforeInput, true);
  el.removeEventListener("input", h.onInput, true);
  el.removeEventListener("keydown", h.onKeyDown, true);
  el.removeEventListener("compositionend", h.onCompEnd, true);
  el.__iconTextMaxLineHandlers = null;
  el.__prevHTML = undefined;
}

// ===== iconText のテキスト：明示の行数上限で入力を制限（“入らない”方式） =====
/*不要かも
function _enforceIconTextMaxLines(el, maxLines) {
  if (!el || !(+maxLines > 0)) return;

  const norm = (s) =>
    String(s ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
  const countLines = (s) => {
    const t = norm(s);
    return t.length === 0 ? 1 : t.split("\n").length; // 空でも1行扱い
  };

  // 直前状態のスナップショット（復元用）
  const snap = () => {
    el.__prevText = el.textContent || "";
  };

  // 行数超過なら直前に戻す（＝“入力できなかった”体験）
  const restoreIfExceeded = () => {
    if (!el.isConnected) return;
    const cur = el.textContent || "";
    if (countLines(cur) <= maxLines) return;
    el.textContent = el.__prevText || "";
    // キャレットを末尾へ
    try {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    } catch {}
  };

  const onKeyDown = (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter") {
      if (countLines(el.textContent || "") >= maxLines) {
        e.preventDefault(); // これ以上の改行は入れない
        return;
      }
    }
    // 入力前にスナップショット
    snap();
  };

  const onBeforeInput = () => {
    snap();
  }; // 入力前に確実に保存
  const onInput = () => {
    restoreIfExceeded();
  }; // 入力後に検査

  // 貼り付け：残り行数分だけ改行を許し、それ以上の改行は空白化
  const onPaste = (e) => {
    let text = "";
    try {
      text = (e.clipboardData || window.clipboardData).getData("text") || "";
    } catch {}
    const curLines = countLines(el.textContent || "");
    const remain = Math.max(0, maxLines - curLines);
    const parts = norm(text).split("\n");
    if (remain <= 0) {
      e.preventDefault();
      const insert = parts.join(" "); // 改行は空白に
      snap();
      try {
        document.execCommand("insertText", false, insert);
      } catch {
        el.textContent = (el.textContent || "") + insert;
      }
      return;
    }
    // 許容量を超える改行は空白に
    const limited = parts.slice(0, remain + 1).join("\n");
    const leftover = parts.slice(remain + 1).join(" ");
    const finalInsert = leftover
      ? limited + (limited ? " " : "") + leftover
      : limited;

    e.preventDefault();
    snap();
    try {
      document.execCommand("insertText", false, finalInsert);
    } catch {
      el.textContent = (el.textContent || "") + finalInsert;
    }
    // 念のため行数超過チェック
    restoreIfExceeded();
  };

  const onCompStart = () => {
    snap();
  }; // IME開始時に保存
  const onCompEnd = () => {
    restoreIfExceeded();
  }; // 確定後に検査

  if (!el.__iconTextMaxLines) {
    el.addEventListener("keydown", onKeyDown, true);
    el.addEventListener("beforeinput", onBeforeInput, true);
    el.addEventListener("input", onInput, true);
    el.addEventListener("paste", onPaste, true);
    el.addEventListener("compositionstart", onCompStart, true);
    el.addEventListener("compositionend", onCompEnd, true);
    el.__iconTextMaxLines = {
      onKeyDown,
      onBeforeInput,
      onInput,
      onPaste,
      onCompStart,
      onCompEnd,
    };
  }
}

// 解除（編集終了時に呼ぶ）
function _detachIconTextMaxLines(el) {
  const h = el && el.__iconTextMaxLines;
  if (!h) return;
  el.removeEventListener("keydown", h.onKeyDown, true);
  el.removeEventListener("beforeinput", h.onBeforeInput, true);
  el.removeEventListener("input", h.onInput, true);
  el.removeEventListener("paste", h.onPaste, true);
  el.removeEventListener("compositionstart", h.onCompStart, true);
  el.removeEventListener("compositionend", h.onCompEnd, true);
  el.__iconTextMaxLines = null;
}
  */

// wireのテキスト要素に編集挙動を付与
function _attachTextEditing(w) {
  if (!w.textEl) return;
  const el = w.textEl;

  const startEdit = (ev) => {
    ev.stopPropagation();
    if (el.dataset.editing === "1") return;
    el.dataset.editing = "1";
    el.setAttribute("contenteditable", "true");
    el.classList.add("is-editing");
    // 全選択して編集開始
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.focus();
    // 外側クリックで確定（編集中のみ）
    el._outsideCommit = (e) => {
      if (!el.isConnected) return;
      const t = e.target;
      if (!el.contains(t)) {
        commitEdit();
        el.blur();
      }
    };
    if (w.lineType === "iconText" && el === w.textEl) {
      _enableIconTextMaxLineBreaks(el, WIRE_ICON_TEXT_MAX_LINES);
    }
    document.addEventListener("pointerdown", el._outsideCommit, true);
  };

  const commitEdit = () => {
    if (el.dataset.editing !== "1") return;
    if (w.lineType === "iconText" && el === w.textEl) {
      _disableIconTextMaxLineBreaks(el);
    }
    el.removeAttribute("contenteditable");
    el.classList.remove("is-editing");
    el.dataset.editing = "";
    w.text = el.textContent ?? "";
    // 一時リスナ解除
    if (el._outsideCommit) {
      document.removeEventListener("pointerdown", el._outsideCommit, true);
      el._outsideCommit = null;
    }
    // 空欄ならデフォルトに戻す
    if (isBlankText(w.text)) {
      w.text = DEFAULT_TEXT;
      el.textContent = w.text;
      if (w.lineType === "iconText" && w.textEl) {
        const MAXW =
          typeof WIRE_ICON_TEXT_MAX_WIDTH !== "undefined"
            ? WIRE_ICON_TEXT_MAX_WIDTH
            : MAX_TEXTBOX_SIZE_X;
        _autoFitWireText(w.textEl, MAXW);
      }
    } else if (
      (TEXTBOX_MAXCHARACOUNT | 0) > 0 &&
      w.text.length > (TEXTBOX_MAXCHARACOUNT | 0)
    ) {
      // 確定時も最大文字数に丸める
      w.text = w.text.slice(0, TEXTBOX_MAXCHARACOUNT | 0);
      el.textContent = w.text;
    }
  };

  const cancelEdit = () => {
    if (el.dataset.editing !== "1") return;
    if (w.lineType === "iconText" && el === w.textEl) {
      _disableIconTextMaxLineBreaks(el);
    }
    el.textContent = w.text ?? "";
    if (w.lineType === "iconText" && w.textEl) {
      const maxW =
        typeof WIRE_ICON_TEXT_MAX_WIDTH !== "undefined"
          ? WIRE_ICON_TEXT_MAX_WIDTH
          : MAX_TEXTBOX_SIZE_X;
      _autoFitWireText(w.textEl, maxW);
    }
    el.removeAttribute("contenteditable");
    el.classList.remove("is-editing");
    el.dataset.editing = "";
    // 一時リスナ解除
    if (el._outsideCommit) {
      document.removeEventListener("pointerdown", el._outsideCommit, true);
      el._outsideCommit = null;
    }
    if (w.lineType === "iconText" && el === w.textEl) {
      _detachIconTextLineLimit(el);
    }
  };

  // イベント
  el.addEventListener("dblclick", startEdit);
  el.addEventListener("mousedown", (e) => e.stopPropagation(), {
    capture: true,
  });
  el.addEventListener("pointerdown", (e) => e.stopPropagation(), {
    capture: true,
  });

  el.addEventListener("keydown", (e) => {
    // Enter は改行。Esc はキャンセル。
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
      el.blur();
    }
  });

  el.addEventListener("blur", () => {
    // フォーカス外れたら確定（Escはkeydownでキャンセル済み）
    if (el.dataset.editing === "1") commitEdit();
  });
  if (!el.dataset.maxlenHooked) {
    el.dataset.maxlenHooked = "1";

    const __maxLen =
      (TEXTBOX_MAXCHARACOUNT | 0) > 0 ? TEXTBOX_MAXCHARACOUNT | 0 : 0;

    const __truncateIfNeeded = () => {
      if (!__maxLen) return;
      let s = el.textContent ?? "";
      if (s.length > __maxLen) {
        el.textContent = s.slice(0, __maxLen);
        try {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } catch {}
      }
    };

    el.addEventListener("input", __truncateIfNeeded);
    el.addEventListener("paste", (e) => {
      if (!__maxLen) return;
      e.preventDefault();
      let text = "";
      try {
        text = (e.clipboardData || window.clipboardData).getData("text");
      } catch {}
      const cur = el.textContent ?? "";
      const allowed = Math.max(0, __maxLen - cur.length);
      const insert = String(text ?? "").slice(0, allowed);
      try {
        document.execCommand("insertText", false, insert);
      } catch {
        el.textContent = cur + insert;
      }
    });
  }
}

// ========== 色正規化ヘルパ ==========
function _normalizeColor(colorOrIndex) {
  if (typeof colorOrIndex === "number") {
    const i = Math.max(
      0,
      Math.min(PRESET_COLORS.length - 1, Math.floor(colorOrIndex))
    );
    return PRESET_COLORS[i];
  }
  if (typeof colorOrIndex === "string" && colorOrIndex.trim()) {
    return colorOrIndex.trim();
  }
  return DEFAULT_COLOR;
}

// ワイヤ削除（内部）
function _deleteWireInternal(wireId) {
  const w = _wires.get(wireId);
  if (!w) return;

  _wiresByBox.get(w.fromId)?.delete(wireId);
  _wiresByBox.get(w.toId)?.delete(wireId);

  // 付帯DOM（path2）
  if (w.path2) {
    w.path2.remove();
    w.path2 = null;
  }
  if (w.container && w.container.isConnected) {
    // 付帯HTML（テキスト/アイコン）
    w.container.remove();
    w.container = null;
    w.textEl = null;
    w.iconEl = null;
  }

  // マーカー削除
  _ensureDefs();
  const sid = _defsEl.querySelector(`#m-start-${w.id}`);
  const eid = _defsEl.querySelector(`#m-end-${w.id}`);
  if (sid) sid.remove();
  if (eid) eid.remove();

  // 本体
  w.g.remove();
  _wires.delete(wireId);
  //clearWireDebugIfMatches(wireId); //デバッグ（削除）
  removeWireStatusById(wireId);
}

// ★ すべてのボックスを削除（関連ワイヤも unregisterBox 経由で削除）
export function clearAllBoxes() {
  const ids = Array.from(_boxes.keys());
  for (const id of ids) {
    const el = _boxes.get(id)?.el;
    try {
      unregisterBox(id);
    } catch (e) {

    }
    if (el && el.isConnected) {
      try {
        el.remove();
      } catch {}
    }
  }
}

// ★ リセット：ボックス全消去 → 線全消去 → サイズを初期値に戻す
export function resetWorkspaceToDefault() {
  try {
    clearAllBoxes();
  } catch {}
  try {
    clearAllWires();
  } catch {}
  try {
    setDragAreaSize(DRAG_DEFAULT_AREA[0], DRAG_DEFAULT_AREA[1]);
  } catch {}
}

// 全線再配置
function updateAllConnections() {
  _wires.forEach((w) => _updateWireGeometry(w));
}

// ボックス矩形（キャンバス基準座標）
function _getBoxRect(boxId) {
  const rec = _boxes.get(boxId);
  if (!rec) return null;
  const b = rec.el.getBoundingClientRect();
  const c = _canvas.getBoundingClientRect();
  return {
    x: b.left - c.left,
    y: b.top - c.top,
    w: b.width,
    h: b.height,
  };
}

// 辺と辺を結ぶ端点計算（矩形の外周に寄せる）
/*不要かも
function _computeEdgePoints(fromRect, toRect) {
  // 中心点
  const x1c = fromRect.x + fromRect.w / 2;
  const y1c = fromRect.y + fromRect.h / 2;
  const x2c = toRect.x + toRect.w / 2;
  const y2c = toRect.y + toRect.h / 2;

  // ベクトル
  let dx = x2c - x1c;
  let dy = y2c - y1c;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  // from側：矩形外周への射出
  const fromHalfW = fromRect.w / 2,
    fromHalfH = fromRect.h / 2;
  const toHalfW = toRect.w / 2,
    toHalfH = toRect.h / 2;

  // 各軸で到達する正規化距離を求め、小さい方を採用（矩形辺にヒット）
  const txFrom = fromHalfW / Math.abs(ux || 1e-6);
  const tyFrom = fromHalfH / Math.abs(uy || 1e-6);
  const tFrom = Math.min(txFrom, tyFrom);

  const txTo = toHalfW / Math.abs(ux || 1e-6);
  const tyTo = toHalfH / Math.abs(uy || 1e-6);
  const tTo = Math.min(txTo, tyTo);

  // 端点
  const x1 = x1c + ux * tFrom;
  const y1 = y1c + uy * tFrom;
  const x2 = x2c - ux * tTo;
  const y2 = y2c - uy * tTo;

  return { x1, y1, x2, y2 };
}
*/

// オフセット（ox, oy）した仮中心線で、矩形外周との交点を求める
function _computeEdgePointsShifted(
  fromRect,
  toRect,
  ox = 0,
  oy = 0,
  expand = 0
) {
  // 中心点（オフセット適用）
  const x1c = fromRect.x + fromRect.w / 2 + ox;
  const y1c = fromRect.y + fromRect.h / 2 + oy;
  const x2c = toRect.x + toRect.w / 2 + ox;
  const y2c = toRect.y + toRect.h / 2 + oy;

  // ベクトル
  let dx = x2c - x1c;
  let dy = y2c - y1c;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  // 半幅・半高（境界を外側に少し拡張して計算）
  const fromHalfW = fromRect.w / 2 + expand;
  const fromHalfH = fromRect.h / 2 + expand;
  const toHalfW = toRect.w / 2 + expand;
  const toHalfH = toRect.h / 2 + expand;

  // 軸ごとの到達距離（矩形辺に当たる方を採用）
  const txFrom = fromHalfW / Math.abs(ux || 1e-6);
  const tyFrom = fromHalfH / Math.abs(uy || 1e-6);
  const tFrom = Math.min(txFrom, tyFrom);

  const txTo = toHalfW / Math.abs(ux || 1e-6);
  const tyTo = toHalfH / Math.abs(uy || 1e-6);
  const tTo = Math.min(txTo, tyTo);

  // 端点
  const x1 = x1c + ux * tFrom;
  const y1 = y1c + uy * tFrom;
  const x2 = x2c - ux * tTo;
  const y2 = y2c - uy * tTo;

  return { x1, y1, x2, y2 };
}

// パス更新
function _updateWireGeometry(wire) {
  const fr = _getBoxRect(wire.fromId);
  const tr = _getBoxRect(wire.toId);
  if (!fr || !tr) return;

  // まず「中心線」で法線を求める（左右判定用）
  const cx1 = fr.x + fr.w / 2,
    cy1 = fr.y + fr.h / 2;
  const cx2 = tr.x + tr.w / 2,
    cy2 = tr.y + tr.h / 2;
  const dx0 = cx2 - cx1,
    dy0 = cy2 - cy1;
  const len0 = Math.hypot(dx0, dy0) || 1;
  const ux0 = dx0 / len0,
    uy0 = dy0 / len0;
  const nx0 = -uy0,
    ny0 = ux0; // 左法線（中心線基準）

  // 平行線オフセット量（中心線に対して左右に ± DUPLEX_MARGIN/2）
  let ox = 0,
    oy = 0;
  if (wire.duplexId && (wire.duplexSide === -1 || wire.duplexSide === +1)) {
    const half = (typeof DUPLEX_MARGIN === "number" ? DUPLEX_MARGIN : 32) / 2;
    ox = nx0 * half * wire.duplexSide;
    oy = ny0 * half * wire.duplexSide;
  }

  // 矢印と線幅を考慮して、矩形境界を少し外側に“拡張”して交点を求める
  const width = Number(
    wire?.width || (typeof DEFAULT_WIDTH !== "undefined" ? DEFAULT_WIDTH : 2)
  );
  // ← めり込み対策で少し強めに（必要なら 1.2～1.4 に調整）
  const expand = (ARROW_SIZE_PX + ARROW_MARGIN_PX) * 1.0 + width * 0.75;

  // オフセット後の仮中心線で、矩形外周との交点を計算
  let { x1, y1, x2, y2 } = _computeEdgePointsShifted(fr, tr, ox, oy, expand);

  // 方向ベクトル／法線（確定端点から）
  const dx = x2 - x1,
    dy = y2 - y1;
  let len = Math.hypot(dx, dy) || 1;
  const ux = dx / len,
    uy = dy / len; // 進行方向の単位ベクトル
  const nx = -uy,
    ny = ux; // 左法線

  // --- ここを修正：矢印がある側の判定を正しく ---
  // single_sted : 終点(to)側に矢印
  // single_edst : 始点(from)側に矢印
  const at = wire.arrowType || "single_noarrow";
  const hasStartArrow = at === "single_both" || at === "single_edst"; // ← 修正
  const hasEndArrow = at === "single_both" || at === "single_sted"; // ← 修正

  let padStart = hasStartArrow
    ? ARROW_SIZE_PX + ARROW_MARGIN_PX
    : NO_ARROW_PAD_PX;
  let padEnd = hasEndArrow ? ARROW_SIZE_PX + ARROW_MARGIN_PX : NO_ARROW_PAD_PX;

  // 線が短い場合に備えてパッドを縮小（食い込み・反転防止）
  const totalPad = padStart + padEnd;
  if (len <= totalPad + 1) {
    const k = Math.max(0, (len - 1) / Math.max(1, totalPad));
    padStart *= k;
    padEnd *= k;
  }

  // 端点を「外向き」にオフセット（始点は +u、終点は −u）
  x1 += ux * padStart;
  y1 += uy * padStart;
  x2 -= ux * padEnd;
  y2 -= uy * padEnd;

  const color = wire.color || DEFAULT_COLOR;

  // 単線（path2 は作らない）
  const d = `M ${x1} ${y1} L ${x2} ${y2}`;
  wire.path.setAttribute("d", d);
  wire.path.setAttribute("stroke", color);
  wire.path.setAttribute("stroke-width", width);
  _positionWireWidgets(wire, x1, y1, x2, y2);

  // 後始末
  if (wire.path2 && wire.path2.isConnected) {
    wire.path2.remove();
    wire.path2 = null;
  }
  updateWireStatusPositionFromPath(wire);
  //notifyWireDebugWireUpdated(wire); //デバッグ（削除）
}

//ドラッグ用
function _bindTextDragStrong(w) {
  const t = w?.textEl;
  const c = w?.container;
  if (!t || !c || c._textDragBound) return;
  c._textDragBound = true;

  const THRESHOLD = 3; // ドラッグ開始しきい値(px)
  const R_FIXED = ICON_CIRCLE_SIZE + IC_TEXT_GAP;

  let pressed = false;
  let dragging = false;
  let startX = 0,
    startY = 0;
  let activeId = null;

  const isTextMode = () => {
    const d = w.display || w.lineType;
    return d === "texticon" || d === "iconText";
  };
  const insideText = (cx, cy) => {
    const r = t.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  };

  const onDown = (e) => {
    if (e.button !== 0) return;
    if (!isTextMode()) return;
    if (w._editingText) return;
    if (!insideText(e.clientX, e.clientY)) return;

    pressed = true;
    dragging = false;
    activeId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;

    // レイアウト上書き防止（押下直後から）
    w._isTextDragging = true;

    // 次回の起点角を準備（未設定なら既存保存から復元）
    if (typeof w._lastAngle !== "number") {
      const th =
        typeof getWireStatusTextTheta === "function"
          ? getWireStatusTextTheta(w)
          : 0;
      if (typeof th === "number") w._lastAngle = th;
    }
  };

  const onMove = (e) => {
    if (!pressed || e.pointerId !== activeId) return;
    if (!e.buttons) return;

    const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (!dragging && moved < THRESHOLD) return;
    if (!dragging && moved >= THRESHOLD) {
      dragging = true;
      w._isTextDragging = true;
      try {
        c.setPointerCapture(e.pointerId);
      } catch {}
    }

    const center = getWireStatusIconCenter(w);
    if (center.x == null || center.y == null) return;

    // overlay原点に揃える（重要）
    const ovb = _overlay.getBoundingClientRect();
    const px = e.clientX - ovb.left;
    const py = e.clientY - ovb.top;

    // 角度（お使いのスムージング/スナップがあれば適用）
    const thetaRaw = Math.atan2(py - center.y, px - center.x);
    const prev = typeof w._lastAngle === "number" ? w._lastAngle : thetaRaw;
    const thetaSmoothed = _mixAngle
      ? _mixAngle(prev, thetaRaw, SMOOTH_ALPHA ?? 0.25)
      : thetaRaw;
    const theta = _snapAnglePreset(thetaSmoothed);
    //const theta = _snapAngle ? _snapAngle(thetaSmoothed, SNAP_RAD, SNAP_STICKY_RAD) : thetaSmoothed;

    const { dx, dy } = _offsetNoOverlapEllipse(w, theta);

    // 保存（角度＝正）＋ 互換（dx,dy）
    setWireStatusTextTheta?.(w, theta);
    setWireStatusTextOffset?.(w, Math.round(dx), Math.round(dy));

    // 描画はサブピクセルで滑らかに
    w.textEl.style.transform = `translate(-50%, -50%) translate(${dx.toFixed(
      2
    )}px, ${dy.toFixed(2)}px)`;
    w._lastAngle = theta;

    e.preventDefault();
    e.stopPropagation();
  };

  const onUp = (e) => {
    if (e.pointerId !== activeId) return;
    if (dragging) {
      e.preventDefault();
      e.stopPropagation();
    }
    pressed = false;
    dragging = false;
    activeId = null;
    try {
      c.releasePointerCapture(e.pointerId);
    } catch {}
    w._isTextDragging = false;
  };

  c.addEventListener("pointerdown", onDown, { capture: true });
  c.addEventListener("pointermove", onMove, { capture: true });
  c.addEventListener("pointerup", onUp, { capture: true });
  c.addEventListener("pointercancel", onUp, { capture: true });
  c.addEventListener("lostpointercapture", onUp, { capture: true });

  // 念押し（既存スタイルに合わせる）
  c.style.pointerEvents = "auto";
  t.style.pointerEvents = "auto";
  t.style.touchAction = "none";
  t.style.userSelect = "none";
}

// 平行線ペア（同じ duplexId の2本）を単線に戻す
function _makeSingleFromParallel(anyWireId) {
  const src = _wires.get(anyWireId);
  if (!src || !src.duplexId) return;

  const duplexId = src.duplexId;

  // 同じ duplexId の2本を集める
  let pair = [];
  _wires.forEach((w) => {
    if (w.duplexId === duplexId) pair.push(w);
  });

  // 接続元/先を決定（ペアのどちらかから取得）
  const fromId = pair[0]?.fromId ?? src.fromId;
  const toId = pair[0]?.toId ?? src.toId;

  // まずペアを削除（テキスト/アイコンも仕様どおり引き継がない）
  for (const w of pair) {
    try {
      deleteWire(w.id);
    } catch (e) {

    }
  }

  // 単線（single_noarrow）を新規に生成
  const newWireId = connectBoxes(fromId, toId, {
    arrowType: "single_noarrow",
    // duplex 系は与えない（=単線）
  });

  // 念のためステータスにも反映（wire-admin.js がある場合）
  if (typeof setWireStatusDuplexId === "function") {
    try {
      setWireStatusDuplexId(newWireId, null);
    } catch {}
  }

  // デバッグパネル更新などがある場合
  const nw = _wires.get(newWireId);
  if (nw) {
    // 明示的に削除しておく（DOMのdata属性を使っていればそちらもクリア）
    delete nw.duplexId;
    delete nw.duplexSide;
    if (nw.el && nw.el.dataset) {
      delete nw.el.dataset.duplexId;
      delete nw.el.dataset.duplexSide;
    }
    /*
    if (typeof notifyWireDebugWireUpdated === "function") {
      try {
        notifyWireDebugWireUpdated(nw);
      } catch {}
    }
    */
  }
}

// θ方向の楕円半径： (x/ax)^2 + (y/by)^2 = 1 の境界までの距離
function _ellipseRadiusAt(theta, ax, by) {
  const c = Math.cos(theta),
    s = Math.sin(theta);
  const denom = Math.sqrt(by * c * (by * c) + ax * s * (ax * s));
  return (ax * by) / Math.max(denom, 1e-6); // 0割防止
}

// 楕円に「かぶらない」オフセットを返す（dx,dy）。モードで挙動を切替
function _offsetNoOverlapEllipse(w, theta) {
  const t = w.textEl;
  const aT = (t.offsetWidth || t.getBoundingClientRect().width) / 2; // 矩形の半幅
  const bT = (t.offsetHeight || t.getBoundingClientRect().height) / 2; // 矩形の半高

  const ax = ELLIPSE_W / 2; // 楕円の半径（横）
  const by = ELLIPSE_H / 2; // 楕円の半径（縦）
  const rE = _ellipseRadiusAt(theta, ax, by); // θ方向の楕円境界までの距離

  let R; // テキスト中心までの総距離
  if (ELLIPSE_STRICT_CENTER_PATH) {
    // 中心が常に「真の楕円」を描く（隙間は一定以上になる）
    const sMax = Math.hypot(aT, bT); // 最悪ケースの押し出し
    R = rE + IC_TEXT_GAP + sMax + 0.5;
  } else {
    // 常時「接する」モード（角度ごとに最小押し出し）
    const push =
      Math.abs(Math.cos(theta)) * aT + Math.abs(Math.sin(theta)) * bT;
    R = rE + IC_TEXT_GAP + push + 0.5;
  }

  return { dx: Math.cos(theta) * R, dy: Math.sin(theta) * R };
}

//テキストのみの位置の読み書き
function _readSavedTextOffset(w) {
  try {
    const v = getWireStatusTextOffset?.(w);
    if (v && typeof v.dx === "number" && typeof v.dy === "number") return v;
  } catch {}
  if (typeof w.textDx === "number" && typeof w.textDy === "number")
    return { dx: w.textDx, dy: w.textDy };
  return { dx: 0, dy: 0 };
}
function _readSavedTextTheta(w) {
  try {
    const th = getWireStatusTextTheta?.(w);
    if (typeof th === "number") return th;
  } catch {}
  if (typeof w.textTheta === "number") return w.textTheta;
  return 0;
}

// ★ ラベルでボタンを探すフォールバック（「線を全消去」を含むボタン）
function _findButtonByLabel(label) {
  const cands = Array.from(
    document.querySelectorAll('button, [role="button"]')
  );
  return cands.find((el) => (el.textContent || "").trim().includes(label));
}

//リセットボタン
function _ensureResetButtonUI() {
  // まずは ID/属性で探し、なければラベルで探す
  let btnClear =
    document.querySelector('#btnClearWires, [data-role="btn-clear-wires"]') ||
    _findButtonByLabel("線を全消去");
  if (!btnClear) return; // まだ描画されていなければ何もしない

  // すでに作ってあればスキップ
  if (document.getElementById("btnResetWorkspace")) return;

  const btn = document.createElement("button");
  btn.id = "btnResetWorkspace";
  // 既存のボタンスタイルを踏襲（classNameをコピー）
  btn.className = (btnClear.className || "wm-btn").trim();
  btn.classList.add("wm-btn-danger");
  btn.style.marginLeft = "8px";
  btn.type = "button";
  btn.textContent = "リセット";

  btn.addEventListener("click", () => {
    const ok = window.confirm(
      "ボックス、線、エリアサイズをリセットします。内容はすべて消えます"
    );
    if (!ok) return;
    resetWorkspaceToDefault();
  });

  btnClear.insertAdjacentElement("afterend", btn);
}

// 起動時にUIを用意
document.addEventListener("DOMContentLoaded", () => {
  _ensureResetButtonUI();
});

//メニュー用の軽量API（状態参照 & 切替）
export function isParallel(wireId) {
  const w = _wires.get(wireId);
  return !!(w && w.duplexId);
}

export function getWireArrowType(wireId) {
  const w = _wires.get(wireId);
  return (w && w.arrowType) || "single_noarrow";
}

export function toParallel(wireId) {
  const w = _wires.get(wireId);
  if (!w || w.duplexId) return; // 無効 or 既に平行線は何もしない

  // 内部実装が見えるならそれを優先（後方互換）
  if (typeof _makeParallelFromWire === "function") {
    _makeParallelFromWire(wireId);
    return;
  }
  if (typeof makeParallelFromWire === "function") {
    makeParallelFromWire(wireId);
    return;
  }

  // フォールバック：単線を削除し、duplexId 付きで 2 本作成（色は維持、テキスト/アイコンはリセット）
  const { fromId, toId, color } = w;
  if (fromId == null || toId == null) return;

  deleteWire(wireId);

  const duplexId =
    typeof _nextDuplexId === "function"
      ? _nextDuplexId()
      : "dx_" + Date.now().toString(36);

  // A：左側（-1）始点側矢印
  connectBoxes(fromId, toId, {
    duplexId,
    duplexSide: -1,
    arrowType: "single_sted",
    lineType: "none",
    color: color || DEFAULT_COLOR,
  });

  // B：右側（+1）終点側矢印
  connectBoxes(fromId, toId, {
    duplexId,
    duplexSide: +1,
    arrowType: "single_edst",
    lineType: "none",
    color: color || DEFAULT_COLOR,
  });
}

export function toSingle(wireId) {
  const w = _wires.get(wireId);
  if (!w || !w.duplexId) return; // 無効 or 既に単線は何もしない

  // 内部実装が見えるならそれを優先
  if (typeof _makeSingleFromParallel === "function") {
    _makeSingleFromParallel(wireId);
    return;
  }
  if (typeof makeSingleFromParallel === "function") {
    makeSingleFromParallel(wireId);
    return;
  }

  // フォールバック：ペアを消して単線で引き直す（テキスト/アイコンはリセット）
  const { duplexId, fromId, toId, color } = w;
  if (fromId == null || toId == null) return;

  let peerId = null;
  for (const [id, ww] of _wires.entries()) {
    if (id !== wireId && ww.duplexId === duplexId) {
      peerId = id;
      break;
    }
  }
  deleteWire(wireId);
  if (peerId != null) deleteWire(peerId);

  connectBoxes(fromId, toId, {
    arrowType: "single_noarrow",
    lineType: "none",
    color: color || DEFAULT_COLOR,
  });
}
