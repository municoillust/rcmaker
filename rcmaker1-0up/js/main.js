/* Public Release Build
   Cleaned: 2025-09-16T13:01:51
   Notes: Debug logs removed; minor whitespace tidy. No behavior changes intended.
*/
'use strict';
// main.js
import {
  initWires,
  clearAllWires,
  updateConnectionsForBox,
  connectBoxes,
  setWireArrowType,
  setWireColor,
  setWireLineType,
  setWireText,
  setWireIcon,
} from "./wires.js";
import {
  createBox,
  setSelected,
  boxes,
  enableStageSelection,
  getSelectedId,
  deleteAllBoxes,
  createCompositeBox,
} from "./boxes.js";

//デバッグ用インポート。「//デバッグ（削除）」で検索して出てきた行は、本番時削除してください。
//import { initWireDebugPanel } from "./wire-debug-panel.js";

const canvas = document.getElementById("canvasWrap");
const wiresSvg = document.getElementById("wires");

const addTextBtn = document.getElementById("addTextBtn");
const addImageBtn = document.getElementById("addImageBtn");
const deleteBtn = document.getElementById("deleteBtn");
const clearWiresBtn = document.getElementById("clearWiresBtn");
const DRAG_DEFAULT_AREA = [1200, 800]; //ドラッグエリアXとYの初期値

// --- エリア初期サイズの設定（ブラウザサイズ依存） ---
function setInitialAreaSize() {
  const MIN_W = 600;
  const MIN_H = 400;

  const el = document.getElementById("canvasWrap");
  if (!el) return;

  const vw = Math.max(
    document.documentElement.clientWidth,
    window.innerWidth || 0
  );
  const vh = Math.max(
    document.documentElement.clientHeight,
    window.innerHeight || 0
  );

  // 画面の 65% / 70% を基準に、最小サイズでクランプ
  const width = Math.max(MIN_W, Math.floor(vw * 0.65)); // 横65%
  const height = Math.max(MIN_H, Math.floor(vh * 0.7)); // 縦70%

  el.style.width = DRAG_DEFAULT_AREA[0] + "px";
  el.style.height = DRAG_DEFAULT_AREA[1] + "px";
}

// -------------------- 初期化ST --------------------
initWires(canvas, wiresSvg);
enableStageSelection(canvas, wiresSvg);

/*/デバッグ用でコンソールから呼べるようにする
window.setWireArrowType = setWireArrowType;
window.setWireColor = setWireColor;
window.setWireLineType = setWireLineType;
window.setWireText = setWireText;
window.setWireIcon = setWireIcon;
window.clearAllWires = clearAllWires;
//デバッグ用ここまで*/

document.addEventListener("DOMContentLoaded", () => {
  setInitialAreaSize();
  setupAreaResizeHandles();
  initBgPicker();
  initBoxComposer();

  // 全ボックス削除
  deleteBtn.addEventListener("click", () => {
    if (!confirm("全てのボックスを削除しますか？（接続線も消えます）")) return;
    deleteAllBoxes();
    setupAreaResizeHandles();
  });

  // 線を全消去
  clearWiresBtn.addEventListener("click", () => {
    if (!confirm("全ての接続線を削除しますか？（ボックスは維持されます）"))
      return;
    clearAllWires();
    setupAreaResizeHandles();
  });

  // 画面リサイズで線を追従
  window.addEventListener("resize", () => {
    for (const { el } of boxes.values()) {
      updateConnectionsForBox(el.dataset.id);
    }
  });

  window.dispatchEvent(new Event("resize"));
});

function getCanvasEl() {
  return document.getElementById("canvasWrap");
}

function initBoxComposer() {
  const chkTitle = document.getElementById("chkTitle");
  const chkImage = document.getElementById("chkImage");
  const chkText = document.getElementById("chkText");
  const btnGen = document.getElementById("btnGenerateBox");
  const fileIn = document.getElementById("imageUploader");
  if (!chkTitle || !chkImage || !chkText || !btnGen) return;

  const refresh = () => {
    btnGen.disabled = !(
      chkTitle.checked ||
      chkImage.checked ||
      chkText.checked
    );
  };
  [chkTitle, chkImage, chkText].forEach((el) =>
    el.addEventListener("change", refresh)
  );
  refresh();

  btnGen.addEventListener("click", async () => {
    const withTitle = chkTitle.checked;
    const withImage = chkImage.checked;
    const withText = chkText.checked;

    let imageSrc = null;
    if (withImage) {
      imageSrc = await pickImage(fileIn); // キャンセル可（null）
    }

    const canvas = getCanvasEl();
    const count = (canvas?.querySelectorAll(".box").length || 0) + 1;
    const defaultTitle = `L_ダブルクリックで編集（${count}）`; // 全角カッコ

    const el = createCompositeBox({
      withTitle,
      withImage,
      withText,
      title: defaultTitle,
      text: "",
      imageSrc,
    });

    if (canvas) {
      canvas.appendChild(el);
      el.style.left = "40px";
      el.style.top = "40px";
      // 既存のドラッグ/選択初期化があれば呼ぶ
      if (typeof window.initBoxDrag === "function") {
        window.initBoxDrag(el);
      }
    }
  });
}

function pickImage(fileInput) {
  return new Promise((resolve) => {
    fileInput.value = "";
    fileInput.onchange = () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(f);
    };
    fileInput.click();
  });
}
//phase17ED

// 背景色ピッカー初期化：ドラッグエリア外のボタン→ #canvasWrap の背景変数(--bgcanvas)を切替
function initBgPicker() {
  const picker = document.getElementById("bgPicker");
  if (!picker) return;

  picker.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-bg]");
    if (!btn) return;

    // アクティブ表示
    picker
      .querySelectorAll(".swatch.is-active")
      .forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    const val = btn.dataset.bg;
    const root = document.documentElement;

    if (val === "DEFAULT") {
      // 既定（CSSの値）へ戻す
      root.style.removeProperty("--bgcanvas");
    } else {
      root.style.setProperty("--bgcanvas", val);
    }
  });
}

// --- ドラッグエリアのリサイズハンドルをセットアップ ---
function setupAreaResizeHandles() {
  const MIN_W = 600; // styles.css の min-width と合わせる
  const MIN_H = 400; // styles.css の min-height と合わせる

  const wrap = document.getElementById("canvasWrap");
  if (!wrap) return;

  if (
    wrap.querySelector(".resize-handle.right") ||
    wrap.querySelector(".resize-handle.bottom")
  )
    return;

  // 既存の「2ハンドル生成」後に、コーナーも生成
  const hRight =
    wrap.querySelector(".resize-handle.right") ||
    (() => {
      const el = document.createElement("div");
      el.className = "resize-handle right";
      wrap.appendChild(el);
      return el;
    })();
  const hBottom =
    wrap.querySelector(".resize-handle.bottom") ||
    (() => {
      const el = document.createElement("div");
      el.className = "resize-handle bottom";
      wrap.appendChild(el);
      return el;
    })();
  const hCorner =
    wrap.querySelector(".resize-handle.corner") ||
    (() => {
      const el = document.createElement("div");
      el.className = "resize-handle corner";
      wrap.appendChild(el);
      return el;
    })();

  wrap.appendChild(hRight);
  wrap.appendChild(hBottom);
  wrap.appendChild(hCorner);

  let resizing = null; // 'w' or 'h'
  let startX = 0,
    startY = 0;
  let origW = 0,
    origH = 0;
  let rafId = 0;
  let nextW = null,
    nextH = null;

  const onPointerMove = (e) => {
    if (!resizing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (resizing === "w" || resizing === "wh") {
      nextW = Math.max(MIN_W, origW + dx);
    }
    if (resizing === "h" || resizing === "wh") {
      nextH = Math.max(MIN_H, origH + dy);
    }

    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        if (nextW != null) wrap.style.width = Math.round(nextW) + "px";
        if (nextH != null) wrap.style.height = Math.round(nextH) + "px";
        rafId = 0;
      });
    }
  };

  const stop = (e) => {
    if (!resizing) return;
    try {
      if (e && typeof e.pointerId === "number") {
        wrap.releasePointerCapture(e.pointerId);
      }
    } catch {}
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", stop);
    document.body.style.cursor = "";
    wrap.classList.remove("resizing");
    document.body.classList.remove("no-select");
    wrap.classList.remove("pe-none");
    resizing = null;
    nextW = nextH = null;
  };

  const start = (dir) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      (typeof e.button === "number" && e.button !== 0) ||
      e.isPrimary === false
    )
      return;
    resizing = dir;
    startX = e.clientX;
    startY = e.clientY;
    origW = wrap.getBoundingClientRect().width;
    origH = wrap.getBoundingClientRect().height;
    try {
      wrap.setPointerCapture(e.pointerId);
    } catch {}
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", stop);
    document.body.style.cursor = dir === "w" ? "ew-resize" : "ns-resize";
    wrap.classList.add("resizing");
    document.body.classList.add("no-select");
    wrap.classList.add("pe-none");
  };

  if (!hRight.__bindResize) {
    hRight.addEventListener("pointerdown", start("w"));
    hRight.__bindResize = true;
  }
  if (!hBottom.__bindResize) {
    hBottom.addEventListener("pointerdown", start("h"));
    hBottom.__bindResize = true;
  }
  if (!hCorner.__bindResize) {
    hCorner.addEventListener("pointerdown", start("wh"));
    hCorner.__bindResize = true;
  }

  // ハンドルが動的に差し替わっても拾える
  if (!wrap.__delegatedResize) {
    wrap.addEventListener("pointerdown", (e) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.classList?.contains("resize-handle"))
        return;
      const dir = t.classList.contains("corner")
        ? "wh"
        : t.classList.contains("bottom")
        ? "h"
        : "w";
      start(dir)(e);
    });
    wrap.__delegatedResize = true;
  }

  const cleanupOnBlur = () => {
    if (resizing) stop();
  };
  window.addEventListener("blur", cleanupOnBlur);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && resizing) stop();
  });
}

// ★ ボックス操作（全削除／全線消去）のイベント登録
/*不要かも
function setupBulkOps() {
  const root = document;
  const btnDelBoxes =
    document.getElementById("btnDeleteAllBoxes") ||
    root.querySelector('[data-action="delete-all-boxes"]');
  const btnClrWires =
    document.getElementById("btnClearAllWires") ||
    root.querySelector('[data-action="clear-all-wires"]');

  if (btnDelBoxes && !btnDelBoxes.__bulkBound) {
    btnDelBoxes.addEventListener("click", async () => {
      // 確認（任意で外してOK）
      if (!confirm("全てのボックスと線を削除します。よろしいですか？")) return;
      const m = await import("./boxes.js");
      await m.removeAllBoxes?.();
    });
    btnDelBoxes.__bulkBound = true;
  }
  if (btnClrWires && !btnClrWires.__bulkBound) {
    btnClrWires.addEventListener("click", async () => {
      const w = await import("./wires.js");
      w.clearAllWires?.();
    });
    btnClrWires.__bulkBound = true;
  }
}
*/
