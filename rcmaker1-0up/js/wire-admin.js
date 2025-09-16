/* Public Release Build
   Cleaned: 2025-09-16T13:01:51
   Notes: Debug logs removed; minor whitespace tidy. No behavior changes intended.
*/
'use strict';
// js/wire-admin.js
// ==== wire_status 管理（最小） ===============================================

/**
 * 線タイプ
 * 単線始→終状態(single_sted)
 * 単線終←始状態(single_edst)
 * 単線両線状態（single_db)
 * 単線矢印なし状態（single_noarrow）
 * 複線右の始→終状態(rtdb_sted)
 * 複線右の終←始状態(rtdb_edst)
 * 複線右の両線状態（rtdb_db)
 * 複線右の矢印なし状態（rtdb_noarrow）
 * 複線左の始→終状態(rtdb_sted)
 * 複線左の終←始状態(rtdb_edst)
 * 複線左の両線状態（rtdb_db)
 * 複線左の矢印なし状態（rtdb_noarrow）
 *
 * 線表示
 * テキスト（text）
 * アイコン（icon）
 * テキスト＋アイコン（icontext)
 * なし（none)
*/

/**
 * ストア: key = 数値の線ID, value = wire_status
 * wire_status 仕様:
 *  - wireId: number
 *  - duplexId: null        // 複線は後日
 *  - x, y: null | number   // 中点座標（描画後に更新したい場合に利用）
 *  - textDx: null,textDy: null,  //テキストボックスからの相対座標
 *  - state: 'single_noarrow'
 *  - color: '#ff3535'
 *  - display: 'none' | 'text' | 'icon' | 'iconText'
 */
const wireStatus = new Map();

/** 'w17' や wire.id から数値IDを抽出 */
function wireIdNumFrom(wireOrId) {
  const s = (typeof wireOrId === 'string'
              ? wireOrId
              : (wireOrId && wireOrId.id) || '');
  const m = String(s).match(/(\d+)/);
  return m ? Number(m[1]) : NaN;
}

/** 生成直後の既定ステータス */
function defaultWireStatusFor(wire) {
  return {
    wireId: wireIdNumFrom(wire),
    duplexId: null,
    x: null,
    y: null,
    iconX: null,
    iconY: null,
    textDx: null,
    textDy: null,
    textTheta: null,
    state: 'single_noarrow',
    color: '#ff3535',
    display: 'none',
  };
}

/** 作成時: wire に wire_status を付与し、ストアへ登録 */
export function attachWireStatus(wire) {
  if (!wire) return;
  const st = defaultWireStatusFor(wire);
  wire.wire_status = st;
  wireStatus.set(st.wireId, st);
}

/** 削除時: ストアから除去 */
export function removeWireStatusById(wireOrId) {
  wireStatus.delete(wireIdNumFrom(wireOrId));
}

/** 色情報更新 */
export function setWireStatusColor(wireOrId, colorString) {
  const idn = wireIdNumFrom(wireOrId);
  const st = wireStatus.get(idn);
  if (!st) return;
  st.color = String(colorString || '');
}

//線状態更新
export function setWireStatusState(wireOrId, stateString) {
  const idn = wireIdNumFrom(wireOrId);
  const st = wireStatus.get(idn);
  if (!st) return;
  st.state = String(stateString);
}

//線表示（アイコンとかの状態）更新
export function setWireStatusDisplay(wireOrId, displayType) {
  const idn = wireIdNumFrom(wireOrId);
  const st = wireStatus.get(idn);
  if (!st) return;
  st.display = String(displayType || 'none');
}

//アイコン位置の更新（オーバレイ座標系の中心点）
export function setWireStatusIconPosition(wireOrId, x, y) {
  const idn = wireIdNumFrom(wireOrId);
  const st = wireStatus.get(idn);
  if (!st) return;
  const toNum = (v) => (Number.isFinite(v) ? Math.round(v) : null);
  st.iconX = toNum(x);
  st.iconY = toNum(y);
}

// duplexId の取得/設定/クリアヘルパ（なければ null を返す）
export function getWireStatusDuplexId(wireOrId) {
  const idn = wireIdNumFrom(wireOrId);
  const st = wireStatus.get(idn);
  return st ? (st.duplexId ?? null) : null;
}
export function setWireStatusDuplexId(wireOrId, duplexId) {
  const idn = wireIdNumFrom(wireOrId);
  const st = wireStatus.get(idn);
  if (!st) return;
  st.duplexId = (duplexId === undefined || duplexId === null || String(duplexId).trim() === '')
    ? null
    : String(duplexId);
}
export function clearWireStatusDuplexId(wireOrId) {
  const idn = wireIdNumFrom(wireOrId);
  const st = wireStatus.get(idn);
  if (!st) return;
  st.duplexId = null;
}

/** 参照ヘルパ */
export function getWireStatus(wireOrId) {
  return wireStatus.get(wireIdNumFrom(wireOrId)) || null;
}

// 位置更新を別のタイミングで使いたい場合用
export function updateWireStatusPositionFromPath(wire) {
  if (!wire || !wire.path) return;
  try {
    const len = wire.path.getTotalLength();
    const p = wire.path.getPointAtLength(len / 2);
    if (wire.wire_status) {
      wire.wire_status.x = Math.round(p.x);
      wire.wire_status.y = Math.round(p.y);
    }
  } catch {}
}

//テキストからの相対座標のセットとゲット
export function setWireStatusTextOffset(wireOrId, dx, dy) {
  const idn = wireIdNumFrom(wireOrId);
  const st = wireStatus.get(idn);
  if (!st) return;
  const toNum = v => (Number.isFinite(v) ? Math.round(v) : null);
  st.textDx = toNum(dx);
  st.textDy = toNum(dy);
}

/** アイコン中心取得（オーバーレイ座標系）。未計測時は {x:null, y:null} を返す */
export function getWireStatusIconCenter(wireOrId) {
  const st = getWireStatus(wireOrId);
  const toNum = v => (Number.isFinite(v) ? Math.round(v) : null);
  return { x: toNum(st?.iconX), y: toNum(st?.iconY) };
}

// 角度ベース管理 ===============================
// 角度を保存（単位: ラジアン）。wire または wireId のどちらでもOK。
export function setWireStatusTextTheta(wireOrId, theta) {
  const st = getWireStatus(wireOrId);
  if (!st) return;
  st.textTheta = (typeof theta === 'number' && Number.isFinite(theta)) ? theta : null;
}
// 角度を取得（なければ textDx/textDy から自動復元 → 無ければ 0）。常に数値を返す設計。
export function getWireStatusTextTheta(wireOrId) {
  const st = getWireStatus(wireOrId);
  if (!st) return 0;

  if (typeof st.textTheta !== 'number') {
    if (Number.isFinite(st.textDx) && Number.isFinite(st.textDy) && (st.textDx !== 0 || st.textDy !== 0)) {
      st.textTheta = Math.atan2(st.textDy, st.textDx); // 既存保存から移行
    } else {
      st.textTheta = 0; // 既定は右側
    }
  }
  return st.textTheta;
}

// 半径 R から dx,dy を算出（UI反映の共通化にどうぞ）
export function getTextOffsetFromTheta(wireOrId, radiusPx) {
  const th = getWireStatusTextTheta(wireOrId);
  const dx = Math.round(Math.cos(th) * radiusPx);
  const dy = Math.round(Math.sin(th) * radiusPx);
  return { dx, dy };
}

// ============================================================================
