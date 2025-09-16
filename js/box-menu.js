/* Public Release Build
   Cleaned: 2025-09-16T13:01:51
   Notes: Debug logs removed; minor whitespace tidy. No behavior changes intended.
*/
'use strict';
let _menuEl = null;
let _outsideHandler = null;
let _keyHandler = null;

function _closeMenu() {
  if (_outsideHandler) {
    document.removeEventListener("pointerdown", _outsideHandler, true);
    _outsideHandler = null;
  }
  if (_keyHandler) {
    document.removeEventListener("keydown", _keyHandler, true);
    _keyHandler = null;
  }
  if (_menuEl && _menuEl.isConnected) {
    try {
      _menuEl.remove();
    } catch {}
  }
  _menuEl = null;
}

export function openBoxMenu({
  anchorX,
  anchorY,
  currentColor,
  swatches,
  grid = { cols: 4, rows: 2 },
  onColor,
  onClose,
  actions = [],
}) {
  _closeMenu();

  const el = document.createElement("div");
  el.className = "box-menu";
  el.style.position = "absolute";
  el.style.left = `${Math.round(anchorX)}px`;
  el.style.top = `${Math.round(anchorY)}px`;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "ボックス枠色の選択");

  // --- actions (optional)
  if (Array.isArray(actions) && actions.length) {
    const list = document.createElement("div");
    list.className = "box-menu-actions";
    actions.forEach((act) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "box-menu-item";
      btn.textContent = act?.label || "";
      if (act?.disabled) btn.disabled = true;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          act?.onClick && act.onClick();
        } finally {
          _closeMenu();
          onClose && onClose();
        }
      });
      list.appendChild(btn);
    });
    el.appendChild(list);

    // 区切り線
    const sep = document.createElement("div");
    sep.className = "box-menu-sep";
    el.appendChild(sep);
  }

  // --- swatches
  const gridEl = document.createElement("div");

  gridEl.className = "box-swatch-grid";
  gridEl.style.display = "grid";
  gridEl.style.gridTemplateColumns = `repeat(${grid?.cols || 4}, 24px)`;
  gridEl.style.gridAutoRows = "24px";
  gridEl.style.gap = "6px";

  const makeChecker = (btn) => {
    btn.style.backgroundImage = [
      "linear-gradient(45deg, #cfcfcf 25%, transparent 25%)",
      "linear-gradient(-45deg, #cfcfcf 25%, transparent 25%)",
      "linear-gradient(45deg, transparent 75%, #cfcfcf 75%)",
      "linear-gradient(-45deg, transparent 75%, #cfcfcf 75%)",
    ].join(",");
    btn.style.backgroundSize = "10px 10px";
    btn.style.backgroundPosition = "0 0, 0 5px, 5px -5px, -5px 0px";
    btn.style.backgroundColor = "white";
  };

  const focusables = [];

  (swatches || [])
    .slice(0, (grid?.cols || 4) * (grid?.rows || 2))
    .forEach((color, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "box-swatch-btn";
      btn.style.width = "24px";
      btn.style.height = "24px";
      btn.style.border = "1px solid #aaa";
      btn.style.borderRadius = "6px";
      btn.style.padding = "0";
      btn.style.cursor = "pointer";
      btn.style.outline = "none";
      btn.setAttribute("aria-label", color === "transparent" ? "透明" : color);

      if (color === "transparent") {
        makeChecker(btn);
      } else {
        btn.style.background = color;
      }

      if (
        currentColor &&
        String(currentColor).toLowerCase() === String(color).toLowerCase()
      ) {
        btn.classList.add("is-selected");
        btn.style.boxShadow = "0 0 0 2px #4da3ff";
      }

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          onColor && onColor(color);
        } finally {
          _closeMenu();
          onClose && onClose();
        }
      });

      gridEl.appendChild(btn);
      focusables.push(btn);
    });

  el.appendChild(gridEl);
  document.body.appendChild(el);
  _menuEl = el;

  // 画面外はみ出し補正
  try {
    const bb = el.getBoundingClientRect();
    let left = anchorX,
      top = anchorY;
    if (bb.right > window.innerWidth)
      left = Math.max(0, window.innerWidth - bb.width - 8);
    if (bb.bottom > window.innerHeight)
      top = Math.max(0, window.innerHeight - bb.height - 8);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  } catch {}

  // 外側クリックで閉じる
  _outsideHandler = (e) => {
    if (!_menuEl) return;
    if (!_menuEl.contains(e.target)) {
      _closeMenu();
      onClose && onClose();
    }
  };
  document.addEventListener("pointerdown", _outsideHandler, true);

  // キーボード（Escで閉じる）
  _keyHandler = (e) => {
    if (e.key === "Escape") {
      _closeMenu();
      onClose && onClose();
    }
  };
  document.addEventListener("keydown", _keyHandler, true);

  // 初期フォーカス
  if (focusables.length) {
    const selIdx = focusables.findIndex((b) =>
      b.classList.contains("is-selected")
    );
    const first = selIdx >= 0 ? focusables[selIdx] : focusables[0];
    try {
      first.focus();
    } catch {}
  }

  return { close: _closeMenu };
}
