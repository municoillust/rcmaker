/* Public Release Build
   Cleaned: 2025-09-16T13:01:51
   Notes: Debug logs removed; minor whitespace tidy. No behavior changes intended.
*/
'use strict';
// manual-popup.js
// 画面内ポップアップで manual.txt を表示する（ドラッグエリア右側に配置）

(function () {
  function setupManualPopup({
    button = "#btnHelpToggle", // 使い方説明ボタン
    popup = "#helpPopup", // ポップアップ全体
    content = "#helpContent", // 本文差し込み先（pre-wrap推奨）
    area = "#canvas", // ドラッグエリア
    manualUrl = "./manual.txt", // 説明テキストの場所
    reloadEveryOpen = false, // 開くたびに再読込したいなら true
  } = {}) {
    const btn = document.querySelector(button);
    const pop = document.querySelector(popup);
    const body = document.querySelector(content);
    const areaEl = document.querySelector(area);
    const closeBtn = pop?.querySelector(".help-close");

    if (!btn || !pop || !body || !areaEl) return; // 必須要素がなければ何もしない

    let manualLoaded = false;
    let onDocDown, onKey, onResize, onScroll;

    function positionHelp() {
      // ドラッグエリアの右側に配置（余白16px）
      const r = areaEl.getBoundingClientRect();
      const margin = 16;
      const availW = Math.max(
        260,
        window.innerWidth - (r.right + margin) - margin
      );
      const width = Math.min(520, availW);
      pop.style.width = width + "px";

      let left = r.right + margin;
      let top = r.top;

      if (left + width + margin > window.innerWidth) {
        left = Math.max(margin, window.innerWidth - width - margin);
      }
      const maxTop = window.innerHeight - pop.offsetHeight - margin;
      if (top > maxTop) top = Math.max(margin, maxTop);

      pop.style.left = left + "px";
      pop.style.top = top + "px";
    }

    async function fillManual() {
      if (manualLoaded && !reloadEveryOpen) return;
      body.textContent = "読み込み中…";
      try {
        const res = await fetch(manualUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        body.textContent = txt; // テキストとして安全に差し込み
        manualLoaded = true;
        // 高さが変わるので再配置
        requestAnimationFrame(positionHelp);
      } catch (e) {
        console.error("manual.txt 読み込み失敗:", e);
        body.innerHTML =
          '<p style="color:#b91c1c">manual.txt の読み込みに失敗しました。</p>';
      }
    }

    function bindClosers() {
      onDocDown = (e) => {
        if (!pop.contains(e.target)) close();
      };
      onKey = (e) => {
        if (e.key === "Escape") close();
      };
      onResize = () => {
        if (pop.classList.contains("is-open")) positionHelp();
      };
      onScroll = () => {
        if (pop.classList.contains("is-open")) positionHelp();
      };
      document.addEventListener("mousedown", onDocDown);
      document.addEventListener("touchstart", onDocDown, { passive: true });
      window.addEventListener("keydown", onKey);
      window.addEventListener("resize", onResize);
      window.addEventListener("scroll", onScroll, true);
    }
    function unbindClosers() {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("touchstart", onDocDown, { passive: true });
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      // P29: ヘルプボタンクリック時は枠外クリック扱いにさせない
      btn.addEventListener("mousedown", (e) => e.stopPropagation());
      btn.addEventListener("touchstart", (e) => e.stopPropagation(), {
        passive: true,
      });
    }

    function open() {
      if (pop.classList.contains("is-open")) return;
      pop.classList.add("is-open");
      pop.setAttribute("aria-hidden", "false");
      positionHelp();
      bindClosers();
      fillManual();
    }
    function close() {
      pop.classList.remove("is-open");
      pop.setAttribute("aria-hidden", "true");
      unbindClosers();
    }

    // トグルと×ボタン
    btn.addEventListener("click", () => {
      pop.classList.contains("is-open") ? close() : open();
    });
    closeBtn && closeBtn.addEventListener("click", close);

    // 公開API（必要なら外からも開閉できる）
    pop.dataset.manualReady = "1";
    return {
      open,
      close,
      position: positionHelp,
      reload: () => {
        manualLoaded = false;
      },
    };
  }

  // グローバルに公開（HTML側から setupManualPopup(...) を呼び出す）
  window.setupManualPopup = setupManualPopup;
})();
