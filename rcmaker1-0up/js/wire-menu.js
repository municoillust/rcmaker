/* Public Release Build
   Cleaned: 2025-09-16T13:01:51
   Notes: Debug logs removed; minor whitespace tidy. No behavior changes intended.
*/
'use strict';
// wire-menu.js（新規追加）
// 役割: 右クリックメニューのUIだけを担当。状態とコールバックは呼び出し元（wires.js）から受け取る。

const WIRE_MENU_CLASS = "wire-menu";
const WIRE_MENU_DISABLED = "is-disabled";
const WIRE_MENU_SELECTED = "is-selected";
const WIRE_MENU_BTNS = "wire-menu-btns";

// === モジュール内で唯一のアクティブメニューを管理 ===
let _menuRoot = null;
let _menuDocDown = null;
let _menuKey = null;

function closeWireMenuGlobal() {
  try {
    if (_menuDocDown)
      document.removeEventListener("mousedown", _menuDocDown, {
        capture: true,
      });
    if (_menuKey) document.removeEventListener("keydown", _menuKey);
  } catch {}
  if (_menuRoot && _menuRoot.isConnected) _menuRoot.remove();
  _menuRoot = null;
  _menuDocDown = null;
  _menuKey = null;
}

export function openWireMenu(cfg) {
  const {
    anchorX,
    anchorY,
    current = {
      arrowType: "none",
      lineType: "none",
      color: "#000000",
      iconIndex: 0,
    },
    presets = {},
    onApply,
    onDelete,
    onCancel,
    onMakeParallel,
    onMakeSingle,
  } = cfg || {};
  let selDuplexAction = null;

  // ミニ確認ポップアップ（OK/キャンセル）
  function showMiniConfirm(message, onOk, onCancel) {
    const overlay = document.createElement("div");
    overlay.className = "wm-confirm";
    overlay.innerHTML = `
    <div class="wm-confirm-box">
      <div class="wm-confirm-msg">${message}</div>
      <div class="wm-confirm-actions">
        <button type="button" class="wm-confirm-ok">OK</button>
        <button type="button" class="wm-confirm-cancel">キャンセル</button>
      </div>
    </div>
  `;

    // メニュー内クリック扱い（外側クリック閉じを抑制）
    overlay.addEventListener("mousedown", (e) => e.stopPropagation());
    overlay.addEventListener("click", (e) => e.stopPropagation());

    // ★ 表示中フラグを付与
    root.classList.add("is-confirm-open");
    root.appendChild(overlay);

    const cleanup = () => {
      try {
        root.removeChild(overlay);
      } catch {}
      root.classList.remove("is-confirm-open");
    };

    overlay.querySelector(".wm-confirm-ok")?.addEventListener("click", () => {
      cleanup();
      onOk && onOk();
    });

    overlay
      .querySelector(".wm-confirm-cancel")
      ?.addEventListener("click", () => {
        cleanup();
        onCancel && onCancel();
      });
  }

  // P29: 平行線ロック状態と無効化制御ヘルパー
  let lockedByParallel = false;

  function applyDisableForLineTypeAndIcons() {
    typeRow.classList.remove(WIRE_MENU_DISABLED);
    typeRow.setAttribute("aria-disabled", "false");
    typeRow.querySelectorAll(".wire-menu-radio").forEach((n) => {
      n.classList.remove(WIRE_MENU_DISABLED);
    });

    // アイコングリッドは updateIconGridState に集約（lockedも考慮）
    //lockedByParallel = !!disabled;
    updateIconGridState();
  }

  function reconcileLockAndRefresh() {
    applyDisableForLineTypeAndIcons();
  }

  const COLORS =
    Array.isArray(presets.colors) && presets.colors.length
      ? presets.colors
      : [
          /*…既存…*/
        ];
  // （新規追加）カラー16色フォールバック（8×2を保証）
  const FALLBACK_COLORS16 = [
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
  const COLORS16 =
    Array.isArray(presets.colors) && presets.colors.length === 16
      ? presets.colors
      : FALLBACK_COLORS16;
  const ICONS =
    Array.isArray(presets.icons) && presets.icons.length
      ? presets.icons
      : Array.from({ length: 8 }, () => "./image/noimage.png");

  closeWireMenuGlobal();

  let selArrow = current.arrowType; //P27追加
  const allowedArrows = [
    "single_both",
    "single_sted",
    "single_edst",
    "single_noarrow",
  ];
  if (!allowedArrows.includes(selArrow)) selArrow = "single_noarrow"; //P27追加
  let selType = current.lineType || "none";
  let selColor = current.color || COLORS[0];
  let selIconIdx =
    selType === "text" || selType === "none"
      ? -1
      : Number.isInteger(current.iconIndex) && current.iconIndex >= 0
      ? current.iconIndex
      : 15;

  const root = document.createElement("div");
  root.className = WIRE_MENU_CLASS;
  root.tabIndex = -1; //focus可能
  root.style.display = "block";

  // エラー表示領域（OK押下時のバリデーション用）
  const errEl = document.createElement("div");
  errEl.className = "wire-menu-error";
  const setError = (msg) => {
    errEl.textContent = msg || "";
    errEl.style.display = msg ? "block" : "none";
  };

  // --- 1段目：タイトル ---
  const title = document.createElement("div");
  title.className = "wire-menu-title";
  title.textContent = "線の変更";
  root.appendChild(title);

  // 小見出し：矢印タイプ
  const arrowCaption = document.createElement("div");
  arrowCaption.className = "wire-menu-subtitle";
  arrowCaption.textContent = "矢印タイプ";
  root.appendChild(arrowCaption);

  // ---- 2段目：矢印タイプ ----
  const arrowRow = document.createElement("div");
  arrowRow.className = "wire-menu-row arrow-row";
  const ARROW_OPTIONS = [
    { v: "single_both", label: "両端" },
    { v: "single_sted", label: "片側(始点)" },
    { v: "single_edst", label: "片側(終点)" },
    { v: "single_noarrow", label: "矢印なし" },
    { v: "roundtrip", label: "平行線化" },
  ];
  ARROW_OPTIONS.forEach((opt) => {
    if (opt.label === "平行線化" || opt.v === "__duplex_make__") {
      const isDuplex = !!current?.duplexId; // いまの線が平行線？
      const btnDuplex = document.createElement("button");
      btnDuplex.type = "button";
      btnDuplex.className = "wire-menu-radio wm-inline-duplex";
      btnDuplex.dataset.role = "arrow-radio"; // 矢印ラジオ群と同じ排他グループ
      btnDuplex.textContent = isDuplex ? "単線化" : "平行線化";

      // 念のため：過去の無効化が残っても確実に有効化する
      btnDuplex.disabled = false;
      btnDuplex.classList.remove(WIRE_MENU_DISABLED);

      btnDuplex.addEventListener("click", () => {
        const isDuplex = !!current?.duplexId;
        const msg = isDuplex
          ? "線を単線にします\n※線のアイコン、テキスト状態はリセットされます"
          : "線を平行線にします\n※線のアイコン、テキスト状態はリセットされます";

        showMiniConfirm(
          msg,
          // OK: メニューを閉じて実行（アイコン/テキストはリセット）
          () => {
            closeMenu();
            onApply &&
              onApply({
                arrowType: selArrow,
                lineType: "none",
                color: selColor,
                iconIndex: -1,
                duplexAction: isDuplex ? "single" : "make",
              });
            // ※onApply の中で wires.js が _makeParallelFromWire / _makeSingleFromParallel を呼び出します
          },
          // キャンセル: 何もせずメニューに戻る
          () => {}
        );
      });

      arrowRow.appendChild(btnDuplex);
      return; // 通常ラジオ生成はスキップ
    }

    const b = document.createElement("button");
    b.type = "button";
    b.className = "wire-menu-radio";
    b.dataset.role = "arrow-radio";
    b.textContent = opt.label;

    if (opt.v === selArrow) b.classList.add(WIRE_MENU_SELECTED);
    b.addEventListener("click", () => {
      selArrow = opt.v;
      arrowRow
        .querySelectorAll('.wire-menu-radio[data-role="arrow-radio"]')
        .forEach((n) => n.classList.remove(WIRE_MENU_SELECTED));
      b.classList.add(WIRE_MENU_SELECTED);
      selDuplexAction = null;
      updateIconGridState();
      reconcileLockAndRefresh();
    });
    arrowRow.appendChild(b);
  });
  root.appendChild(arrowRow);

  // 小見出し：線タイプ
  const wireCaption = document.createElement("div");
  wireCaption.className = "wire-menu-subtitle";
  wireCaption.textContent = "線タイプ";
  root.appendChild(wireCaption);

  // ---- 3段目：線タイプ ----
  const typeRow = document.createElement("div");
  typeRow.className = "wire-menu-row type-row";
  const TYPE_OPTIONS = [
    { v: "text", label: "テキスト" },
    { v: "icon", label: "アイコン" },
    { v: "iconText", label: "両方" },
    { v: "none", label: "なし" },
  ];
  TYPE_OPTIONS.forEach((opt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "wire-menu-radio";
    b.textContent = opt.label;
    if (opt.v === selType) b.classList.add(WIRE_MENU_SELECTED);
    b.addEventListener("click", () => {
      if (lockedByParallel) return;
      selType = opt.v;
      typeRow
        .querySelectorAll(".wire-menu-radio")
        .forEach((n) => n.classList.remove(WIRE_MENU_SELECTED));
      b.classList.add(WIRE_MENU_SELECTED);
      if (selType === "text" || selType === "none") selIconIdx = -1;
      updateIconGridState();
      validate();
      setError("");
    });
    typeRow.appendChild(b);
  });
  root.appendChild(typeRow);

  // ---- 3.5段目：アイコングリッド（テキスト時は無効）----
  const iconGrid = document.createElement("div");
  iconGrid.className = "wire-menu-icons";
  ICONS.forEach((src, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wire-menu-iconbtn";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    const applySrc = src.endsWith("blankicontitele.png")
      ? "./images/blankicon.png"
      : src;
    btn.dataset.applySrc = applySrc;
    btn.appendChild(img);
    if (idx === selIconIdx) btn.classList.add(WIRE_MENU_SELECTED);
    btn.addEventListener("click", () => {
      if (lockedByParallel) return;
      if (btn.classList.contains(WIRE_MENU_DISABLED)) return;
      selIconIdx = idx;
      iconGrid
        .querySelectorAll(".wire-menu-iconbtn")
        .forEach((n) => n.classList.remove(WIRE_MENU_SELECTED));
      btn.classList.add(WIRE_MENU_SELECTED);
      validate();
      setError("");
    });
    iconGrid.appendChild(btn);
  });
  root.appendChild(iconGrid);
  root.appendChild(errEl);

  // 現在色プレビュー
  const colorHeader = document.createElement("div");
  const colorTitle = document.createElement("div");
  const colorPreview = document.createElement("div");
  const colorHex = document.createElement("span");

  colorHeader.className = "wire-menu-colorheader";
  colorTitle.className = "wire-menu-subtitle";
  colorTitle.textContent = "線のカラー";
  colorPreview.className = "wire-menu-colorpreview";
  colorHex.className = "wire-menu-colorhex";

  colorHeader.appendChild(colorTitle);
  colorHeader.appendChild(colorPreview);
  colorHeader.appendChild(colorHex);
  root.appendChild(colorHeader);

  function setColorPreview(c) {
    colorPreview.style.backgroundColor = c;
    colorPreview.style.background = c; // shorthand も指定して上書き対策
    colorHex.textContent = (c || "").toLowerCase();
  }
  setColorPreview(selColor || COLORS16[0]);

  // カラーグリッド 8×2
  const colorGrid = document.createElement("div");
  colorGrid.className = "wire-menu-colors";

  COLORS16.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "wire-menu-swatch";
    // インラインで確実に色を反映（共通ボタンCSSの上書き対策）
    b.style.backgroundColor = c;
    b.style.background = c;
    b.dataset.color = c;

    if ((selColor || "").toLowerCase() === c.toLowerCase()) {
      b.classList.add("is-selected");
    }
    b.addEventListener("click", () => {
      selColor = c;
      setColorPreview(selColor);
      colorGrid
        .querySelectorAll(".wire-menu-swatch.is-selected")
        .forEach((n) => n.classList.remove("is-selected"));
      b.classList.add("is-selected");
    });
    colorGrid.appendChild(b);
  });
  root.appendChild(colorGrid);

  // ---- 5段目：ボタン（OK/キャンセル/削除）----
  // ---- 5段目：エラー表示＋アクションボタン ----
  // エラー表示
  root.appendChild(errEl);

  // アクションボタン行
  const actions = document.createElement("div");
  actions.className = "wire-menu-actions";

  const btnOK = document.createElement("button");
  btnOK.type = "button";
  btnOK.className = "wm-btn ok";
  btnOK.textContent = "OK";

  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.className = "wm-btn cancel";
  btnCancel.textContent = "キャンセル";

  const btnDelete = document.createElement("button");
  btnDelete.type = "button";
  btnDelete.className = "wm-btn danger";
  btnDelete.textContent = "線を削除";

  actions.appendChild(btnOK);
  actions.appendChild(btnCancel);
  actions.appendChild(btnDelete);
  root.appendChild(actions);

  // 便利関数
  function setErrors(msg) {
    setError(msg);
  }

  function validate() {
    // 平行線ロック中は線タイプ/アイコンは無視するためエラーにしない
    const needIcon = selType === "icon" || selType === "iconText";
    const ok = !(needIcon && (selIconIdx == null || selIconIdx < 0));
    btnOK.disabled = !ok;
    setError(ok ? "" : "アイコンを選択してください");
    return ok;
  }

  // 初期の有効/無効
  validate();

  //OKボタンを押したとき
  btnOK.addEventListener("click", () => {
    if (!validate()) return;
    const gridEl =
      typeof iconGrid !== "undefined" && iconGrid
        ? iconGrid
        : root.querySelector(".wire-menu-icons");
    const selBtn = gridEl?.querySelector(
      ".wire-menu-iconbtn." + WIRE_MENU_SELECTED
    );
    const ICON_LIST =
      typeof ICONS !== "undefined" && ICONS
        ? ICONS
        : typeof PRESET_ICONS !== "undefined"
        ? PRESET_ICONS
        : [];
    const fallback = ICON_LIST[selIconIdx];
    const applySrc =
      selBtn?.dataset?.applySrc ??
      (fallback && fallback.endsWith("blankicontitele.png")
        ? "./images/blankicon.png"
        : fallback);
    const effectiveLineType = lockedByParallel
      ? current.lineType || "none"
      : selType;
    const effectiveIconIndex = lockedByParallel
      ? Number.isInteger(current.iconIndex)
        ? current.iconIndex
        : -1
      : selIconIdx;
    closeMenu();
    onApply &&
      onApply({
        arrowType: selArrow,
        lineType: effectiveLineType,
        color: selColor,
        iconIndex: effectiveIconIndex,
        iconSrc: applySrc,
        duplexAction: selDuplexAction,
      });
  });

  // キャンセル（開いた時点の状態にロールバックして閉じる）
  btnCancel.addEventListener("click", () => {
    closeMenu();
    onCancel && onCancel();
  });

  // 線を削除
  btnDelete.addEventListener("click", () => {
    closeMenu();
    onDelete && onDelete();
  });

  // メニュー外クリックでキャンセル相当
  const onDocDowns = (e) => {
    const r = root.getBoundingClientRect();
    const inside =
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= r.top &&
      e.clientY <= r.bottom;
    if (inside || root.contains(e.target)) return;

    closeMenu();
    onCancel && onCancel();
  };
  document.addEventListener("mousedown", onDocDowns, true);

  function closeMenu() {
    if (root) root.classList.remove("is-confirm-open");
    document.removeEventListener("mousedown", onDocDowns, true);
    try {
      detachGlobalGuards && detachGlobalGuards();
    } catch {}
    if (root && root.isConnected) root.remove();
  }

  function attachGlobalCloseGuards(closeFn) {
    const onWindowBlur = () => closeFn();
    const onVisibility = () => {
      if (document.hidden) closeFn();
    };
    const onMouseLeave = (e) => {
      if (!e.relatedTarget && !e.toElement) closeFn();
    };

    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("mouseleave", onMouseLeave);

    // 解除関数を返す
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }

  // 有効/無効切り替え（線タイプが textかnone の時はアイコン無効）
  function updateIconGridState() {
    const disabled = selType === "text" || selType === "none";

    iconGrid.classList.toggle(WIRE_MENU_DISABLED, disabled);
    iconGrid.querySelectorAll(".wire-menu-iconbtn").forEach((btn) => {
      btn.classList.toggle(WIRE_MENU_DISABLED, disabled);
    });

    if (disabled) {
      iconGrid
        .querySelectorAll(".wire-menu-iconbtn")
        .forEach((n) => n.classList.remove("is-selected"));
    } else if (selIconIdx >= 0) {
      const btns = iconGrid.querySelectorAll(".wire-menu-iconbtn");
      if (btns[selIconIdx]) btns[selIconIdx].classList.add("is-selected");
    }
  }
  updateIconGridState();
  applyDisableForLineTypeAndIcons(lockedByParallel);

  // 位置決め
  document.body.appendChild(root);
  let detachGlobalGuards = null;
  root.style.visibility = "hidden";
  root.style.left = "0px";
  root.style.top = "0px";
  const r = root.getBoundingClientRect();
  const m = 8,
    vw = window.innerWidth,
    vh = window.innerHeight;
  const left = Math.min(vw - r.width - m, Math.max(m, anchorX));
  const top = Math.min(vh - r.height - m, Math.max(m, anchorY));
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.visibility = "visible";

  detachGlobalGuards = attachGlobalCloseGuards(closeMenu);

  // メニュー内で閉じない
  root.addEventListener("pointerdown", (e) => e.stopPropagation(), {
    capture: true,
  });
  root.addEventListener("mousedown", (e) => e.stopPropagation(), {
    capture: true,
  });

  // 外側クリック / Esc でキャンセル
  const onDocDown = (e) => {
    const r = root.getBoundingClientRect();
    const inside =
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= r.top &&
      e.clientY <= r.bottom;

    // メニューDOMに含まれる or 矩形内クリックなら外側扱いにしない
    if (inside || root.contains(e.target)) return;

    onCancel && onCancel();
    closeWireMenuGlobal();
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      onCancel && onCancel();
      closeWireMenuGlobal();
    }
  };
  // 参照をグローバルに保持して、後で確実に外せるようにする
  _menuRoot = root;
  _menuDocDown = onDocDown;
  _menuKey = onKey;
  setTimeout(
    () =>
      document.addEventListener("mousedown", _menuDocDown, { capture: true }),
    0
  );
  document.addEventListener("keydown", _menuKey);
}
