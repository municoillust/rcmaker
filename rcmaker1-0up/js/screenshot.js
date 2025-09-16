/* Public Release Build
   Cleaned: 2025-09-16T13:01:51
   Notes: Debug logs removed; minor whitespace tidy. No behavior changes intended.
*/
'use strict';
// screenshot.js
import * as htmlToImage from 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm';

// 対象エレメントをPNG Blobに変換（DPR考慮・CORS対策）
export async function captureAreaBlob(target, { pixelRatio = Math.max(1, window.devicePixelRatio || 1) } = {}) {
  // 外部画像がある場合は crossOrigin 指定での読み込みが必要です
  //（img要素側に crossorigin="anonymous" & 配信元に CORS ヘッダ）
  return await htmlToImage.toBlob(target, {
    pixelRatio,
    cacheBust: true,          // キャッシュバイパス
    backgroundColor: getComputedStyle(target).backgroundColor || 'transparent',
  });
}

export async function copyArea(target) {
  const blob = await captureAreaBlob(target).catch(() => null);
  if (!blob) throw new Error('スクリーンショットの生成に失敗しました（CORS/サイズの可能性）');
  if (!('clipboard' in navigator) || typeof ClipboardItem === 'undefined') {
    throw new Error('このブラウザは画像のクリップボード書き込みに未対応です');
  }
  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
  return blob; // 同じblobを保存にも使える
}

export async function downloadArea(target, filename = defaultName()) {
  const blob = await captureAreaBlob(target).catch(() => null);
  if (!blob) throw new Error('スクリーンショットの生成に失敗しました（CORS/サイズの可能性）');
  triggerDownload(blob, filename);
  return blob;
}

export function setupScreenshotButtons({ target, copyBtn, saveBtn, onToast }) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  const toast = (msg, ok = true) => onToast ? onToast(msg, ok) : alert(msg);

  if (copyBtn) copyBtn.addEventListener('click', async () => {
    copyBtn.disabled = true;
    try {
      const blob = await copyArea(el);
      // ついでに即保存する場合は以下を有効化：
      // triggerDownload(blob, defaultName());
      toast('ドラッグエリアの画像をクリップボードにコピーしました。');
    } catch (e) {
      toast(`コピーに失敗：${e.message}\n（代わりに保存をお試しください）`, false);
    } finally {
      copyBtn.disabled = false;
    }
  });

  if (saveBtn) saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      await downloadArea(el);
      toast('PNGを保存しました。');
    } catch (e) {
      toast(`保存に失敗：${e.message}`, false);
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function triggerDownload(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

function defaultName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `webgraph_${ts}.png`;
}
