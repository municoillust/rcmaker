/* Public Release Build
   Cleaned: 2025-09-16T13:01:51
   Notes: Debug logs removed; minor whitespace tidy. No behavior changes intended.
*/
'use strict';
// boxes.js
import {
  updateConnectionsForBox,
  registerBox,
  unregisterBox,
  connectBoxes,
} from "./wires.js";
import { openBoxMenu } from "./box-menu.js";

//ボックス生成位置管理（(20,20) から 10個で一周）
const SPAWN_BASE_PX = 20;
const SPAWN_STEP_PX = 20;
const SPAWN_WRAP_COUNT = 10;
const BOX_TITLE_DEFAULT_LABEL = "ダブルクリックで編集";
const BOX_TEXT_DEFAULT_LABEL = "ダブルクリックで編集";
const EDIT_LABEL_TITLE = "（タイトル編集中）";
const EDIT_LABEL_TEXT = "（テキスト編集中）";
const BOX_TEXT_MAX_WIDTH = 270; // テキストの最大サイズ
const BOX_TEXT_MAX_HEIGHT = 100; // テキストの最大高さサイズ
const BOX_TEXT_MAX_LINES = 4; //テキストの最大行
let _spawnIndex = 0;

let debug_counter = 0; //デバッグ用★削除用

export const MAX_BOXES = 30; //ボックスの上限数

//色変更群
export const BOX_BORDER_SWATCHES = [
  "#0d244dff",
  "transparent",
  "#f10e0eff",
  "#33CC00",
  "#440ad7ff",
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
export const BOX_BORDER_DEFAULT = BOX_BORDER_SWATCHES[0];
export const BOX_BORDER_GRID = { cols: 8, rows: 2 };
export const BOX_BORDER_CSS_VAR = "--box-border-color";

export function getCurrentBoxCount() {
  return document.querySelectorAll(".wire-box, .box, .node").length;
}

export function ensureBoxCounterUI() {
  // 1) まずは明示セレクタで探す
  let btn = document.querySelector(
    '[data-role="btn-create-box"], #btnCreateBox, #btnAddBox'
  );
  // 2) 見つからなければ、ラベルで探索（「ボックス生成」を含むボタン）
  if (!btn) btn = findButtonByLabel("ボックス生成");
  if (!btn) return; // まだボタンが描画されていない

  // カウンター
  let counter = document.getElementById("boxCounter");
  if (!counter) {
    counter = document.createElement("span");
    counter.id = "boxCounter";
    counter.className = "box-counter";
    counter.textContent = `現在のボックス数 0/${MAX_BOXES}`;
    btn.insertAdjacentElement("afterend", counter);
  }

  // 上限メッセージ
  let limitMsg = document.getElementById("boxLimitMsg");
  if (!limitMsg) {
    limitMsg = document.createElement("span");
    limitMsg.id = "boxLimitMsg";
    limitMsg.className = "box-limit-msg";
    limitMsg.style.display = "none";
    limitMsg.textContent = "ボックス最大数のため、生成できません";
    counter.insertAdjacentElement("afterend", limitMsg);
  }

  updateBoxCounterUI();
}

//テキストボックスの空白チェック
function isBlankTextBox(s) {
  try {
    const str = String(s ?? "");
    return str.replace(/[\s\u3000]/g, "").length === 0; // 改行/タブ/半角/全角スペースを除去して判定
  } catch {
    return true;
  }
}

// 空欄（改行だけ／半角・全角スペースだけ も含む）を判定
function isBlankInput(s) {
  try {
    const str = String(s ?? "");
    return str.replace(/[\s\u3000]/g, "").length === 0;
  } catch {
    return true;
  }
}

const BOX_OPTION_SELECTORS = ["#chkTitle", "#chkImage", "#chkText"];

/** 生成ボタン取得（既存のラベルfallbackを使う）
function getCreateButton() {
  return (
    document.querySelector(
      '[data-role="btn-create-box"], #btnCreateBox, #btnAddBox'
    ) ||
    findButtonByLabel?.("ボックス生成") || // 前ステップで定義済みなら利用
    null
  );
}*/

function anyBoxOptionChecked() {
  const cbs = BOX_OPTION_SELECTORS.flatMap((sel) =>
    Array.from(document.querySelectorAll(sel))
  );
  if (cbs.length === 0) return true; // 見つからない環境ではブロックしない
  return cbs.some((cb) => cb.checked);
}

// シンプルに、既存のUI更新に「未選択なら無効」を足す
export function updateBoxCounterUI() {
  const count = getCurrentBoxCount();
  const counter = document.getElementById("boxCounter");
  const limitMsg = document.getElementById("boxLimitMsg");
  const btn =
    document.querySelector(
      '[data-role="btn-create-box"], #btnCreateBox, #btnAddBox'
    ) ||
    (typeof findButtonByLabel === "function"
      ? findButtonByLabel("ボックス生成")
      : null);

  if (counter) counter.textContent = `現在のボックス数 ${count}/${MAX_BOXES}`;
  const isFull = count >= MAX_BOXES;
  const hasAny = anyBoxOptionChecked();

  if (btn) btn.disabled = isFull || !hasAny;
  if (limitMsg) limitMsg.style.display = isFull ? "" : "none";
}

// チェックの変化でボタン状態を更新（1回バインドするだけ）
function bindBoxOptionListeners() {
  BOX_OPTION_SELECTORS.forEach((sel) => {
    document.querySelectorAll(sel).forEach((cb) => {
      if (!cb._bound) {
        cb.addEventListener("change", updateBoxCounterUI);
        cb._bound = true;
      }
    });
  });
}

/** ラベルでボタンを探すフォールバック */
function findButtonByLabel(label) {
  const candidates = Array.from(
    document.querySelectorAll('button, [role="button"]')
  );
  return candidates.find((el) => (el.textContent || "").trim().includes(label));
}

/** 生成ボタンの“上限ガード”を仕込む（captureで先に止める） */
export function attachBoxCreateGuard() {
  const rebind = () => {
    const btn =
      document.querySelector(
        '[data-role="btn-create-box"], #btnCreateBox, #btnAddBox'
      ) ||
      (typeof findButtonByLabel === "function"
        ? findButtonByLabel("ボックス生成")
        : null);
    if (!btn) return;

    if (btn._boxGuardHandler)
      btn.removeEventListener("click", btn._boxGuardHandler, true);

    const handler = (e) => {
      const isFull = getCurrentBoxCount() >= MAX_BOXES;
      if (isFull || !anyBoxOptionChecked()) {
        // ★ここだけ追加
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        updateBoxCounterUI();
        return false;
      }
    };
    btn.addEventListener("click", handler, true);
    btn._boxGuardHandler = handler;
  };
  rebind();
  // （再描画対応が不要なら MutationObserver は省略でOK）
}

/** 他モジュール向けの防御的チェック（必要なら呼び出して使う） */
export function canCreateAnotherBox() {
  return getCurrentBoxCount() < MAX_BOXES;
}

/** どの経路の追加/削除でもカウンターを自動同期するウォッチャ */
export function startBoxCounterWatcher() {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      // 軽いデバウンス
      scheduled = false;
      updateBoxCounterUI();
    });
  };

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") {
        // 追加・削除が起きたら一度だけ反応
        schedule();
        break;
      }
    }
  });

  mo.observe(document.body, { childList: true, subtree: true });
}

// 初期化：起動時にUIを用意＆表示を同期
document.addEventListener("DOMContentLoaded", () => {
  ensureBoxCounterUI();
  attachBoxCreateGuard();
  startBoxCounterWatcher();
  bindBoxOptionListeners();
  updateBoxCounterUI();
});

function getNextSpawnXY() {
  const i = _spawnIndex % SPAWN_WRAP_COUNT;
  _spawnIndex = (_spawnIndex + 1) % SPAWN_WRAP_COUNT;
  return {
    x: SPAWN_BASE_PX + SPAWN_STEP_PX * i,
    y: SPAWN_BASE_PX + SPAWN_STEP_PX * i,
  };
}

let idSeq = 1;
export const boxes = new Map(); // id -> { el }

// 直近クリックの2つを保持
let selection = []; // [older, newer]

let boxMenuEl = null;
let boxMenuTargetId = null;

export function getSelectedId() {
  return selection[1] || selection[0] || null;
}
export function getSelectedPair() {
  return [...selection];
}
export function setSelected(id) {
  selectBox(id);
}

function selectBox(id) {
  selection = selection.filter((x) => x !== id);
  selection.push(id);
  if (selection.length > 2) selection = selection.slice(-2);
  updateSelectionClasses();

  try {
    updateSelectIndicators();
  } catch (e) {}
}

function clearSelection() {
  selection = [];
  updateSelectionClasses();

  try {
    updateSelectIndicators();
  } catch (e) {}
}

function updateSelectionClasses() {
  for (const { el } of boxes.values()) {
    el.classList.remove("sel");
    el.removeAttribute("data-rank");
  }
  if (selection[0]) {
    const el1 = boxes.get(selection[0])?.el;
    if (el1) {
      el1.classList.add("sel");
      el1.setAttribute("data-rank", "1");
    }
  }
  if (selection[1]) {
    const el2 = boxes.get(selection[1])?.el;
    if (el2) {
      el2.classList.add("sel");
      el2.setAttribute("data-rank", "2");
    }
  }

  try {
    updateSelectIndicators();
  } catch (e) {}
}

//ボックス色セット
export function setBoxBorderColor(boxId, color) {
  const rec = boxes.get(boxId);
  if (!rec) return;
  rec.borderColor = color;
  try {
    rec.el?.style?.setProperty(BOX_BORDER_CSS_VAR, color);
  } catch {}
}
//ボックス色ゲット
export function getBoxBorderColor(boxId) {
  const rec = boxes.get(boxId);
  return rec ? rec.borderColor ?? BOX_BORDER_DEFAULT : BOX_BORDER_DEFAULT;
}

export function createBox(
  canvas,
  { x, y, text = "テキスト", imageUrl = null } = {}
) {
  const id = `box_${idSeq++}`;
  const el = document.createElement("div");
  const spawn =
    typeof x === "number" && typeof y === "number"
      ? { x, y }
      : getNextSpawnXY();
  el.className = "box";
  el.dataset.id = id;
  try {
    el.style.setProperty(BOX_BORDER_CSS_VAR, BOX_BORDER_DEFAULT);
  } catch {}
  el.addEventListener(
    "contextmenu",
    (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const cur = boxes.get(id)?.borderColor ?? BOX_BORDER_DEFAULT;
      openBoxMenu({
        anchorX: ev.clientX,
        anchorY: ev.clientY,
        currentColor: cur,
        swatches: BOX_BORDER_SWATCHES,
        grid: BOX_BORDER_GRID,
        onColor: (color) => {
          try {
            setBoxBorderColor(id, color);
          } catch {}
        },
        onClose: () => {},
      });
    },
    { capture: true }
  );
  el.style.left = spawn.x + "px";
  el.style.top = spawn.y + "px";

  const content = document.createElement("div");
  content.className = "content";
  content.contentEditable = true;
  content.spellcheck = false;

  if (imageUrl) {
    el.classList.add("image");
    el.style.backgroundImage = `url("${imageUrl}")`;
    content.textContent = "";
    content.style.background = "rgba(0,0,0,.35)";
    content.style.color = "white";
    content.style.borderRadius = "8px";
    content.style.backdropFilter = "blur(2px)";
  } else {
    content.textContent = text;
  }

  el.appendChild(content);
  //★_setupCboxEditors(el);
  canvas.appendChild(el);

  enableDrag(el, handle, canvas);
  el.addEventListener("pointerdown", () => {
    selectBox(id);
  });
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showBoxMenu(canvas, id, e.clientX, e.clientY);
  });
  //★_setupCboxEditors(el);
  boxes.set(id, { el, borderColor: BOX_BORDER_DEFAULT });
  registerBox(id, el);
  return id;
}

function enableDrag(boxEl, handleEl, canvas) {
  let startX,
    startY,
    origLeft,
    origTop,
    dragging = false;
  const onPointerMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX,
      dy = e.clientY - startY;
    const c = canvas.getBoundingClientRect(),
      b = boxEl.getBoundingClientRect();
    let nx = origLeft + dx,
      ny = origTop + dy;
    nx = Math.max(0, Math.min(nx, c.width - b.width));
    ny = Math.max(0, Math.min(ny, c.height - b.height));
    boxEl.style.left = nx + "px";
    boxEl.style.top = ny + "px";
    updateConnectionsForBox(boxEl.dataset.id);
  };
  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    try {
      boxEl.releasePointerCapture(e.pointerId);
    } catch {}
    // 変更イベント（Undo用）
    window.dispatchEvent(
      new CustomEvent("diagram:changed", { detail: { source: "box-move" } })
    );
  };
  handleEl.addEventListener("pointerdown", (e) => {
    if (e.detail === 2) return; // ダブルクリック除外
    if (
      e.target.closest(
        '[contenteditable="true"], .counter, input, textarea, select, button'
      )
    )
      return;
    e.preventDefault();
    selectBox(boxEl.dataset.id);
    startX = e.clientX;
    startY = e.clientY;
    origLeft = parseFloat(boxEl.style.left) || 0;
    origTop = parseFloat(boxEl.style.top) || 0;
    dragging = true;
    try {
      boxEl.setPointerCapture(e.pointerId);
    } catch {}
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
}

export function enableStageSelection(canvas, wiresSvg) {
  canvas.addEventListener("pointerdown", (e) => {
    if (e.target === canvas || e.target === wiresSvg) {
      clearSelection();
    }
  });
}

export function deleteSelectedBox() {
  const targetId = selection[1] || selection[0];
  if (!targetId) return;
  deleteBoxById(targetId);
  window.dispatchEvent(
    new CustomEvent("diagram:changed", { detail: { source: "box-delete" } })
  );
}

export function deleteAllBoxes() {
  for (const [id, rec] of Array.from(boxes.entries())) {
    unregisterBox(id);
    rec.el.remove();
  }
  boxes.clear();
  selection = [];
  updateSelectionClasses();
}

function deleteBoxById(id) {
  const rec = boxes.get(id);
  if (!rec) return;
  unregisterBox(id);
  rec.el.remove();
  boxes.delete(id);
  selection = selection.filter((x) => x !== id);
  updateSelectionClasses();
}

/* ---- BOXメニュー ---- */
function ensureBoxMenu() {
  if (boxMenuEl) return boxMenuEl;
  boxMenuEl = document.createElement("div");
  boxMenuEl.className = "box-menu";
  document.body.appendChild(boxMenuEl);
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (!boxMenuEl.contains(e.target)) hideBoxMenu();
    },
    true
  );
  window.addEventListener("scroll", hideBoxMenu, true);
  window.addEventListener("resize", hideBoxMenu);
  boxMenuEl.addEventListener("click", (e) => {
    const act = e.target?.dataset?.action;
    if (act === "connect") {
      const [a, b] = selection;
      if (a && b) {
        connectBoxes(a, b);
      }
      hideBoxMenu();
    } else if (act === "change-image") {
      if (boxMenuTargetId) {
        changeImageForBox(boxMenuTargetId);
      }
      hideBoxMenu();
    } else if (act === "delete-box") {
      if (boxMenuTargetId) {
        deleteBoxById(boxMenuTargetId);
        window.dispatchEvent(
          new CustomEvent("diagram:changed", {
            detail: { source: "box-delete" },
          })
        );
      }
      hideBoxMenu();
    }
  });
  return boxMenuEl;
}

function showBoxMenu(canvas, targetBoxId, clientX, clientY) {
  const menu = ensureBoxMenu();
  boxMenuTargetId = targetBoxId;
  const isSelectedTarget = selection.includes(targetBoxId);
  const hasPair = selection.length >= 2;
  let html = "";
  if (isSelectedTarget && hasPair)
    html += `<button data-action="connect">BOXを接続（選択1 → 選択2）</button>`;
  else
    html += `<button class="muted">もう1つBOXを選んでから接続できます</button>`;
  html += `<hr style="border:0;border-top:1px solid rgba(255,255,255,.12);margin:6px 0;">`;
  if (boxHasImageSlot(targetBoxId)) {
    html += `<button data-action="change-image">画像を変更…</button>`;
    html += `<hr style="border:0;border-top:1px solid rgba(255,255,255,.12);margin:6px 0;">`;
  }
  html += `<button data-action="delete-box" class="danger">このBOXを削除</button>`;
  menu.innerHTML = html;
  // === ここから 4×2 カラースウォッチ ===
  try {
    // 現在色を取得（なければデフォルト）
    const cur = boxes.get(targetBoxId)?.borderColor ?? BOX_BORDER_DEFAULT;

    const grid = document.createElement("div");
    // 最低限のスタイル（インライン）
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = `repeat(${BOX_BORDER_GRID.cols}, 24px)`;
    grid.style.gridAutoRows = "24px";
    grid.style.gap = "6px";
    grid.style.marginTop = "8px";

    // タイトル（任意）
    const label = document.createElement("div");
    label.textContent = "枠色";
    label.style.fontSize = "12px";
    label.style.opacity = "0.8";
    label.style.margin = "4px 0 6px";
    menu.appendChild(label);

    // スウォッチを並べる（8個）
    BOX_BORDER_SWATCHES.slice(
      0,
      BOX_BORDER_GRID.cols * BOX_BORDER_GRID.rows
    ).forEach((color) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.width = "24px";
      btn.style.height = "24px";
      btn.style.border = "1px solid #aaa";
      btn.style.borderRadius = "6px";
      btn.style.padding = "0";
      btn.style.cursor = "pointer";
      btn.style.outline = "none";
      btn.setAttribute("aria-label", color === "transparent" ? "透明" : color);

      if (String(color).toLowerCase() === String(cur).toLowerCase()) {
        btn.style.boxShadow = "0 0 0 2px #4da3ff";
      }

      if (color === "transparent") {
        // 市松模様（透明用）
        btn.style.backgroundImage = [
          "linear-gradient(45deg, #cfcfcf 25%, transparent 25%)",
          "linear-gradient(-45deg, #cfcfcf 25%, transparent 25%)",
          "linear-gradient(45deg, transparent 75%, #cfcfcf 75%)",
          "linear-gradient(-45deg, transparent 75%, #cfcfcf 75%)",
        ].join(",");
        btn.style.backgroundSize = "10px 10px";
        btn.style.backgroundPosition = "0 0, 0 5px, 5px -5px, -5px 0px";
        btn.style.backgroundColor = "white";
      } else {
        btn.style.background = color;
      }

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          setBoxBorderColor(targetBoxId, color);
        } finally {
          hideBoxMenu();
        }
      });

      grid.appendChild(btn);
    });

    // 既存ボタン群の下にスウォッチを追加
    menu.appendChild(grid);
  } catch {}
  // === ここまで 4×2 カラースウォッチ ===
  menu.style.display = "block";
  const rect = document.body.getBoundingClientRect();
  menu.style.left = clientX - rect.left + 4 + "px";
  menu.style.top = clientY - rect.top + 4 + "px";
}
function hideBoxMenu() {
  if (boxMenuEl) boxMenuEl.style.display = "none";
}

export function createCompositeBox(opts) {
  const { withTitle, withImage, withText, title, text, imageSrc } = opts;
  const el = document.createElement("div");
  el.className = "box cbox";
  el.dataset.type = "composite";

  if (withTitle) {
    const t = document.createElement("div");
    t.className = "box-title";
    t.setAttribute("data-role", "title");
    t.dataset.maxlen = "20";

    // 初期テキスト（空なら既定ラベル）
    const initTitle = isBlankInput(title)
      ? BOX_TITLE_DEFAULT_LABEL
      : String(title);
    t.textContent = initTitle.slice(0, 20);
    t.dataset.default = t.textContent; // ← 戻し先を保持

    el.appendChild(t);
    el.appendChild(makeCounter(t, 20));
    t.addEventListener("input", () => enforceMaxLength(t, 20));
  }

  if (withImage) {
    const wrap = document.createElement("div");
    wrap.className = "box-image";
    const img = document.createElement("img");
    img.alt = "";
    if (imageSrc) img.src = imageSrc;
    wrap.appendChild(img);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "img-edit";
    //edit.textContent = '画像変更';
    edit.addEventListener("click", () => {
      const input =
        document.getElementById("imageUploader") || createHiddenFileInput();
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          img.src = reader.result;
        };
        reader.readAsDataURL(f);
      };
      input.click();
    });
    wrap.appendChild(edit);
    el.appendChild(wrap);

    ["pointerdown", "click"].forEach((ev) =>
      edit.addEventListener(ev, (e) => e.stopPropagation())
    ); //phase17
  }

  if (withText) {
    const ta = document.createElement("div");
    ta.style.maxWidth = BOX_TEXT_MAX_WIDTH + "px";
    ta.style.maxHeight = BOX_TEXT_MAX_HEIGHT + "px";
    ta.className = "box-text";
    ta.setAttribute("data-role", "text");
    ta.style.pointerEvents = "auto";
    ta.style.userSelect = "text";
    ta.dataset.maxlen = "60";
    ta.style.wordBreak = "break-word";
    ta.style.overflowWrap = "anywhere";
    ta.style.overflow = "hidden";
    attachBoxTextLineLimit(ta, BOX_TEXT_MAX_LINES);

    // まだ登録前なので「次のBOX番号」は Map のサイズ + 1 を採用
    const nextIndex =
      typeof boxes !== "undefined" && boxes?.size >= 0 ? boxes.size + 1 : 1;
    const defaultText = `${BOX_TEXT_DEFAULT_LABEL}（${nextIndex}）`;
    const initial = isBlankTextBox(text) ? defaultText : String(text);
    ta.textContent = initial.slice(0, 150);

    el.appendChild(ta);
    el.appendChild(makeCounter(ta, 150));
    ta.addEventListener("input", () => enforceMaxLength(ta, 60));
  }
  _setupCboxEditors(el);
  attachEditIndicatorHandlers(el);
  attachSelectIndicatorHandlers(el);
  return el;
}

export function initCompositeBox(el, canvas) {
  const id = `box_${idSeq++}`;
  el.dataset.id = id;

  // 初期位置
  const spawn = getNextSpawnXY();
  el.style.left = spawn.x + "px";
  el.style.top = spawn.y + "px";

  // 登録・ドラッグ・メニュー・選択
  boxes.set(id, { el });
  registerBox(id, el);

  // 生成BOXは箱全体を持ってドラッグ（入力エリアはガードで除外）
  enableDrag(el, el, canvas);
  _setupCboxEditors(el);
  attachEditIndicatorHandlers(el);
  attachSelectIndicatorHandlers(el);
  // 既存DOMにテキスト要素があり、空欄ならデフォルトを補う
  try {
    const idStr = String(el.dataset.id || "");
    const num = parseInt(idStr.replace(/^box_/, ""), 10) || boxes.size || 1;

    const titleEl = el.querySelector(
      '[data-role="title"], .box-title, .cbox-title, .title'
    );
    if (titleEl) {
      if (!titleEl.dataset.default) {
        if (isBlankInput(titleEl.textContent))
          titleEl.textContent = BOX_TITLE_DEFAULT_LABEL;
        titleEl.dataset.default = titleEl.textContent;
      }
    }

    const textEl = el.querySelector(
      '[data-role="text"],  .box-text,  .cbox-text,  .text'
    );
    if (textEl) {
      if (!textEl.dataset.default) {
        if (isBlankInput(textEl.textContent))
          textEl.textContent = `${BOX_TEXT_DEFAULT_LABEL}（${num}）`;
        textEl.dataset.default = textEl.textContent;
      }
    }
  } catch {}

  el.addEventListener("pointerdown", () => {
    selectBox(id);
  });
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showBoxMenu(canvas, id, e.clientX, e.clientY);
  });
}

function enforceMaxLength(node, max) {
  const s = node.textContent || "";
  if (s.length > max) {
    node.textContent = s.slice(0, max);
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  const c = node.nextElementSibling;
  if (c && c.classList.contains("counter")) {
    c.textContent = `${(node.textContent || "").length}/${max}`;
  }
}

function makeCounter(forEl, max) {
  const c = document.createElement("div");
  c.className = "counter";
  c.textContent = `${(forEl.textContent || "").length}/${max}`;
  return c;
}

function createHiddenFileInput() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  document.body.appendChild(input);
  return input;
}

// グローバル公開（スクリプト直読み想定）

if (typeof window !== "undefined") {
  window.initBoxDrag = (el) => {
    const canvas = document.getElementById("canvasWrap");
    if (canvas && !el.dataset.id) {
      initCompositeBox(el, canvas);
    }
  };
}

// 全ボックス削除（線もクリーン）
export async function removeAllBoxes() {
  try {
    // 1) まず全線を消す（ボックス参照を持つ線を先に除去）
    try {
      const w = await import("./wires.js");
      w?.clearAllWires?.();
    } catch {}

    // 2) Mapの反復中に削除すると壊れるので、idだけ先に配列化
    const ids = [];
    if (typeof boxes !== "undefined" && boxes?.forEach) {
      boxes.forEach((rec, id) => ids.push(id));
    } else {
      document.querySelectorAll("[data-id]").forEach((el) => {
        if (el.classList.contains("cbox") || el.classList.contains("box")) {
          ids.push(el.dataset.id);
        }
      });
    }
    // 3) DOMと状態の削除
    ids.forEach((id) => {
      try {
        typeof unregisterBox === "function"
          ? unregisterBox(id)
          : document.querySelector(`[data-id="${id}"]`)?.remove();
      } catch {}
    });

    // 4) 管理構造を初期化
    if (typeof boxes !== "undefined" && boxes?.clear) boxes.clear();
    if (typeof selection !== "undefined" && selection?.length != null)
      selection.length = 0;
  } catch (e) {

  }
}

export async function changeImageForBox(boxId) {
  const rec = boxes.get(boxId);
  if (!rec || !rec.el) return;

  // 画像領域を推定（必要に応じてプロジェクトのクラス名に合わせてください）
  const imgEl = rec.el.querySelector(
    "img.cimg, .cbox-image img, .cbox-image, img, .img"
  );
  if (!imgEl) {
    alert("このBOXには画像領域が見つかりませんでした。");
    return;
  }

  // 非表示のファイル入力を使って画像選択
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);

    // <img> なら src、ブロック要素なら background-image を更新
    if (imgEl.tagName === "IMG") {
      imgEl.src = url;
    } else {
      imgEl.style.backgroundImage = `url(${url})`;
      imgEl.style.backgroundSize = imgEl.style.backgroundSize || "cover";
      imgEl.style.backgroundPosition =
        imgEl.style.backgroundPosition || "center";
    }
  });

  // ユーザー操作でダイアログを開く
  input.click();
}

// （便利）画像領域の有無を返すヘルパー
export function boxHasImageSlot(boxId) {
  const rec = boxes.get(boxId);
  if (!rec || !rec.el) return false;
  return !!rec.el.querySelector("img, .cbox-image, .img, .image");
}
// ===== Helpers for box-text line-break limiting (explicit newlines) =====
/*不要かも
function _bx_getLogicalTextFromEditable(el) {
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
*/

function _bx_countLinesByInnerText(el) {
  try {
    const t = String(el.innerText ?? el.textContent ?? "").replace(
      /\r\n?/g,
      "\n"
    );
    return t.length ? t.split("\n").length : 1;
  } catch {
    const t = String(el.textContent ?? "").replace(/\r\n?/g, "\n");
    return t.length ? t.split("\n").length : 1;
  }
}

function _bx_countLinesByHTML(el) {
  try {
    let html = String(el.innerHTML ?? "");
    html = html.replace(/<div><br><\/div>/gi, "\n"); // 空行DIV
    html = html.replace(/<div>/gi, "\n");
    html = html.replace(/<\/div>/gi, "");
    html = html.replace(/<br\s*\/?>/gi, "\n");
    html = html.replace(/&nbsp;/gi, " ");
    html = html.replace(/<[^>]*>/g, "");
    html = html.replace(/\r\n?/g, "\n");
    return html.length ? html.split("\n").length : 1;
  } catch {
    return _bx_countLinesByInnerText(el);
  }
}

function _bx_countLogicalLines(el) {
  return Math.max(_bx_countLinesByInnerText(el), _bx_countLinesByHTML(el));
}

function _bx_placeCaretEnd(el) {
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  } catch {}
}

function attachBoxTextLineLimit(el, maxLines) {
  if (!el || !(+maxLines > 0)) return;
  if (el.__boxTextMaxLineHandlers) return; // 二重付与防止

  const snapshot = () => {
    el.__prevHTML = el.innerHTML;
  };

  const onBeforeInput = (e) => {
    snapshot();
    const type = e.inputType || "";

    // A) Enter / Shift+Enter での改行を未然にブロック
    if (type === "insertParagraph" || type === "insertLineBreak") {
      if (_bx_countLogicalLines(el) >= maxLines) {
        e.preventDefault();
        return;
      }
    }

    // B) 一部ブラウザ/IMEが insertText("\n") で改行を送るケース
    if (
      type === "insertText" &&
      typeof e.data === "string" &&
      e.data.indexOf("\n") !== -1
    ) {
      const cur = _bx_countLogicalLines(el);
      const remain = Math.max(0, maxLines - cur);
      if (remain <= 0) {
        e.preventDefault();
        return;
      }
      const parts = e.data.replace(/\r\n?/g, "\n").split("\n");
      const limited = parts.slice(0, remain + 1).join("\n");
      const leftover = parts.slice(remain + 1).join(" ");
      const finalText = leftover
        ? limited + (limited ? " " : "") + leftover
        : limited;
      e.preventDefault();
      try {
        document.execCommand("insertText", false, finalText);
      } catch {
        el.textContent = (el.textContent || "") + finalText;
      }
      return;
    }

    // C) 貼り付け：残り行数だけ改行を許可（余剰改行は空白へ）
    if (type === "insertFromPaste") {
      e.preventDefault();
      let text = "";
      try {
        text = (e.clipboardData || window.clipboardData).getData("text") || "";
      } catch {}
      const cur = _bx_countLogicalLines(el);
      const remain = Math.max(0, maxLines - cur);
      const parts = String(text).replace(/\r\n?/g, "\n").split("\n");
      if (remain <= 0) {
        const insert = parts.join(" ");
        try {
          document.execCommand("insertText", false, insert);
        } catch {
          el.textContent = (el.textContent || "") + insert;
        }
        return;
      }
      const limited = parts.slice(0, remain + 1).join("\n");
      const leftover = parts.slice(remain + 1).join(" ");
      const finalText = leftover
        ? limited + (limited ? " " : "") + leftover
        : limited;
      try {
        document.execCommand("insertText", false, finalText);
      } catch {
        el.textContent = (el.textContent || "") + finalText;
      }
    }
  };

  const onInput = () => {
    // 念のため：適用後に超過していたら復元
    if (
      _bx_countLogicalLines(el) > maxLines &&
      typeof el.__prevHTML === "string"
    ) {
      el.innerHTML = el.__prevHTML;
      _bx_placeCaretEnd(el);
    }
  };

  const onKeyDown = (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter" && _bx_countLogicalLines(el) >= maxLines) {
      e.preventDefault(); // beforeinput 非対応ブラウザ保険
    }
  };

  const onCompEnd = () => {
    if (
      _bx_countLogicalLines(el) > maxLines &&
      typeof el.__prevHTML === "string"
    ) {
      el.innerHTML = el.__prevHTML;
      _bx_placeCaretEnd(el);
    }
  };

  el.addEventListener("beforeinput", onBeforeInput, true);
  el.addEventListener("input", onInput, true);
  el.addEventListener("keydown", onKeyDown, true);
  el.addEventListener("compositionend", onCompEnd, true);

  el.__boxTextMaxLineHandlers = {
    onBeforeInput,
    onInput,
    onKeyDown,
    onCompEnd,
  };
}

function _enableBoxTextMaxLineBreaks(el, maxLines) {
  if (!el || !(+maxLines > 0)) return;
  if (el.__boxTextMaxLineHandlers) return; // 重複付与防止

  const snapshot = () => {
    el.__prevHTML = el.innerHTML;
  };

  const onBeforeInput = (e) => {
    snapshot();
    const type = e.inputType || "";

    // A) Enter / Shift+Enter を未然にブロック
    if (type === "insertParagraph" || type === "insertLineBreak") {
      if (_bx_countLogicalLines(el) >= maxLines) {
        e.preventDefault();
        return;
      }
    }

    // B) 一部ブラウザ/IMEで改行が insertText("\n") として来るケースも抑止
    if (
      type === "insertText" &&
      typeof e.data === "string" &&
      e.data.indexOf("\n") !== -1
    ) {
      // ここで改行が増える見込み → 残枠がなければブロック、あれば \n を必要数にトリミング
      const cur = _bx_countLogicalLines(el);
      const remain = Math.max(0, maxLines - cur);
      if (remain <= 0) {
        e.preventDefault();
        return;
      }
      // \n が複数含まれる貼り付け相当のパス
      const parts = e.data.replace(/\r\n?/g, "\n").split("\n");
      const limited = parts.slice(0, remain + 1).join("\n");
      const leftover = parts.slice(remain + 1).join(" ");
      const finalText = leftover
        ? limited + (limited ? " " : "") + leftover
        : limited;
      e.preventDefault();
      try {
        document.execCommand("insertText", false, finalText);
      } catch {
        el.textContent = (el.textContent || "") + finalText;
      }
      return;
    }

    // C) 貼り付けは残枠ぶんだけ改行許可（余剰改行は空白化）
    if (type === "insertFromPaste") {
      e.preventDefault();
      let text = "";
      try {
        text = (e.clipboardData || window.clipboardData).getData("text") || "";
      } catch {}
      const cur = _bx_countLogicalLines(el);
      const remain = Math.max(0, maxLines - cur);
      const parts = String(text).replace(/\r\n?/g, "\n").split("\n");
      if (remain <= 0) {
        const insert = parts.join(" ");
        try {
          document.execCommand("insertText", false, insert);
        } catch {
          el.textContent = (el.textContent || "") + insert;
        }
        return;
      }
      const limited = parts.slice(0, remain + 1).join("\n");
      const leftover = parts.slice(remain + 1).join(" ");
      const finalText = leftover
        ? limited + (limited ? " " : "") + leftover
        : limited;
      try {
        document.execCommand("insertText", false, finalText);
      } catch {
        el.textContent = (el.textContent || "") + finalText;
      }
    }
  };

  const onInput = () => {
    // 念のため：適用後に超過していたら復元
    if (
      _bx_countLogicalLines(el) > maxLines &&
      typeof el.__prevHTML === "string"
    ) {
      el.innerHTML = el.__prevHTML;
      _bx_placeCaretEnd(el);
    }
  };

  const onKeyDown = (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter" && _bx_countLogicalLines(el) >= maxLines) {
      e.preventDefault(); // beforeinput 非対応ブラウザの保険
    }
  };

  const onCompEnd = () => {
    if (
      _bx_countLogicalLines(el) > maxLines &&
      typeof el.__prevHTML === "string"
    ) {
      el.innerHTML = el.__prevHTML;
      _bx_placeCaretEnd(el);
    }
  };

  el.addEventListener("beforeinput", onBeforeInput, true);
  el.addEventListener("input", onInput, true);
  el.addEventListener("keydown", onKeyDown, true);
  el.addEventListener("compositionend", onCompEnd, true);
  el.__boxTextMaxLineHandlers = {
    onBeforeInput,
    onInput,
    onKeyDown,
    onCompEnd,
  };
}

function _disableBoxTextMaxLineBreaks(el) {
  const h = el && el.__boxTextMaxLineHandlers;
  if (!h) return;
  el.removeEventListener("beforeinput", h.onBeforeInput, true);
  el.removeEventListener("input", h.onInput, true);
  el.removeEventListener("keydown", h.onKeyDown, true);
  el.removeEventListener("compositionend", h.onCompEnd, true);
  el.__boxTextMaxLineHandlers = null;
  el.__prevHTML = undefined;
}

// ==== inline editor for cbox title/text ====
function _attachInlineEdit(containerEl, targetEl, { singleLine = false } = {}) {
  if (!containerEl || !targetEl) return;
  if (targetEl.dataset.inlineHooked === "1") return; // 二重付与防止
  targetEl.dataset.inlineHooked = "1";

  let _beforeText = "";

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    } else if (singleLine && e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    }
    // 複数行テキストは Enter=改行（デフォルト許可）
  };

  const outsideCommit = (e) => {
    if (!containerEl.contains(e.target)) commitEdit();
  };

  const startEdit = (ev) => {
    ev.stopPropagation();
    const el =
      (typeof targetEl !== "undefined" && targetEl) ||
      ev.currentTarget?.closest?.(".box-text, .box-title") ||
      ev.target?.closest?.(".box-text, .box-title");

    if (!el) {

      return;
    }

    if (el.dataset.editing === "1") return;
    el.dataset.editing = "1";
    el.setAttribute("contenteditable", "true");
    el.classList.add("is-editing");

    // 全選択して開始
    try {
      const r = document.createRange();
      r.selectNodeContents(targetEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    } catch {}
    targetEl.focus();

    const role =
      el.dataset.role ||
      (el.classList.contains("box-title")
        ? "title"
        : el.classList.contains("box-text")
        ? "text"
        : "");
    _enableBoxTextMaxLineBreaks(el, BOX_TEXT_MAX_LINES);

    document.addEventListener("pointerdown", el._outsideCommit, true);
    targetEl.addEventListener("keydown", onKeyDown, true);
  };

  const commitEdit = () => {
    if (targetEl.dataset.editing !== "1") return;
    const role =
      targetEl.dataset.role ||
      (targetEl.classList.contains("box-title")
        ? "title"
        : targetEl.classList.contains("box-text")
        ? "text"
        : "");
    if (role === "text" || targetEl.classList.contains("box-text")) {
      _disableBoxTextMaxLineBreaks(targetEl);
    }

    // ★ ここから追加：値の確定＆空欄なら既定値に戻す（必要なら丸め）
    (function () {
      // 役割の判定（data-role優先／クラス後方互換）
      const role =
        targetEl.dataset.role ||
        (targetEl.classList.contains("box-title") ? "title" : "text");

      // 現在の値
      let val = String(targetEl.textContent ?? "");

      // 空欄（改行・スペースのみ含む）なら既定値へ
      if (isBlankTextBox(val)) {
        const DEF_TITLE =
          typeof BOX_TITLE_DEFAULT_LABEL !== "undefined"
            ? BOX_TITLE_DEFAULT_LABEL
            : "タイトルを入力";
        const DEF_TEXT =
          typeof BOX_TEXT_DEFAULT_LABEL !== "undefined"
            ? BOX_TEXT_DEFAULT_LABEL
            : "テキストを入力";
        val = role === "title" ? DEF_TITLE : DEF_TEXT;
      }

      // 必要に応じて最大文字数を丸める（テキスト側だけ等の調整も可）
      if (
        typeof TEXTBOX_MAXCHARACOUNT !== "undefined" &&
        +TEXTBOX_MAXCHARACOUNT > 0 &&
        (role === "text" || targetEl.classList.contains("box-text"))
      ) {
        if (val.length > +TEXTBOX_MAXCHARACOUNT) {
          val = val.slice(0, +TEXTBOX_MAXCHARACOUNT);
        }
      }

      // 反映
      if (targetEl.textContent !== val) targetEl.textContent = val;
    })();
    // ★ ここまで追加

    // ── 既存の終了処理（そのまま） ──
    targetEl.removeAttribute("contenteditable");
    targetEl.classList.remove("is-editing");
    targetEl.dataset.editing = "";
    document.removeEventListener("pointerdown", outsideCommit, true);
    targetEl.removeEventListener("keydown", onKeyDown, true);
  };

  const cancelEdit = () => {
    if (targetEl.dataset.editing !== "1") return;
    const role =
      targetEl.dataset.role ||
      (targetEl.classList.contains("box-title")
        ? "title"
        : targetEl.classList.contains("box-text")
        ? "text"
        : "");
    if (role === "text" || targetEl.classList.contains("box-text")) {
      _disableBoxTextMaxLineBreaks(targetEl);
    }
    targetEl.textContent = _beforeText;
    commitEdit();
  };

  // 開始：ダブルクリック
  targetEl.addEventListener("dblclick", startEdit);

  // 編集中はドラッグ等に伝播させない
  targetEl.addEventListener("mousedown", (e) => e.stopPropagation(), {
    capture: true,
  });
  targetEl.addEventListener("pointerdown", (e) => e.stopPropagation(), {
    capture: true,
  });

  // 保険：フォーカスが外れたら確定
  targetEl.addEventListener("blur", () => {
    if (targetEl.dataset.editing === "1") commitEdit();
  });
}

function _setupCboxEditors(boxEl) {
  const titleEl = boxEl.querySelector(".box-title, [data-role='title']");
  const textEl = boxEl.querySelector(".box-text,  [data-role='text']");
  if (titleEl) _attachInlineEdit(boxEl, titleEl, { singleLine: true });
  if (textEl) _attachInlineEdit(boxEl, textEl, { singleLine: false });
}

// ボックス内にインジケータ用レイヤを用意
function ensureEditIndicatorLayer(boxEl) {
  let ind = boxEl.querySelector(":scope > .edit-indicator");
  if (!ind) {
    ind = document.createElement("div");
    ind.className = "edit-indicator";
    // インラインスタイルで自己完結
    ind.style.position = "absolute";
    ind.style.top = "calc(100% + 2px)";
    ind.style.left = "0";
    ind.style.fontSize = "12px";
    ind.style.color = "#d32f2f"; // 赤
    ind.style.fontWeight = "600";
    ind.style.pointerEvents = "none";
    ind.style.userSelect = "none";
    ind.style.whiteSpace = "nowrap";
    ind.style.zIndex = "1000";
    ind.style.display = "none";
    boxEl.appendChild(ind);

    // 親が relative でない場合は相対配置にする
    const cs = getComputedStyle(boxEl);
    if (cs.position === "static") boxEl.style.position = "relative";
  }
  return ind;
}

function showEditIndicator(boxEl, kind /* 'title' | 'text' */) {
  const ind = ensureEditIndicatorLayer(boxEl);
  ind.textContent = kind === "title" ? EDIT_LABEL_TITLE : EDIT_LABEL_TEXT;
  ind.style.display = "block";
}

function hideEditIndicator(boxEl) {
  const ind = boxEl.querySelector(":scope > .edit-indicator");
  if (ind) ind.style.display = "none";
}

// タイトル/テキストのフォーカス・確定で表示/非表示を切り替える
function attachEditIndicatorHandlers(boxEl) {
  const titleEl = boxEl.querySelector(
    '[data-role="title"], .box-title, .cbox-title, .title'
  );
  const textEl = boxEl.querySelector(
    '[data-role="text"],  .box-text,  .cbox-text,  .text'
  );

  // タイトル
  if (titleEl && !titleEl.dataset.editIndHooked) {
    titleEl.dataset.editIndHooked = "1";
    // focusはバブリングしないので要素自身に付与（capture指定で他のstopPropagationの影響を受けにくく）
    titleEl.addEventListener(
      "focus",
      () => showEditIndicator(boxEl, "title"),
      true
    );
    titleEl.addEventListener("blur", () => hideEditIndicator(boxEl), true);
    // タイトルは Enter=確定／Esc=キャンセル運用が多いので確定時にも消す
    titleEl.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter" || e.key === "Escape") hideEditIndicator(boxEl);
      },
      true
    );
  }

  // テキスト
  if (textEl && !textEl.dataset.editIndHooked) {
    textEl.dataset.editIndHooked = "1";
    textEl.addEventListener(
      "focus",
      () => showEditIndicator(boxEl, "text"),
      true
    );
    textEl.addEventListener("blur", () => hideEditIndicator(boxEl), true);
    // テキストは Enter=改行のケースが多いので Escのみで消す（確定は blur で対応）
    textEl.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") hideEditIndicator(boxEl);
      },
      true
    );
  }
}

// ==== 選択インジケータ（ボックス上に赤字で「（n番目選択中）」） ====
// 1回だけCSSを注入：選択枠の線を消す（数字バッジ等はそのまま）
(function __injectSelectCssOnce() {
  if (window.__selectCssOnce) return;
  window.__selectCssOnce = true;
  const style = document.createElement("style");
  style.textContent = `
  .box.sel[data-rank="1"],
  .box.sel[data-rank="2"] {
    outline: none !important;
    box-shadow: none !important;
  }
`;
  document.head.appendChild(style);
})();

// .selected クラス（または data-selected）が付いたら表示、外れたら非表示
function attachSelectIndicatorHandlers(boxEl) {
  try {
    if (boxEl) ensureSelectIndicatorLayer(boxEl);
  } catch (e) {}
}

// ==== 選択インジケータ（枠線OFF＋「（n番目選択中）」） ====

// 枠線を消すCSS（V0.031：.sel + data-rank を使用）
(function __injectSelectCssOnce() {
  if (window.__selectCssOnce) return;
  window.__selectCssOnce = true;
  const style = document.createElement("style");
  style.textContent = `
    .box.sel[data-rank] {
      outline: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
})();

// 赤字レイヤを用意（なければ作る）
function ensureSelectIndicatorLayer(boxEl) {
  let ind = boxEl.querySelector(":scope > .select-indicator");
  if (!ind) {
    ind = document.createElement("div");
    ind.className = "select-indicator";
    ind.style.position = "absolute";
    ind.style.top = "-18px";
    ind.style.left = "0";
    ind.style.fontSize = "12px";
    ind.style.color = "#d32f2f"; // 赤
    ind.style.fontWeight = "600";
    ind.style.pointerEvents = "none";
    ind.style.userSelect = "none";
    ind.style.whiteSpace = "nowrap";
    ind.style.zIndex = "1000";
    ind.style.display = "none";
    boxEl.appendChild(ind);

    const cs = getComputedStyle(boxEl);
    if (cs.position === "static") boxEl.style.position = "relative";
  }
  return ind;
}

function showSelectIndicator(boxEl) {
  const ind = ensureSelectIndicatorLayer(boxEl);
  const n = parseInt(boxEl.getAttribute("data-rank") || "", 10);
  const text = n && n > 0 ? `（${n}番目選択中）` : "（選択中）";
  if (ind.textContent !== text) ind.textContent = text;
  ind.style.display = "block";
}

function hideSelectIndicator(boxEl) {
  const ind = boxEl.querySelector(":scope > .select-indicator");
  if (ind && ind.style.display !== "none") ind.style.display = "none";
}

// 全ボックスの表示状態を一括更新（選択ロジックの“出口”で呼ぶ）
function updateSelectIndicators() {
  document.querySelectorAll(".box.cbox").forEach((el) => {
    const selected =
      el.classList.contains("sel") && !!el.getAttribute("data-rank");
    if (selected) showSelectIndicator(el);
    else hideSelectIndicator(el);
  });
}
