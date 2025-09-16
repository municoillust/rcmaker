/* Public Release Build
   Cleaned: 2025-09-16T13:01:51
   Notes: Debug logs removed; minor whitespace tidy. No behavior changes intended.
*/
'use strict';
// body直下（viewport基準）でコンテキストメニューを表示する共通関数
// 使い方: showContextMenu(menuEl, evt.clientX, evt.clientY)

export function showContextMenu(menuEl, clientX, clientY) {
  // ルートの確保（無ければ作成）
  let root = document.getElementById('ctxRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ctxRoot';
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2147483647', // 最前面
    });
    document.body.appendChild(root);
  }

  // メニューを body 直下へ移設し、viewport基準で表示
  root.appendChild(menuEl);
  Object.assign(menuEl.style, {
    position: 'fixed',
    display: 'block',
    pointerEvents: 'auto',
    left: '0px',
    top: '0px',
  });

  // はみ出し防止（右端/下端をクランプ、最小マージン8px）
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 8;
  const rect = menuEl.getBoundingClientRect();
  let x = Math.max(margin, Math.min(clientX, vw - rect.width - margin));
  let y = Math.max(margin, Math.min(clientY, vh - rect.height - margin));
  menuEl.style.left = `${x}px`;
  menuEl.style.top = `${y}px`;

  // 閉じ処理（outsideクリック、Esc、スクロール、リサイズ）
  const close = () => {
    menuEl.style.display = 'none';
    if (menuEl.parentNode === root) root.removeChild(menuEl);
    cleanup();
  };
  const onOutside = (ev) => { if (!menuEl.contains(ev.target)) close(); };
  const onKey     = (ev) => { if (ev.key === 'Escape') close(); };
  const onScroll  = ()  => { close(); };
  const onResize  = ()  => { close(); };
  function cleanup() {
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize, true);
  }
  // outside判定が自分のクリックに誤爆しないよう次フレームで登録
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize, true);

  return close; // 必要なら呼び出し元で明示クローズ可能
}

export function augmentBoxMenuItems(items, boxId) {
  try {
    const el = document.querySelector(`[data-id="${boxId}"]`);
    const hasImage = !!(el && el.querySelector('img, .cbox-image, .img, .image'));
    if (!hasImage) return items;

    items.push({
      label: '画像を変更…',
      onClick: async () => {
        const m = await import('./boxes.js');     // 循環回避のため動的import
        if (typeof m?.changeImageForBox === 'function') {
          await m.changeImageForBox(boxId);
        } else {
          alert('画像変更機能が見つかりませんでした（boxes.jsの実装をご確認ください）');
        }
      }
    });
    items.push({
      label: 'ボックスを全削除',
      onClick: async () => {
        const m = await import('./boxes.js');
        await m.removeAllBoxes?.();
      }
    });
    items.push({
      label: '線を全消去',
      onClick: async () => {
        const w = await import('./wires.js');
        w.clearAllWires?.();
      }
    });
    return items;
  } catch (e) {

    return items;
  }
}
