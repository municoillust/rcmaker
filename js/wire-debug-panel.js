/* Public Release Build
   Cleaned: 2025-09-16T13:01:51
   Notes: Debug logs removed; minor whitespace tidy. No behavior changes intended.
*/
'use strict';
// js/wire-debug-panel.js
// デバッグ表示パネル（右側固定）。wire-admin の状態を読み出して表示します。

//　★★★デバッグが終わったら、このjsは取り除けます。★★★

import {
  getWireStatus,
  updateWireStatusPositionFromPath
} from './wire-admin.js';

let panelEl = null;
let fields = null;
let currentWireIdNum = null;

export function initWireDebugPanel() {
  if (panelEl) return;

  panelEl = document.createElement('div');
  panelEl.className = 'wire-debug-panel';
  Object.assign(panelEl.style, {
    position: 'fixed',
    top: '12px',
    right: '12px',
    width: '280px',
    maxHeight: '70vh',
    overflow: 'auto',
    padding: '12px',
    border: '1px solid #ccc',
    borderRadius: '12px',
    background: '#fff',
    boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
    font: '12px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    zIndex: 2147483647
  });

  panelEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <strong style="font-size:13px;">Wire Debug</strong>
      <button id="wdp-clear" type="button" style="margin-left:auto;padding:4px 8px;border:1px solid #ddd;border-radius:8px;background:#f7f7f7;cursor:pointer;">クリア</button>
    </div>
    <dl style="display:grid;grid-template-columns:100px 1fr;gap:6px;margin:0;">
      <dt>線ID</dt>          <dd id="wdp-wireId">-</dd>
      <dt>複線ID</dt>        <dd id="wdp-duplexId">-</dd>
      <dt>位置X</dt>         <dd id="wdp-x">-</dd>
      <dt>位置Y</dt>         <dd id="wdp-y">-</dd>
      <dt>線の状態</dt>      <dd id="wdp-state">-</dd>
      <dt>線の色</dt>        <dd id="wdp-color">-</dd>
      <dt>線の表示</dt>      <dd id="wdp-display">-</dd>
      <dt>アイコンX</dt>      <dd id="wdp-iconX">-</dd>
      <dt>アイコンY</dt>      <dd id="wdp-iconY">-</dd>
    </dl>
  `;

  document.body.appendChild(panelEl);

  fields = {
    wireId: panelEl.querySelector('#wdp-wireId'),
    duplexId: panelEl.querySelector('#wdp-duplexId'),
    x: panelEl.querySelector('#wdp-x'),
    y: panelEl.querySelector('#wdp-y'),
    state: panelEl.querySelector('#wdp-state'),
    color: panelEl.querySelector('#wdp-color'),
    display: panelEl.querySelector('#wdp-display'),
    iconX:    panelEl.querySelector('#wdp-iconX'),
    iconY:    panelEl.querySelector('#wdp-iconY'),
  };

  panelEl.querySelector('#wdp-clear')?.addEventListener('click', () => {
    currentWireIdNum = null;
    _render(null);
  });

  _render(null);
}

function _render(status) {
  const val = (v) => (v === null || v === undefined || Number.isNaN(v) ? '-' : String(v));
  fields.wireId.textContent  = val(status?.wireId);
  fields.duplexId.textContent= val(status?.duplexId);
  fields.x.textContent       = val(status?.x);
  fields.y.textContent       = val(status?.y);
  fields.state.textContent   = val(status?.state);
  fields.color.textContent   = val(status?.color);
  fields.display.textContent = val(status?.display);
  fields.iconX.textContent    = val(status?.iconX);
  fields.iconY.textContent    = val(status?.iconY);
}

/** クリック/右クリックで呼ぶ。表示を更新します（既存の右クリック動作は妨げません） */
export function showWireDebugForWire(wire) {
  if (!panelEl) initWireDebugPanel();
  updateWireStatusPositionFromPath(wire); // 中点を最新化（描画には影響なし）
  const st = getWireStatus(wire);
  currentWireIdNum = st?.wireId ?? null;
  _render(st || null);
}

/** 幾何更新時に呼ぶと、選択中ワイヤの座標表示だけ追従します */
export function notifyWireDebugWireUpdated(wire) {
  if (!panelEl || currentWireIdNum == null) return;
  const st = getWireStatus(wire);
  if (st && st.wireId === currentWireIdNum) {
    updateWireStatusPositionFromPath(wire);
    _render(st);
  }
}

/** 削除時に、もし表示中のワイヤならパネルをクリア */
export function clearWireDebugIfMatches(wireOrId) {
  const m = String(typeof wireOrId === 'string' ? wireOrId : (wireOrId && wireOrId.id) || '').match(/(\d+)/);
  const idn = m ? Number(m[1]) : NaN;
  if (idn === currentWireIdNum) {
    currentWireIdNum = null;
    _render(null);
  }
}

/** 各 wire の path/path2 にリスナを付ける（click/contextmenuの既存動作は維持） */
export function attachWireDebugHandlers(wire) {
  if (!wire) return;
  const handler = () => showWireDebugForWire(wire);
  wire.path?.addEventListener('click', handler);
  wire.path?.addEventListener('contextmenu', handler);
  wire.path2?.addEventListener('click', handler);
  wire.path2?.addEventListener('contextmenu', handler);
}
