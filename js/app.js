/**
 * Pixel Arter — app.js
 * Features: image crop selection, pixel art conversion,
 *           transparency editing, zoom/pan preview
 */

'use strict';

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
const state = {
  // Image
  imageLoaded:     false,
  originalImage:   null,    // HTMLImageElement
  offscreenCanvas: null,    // full-res offscreen canvas

  // Crop selection
  selection:  null,         // { x, y, w, h } in image coords
  dragging:   false,
  dragStart:  null,

  // Conversion result
  palette:    [],           // [{ rgb:[r,g,b], hex, count }]
  pixelIdx:   null,         // pixelIdx[y][x] = palette index
  outputText: '',
  converted:  false,

  // Transparency
  transparentSet: new Set(), // set of palette indices marked transparent

  // Zoom / pan
  zoom:  1,
  panX:  0,
  panY:  0,
  panning: false,
  panStart: null,
};

// ═══════════════════════════════════════════════════════════
//  DOM REFERENCES
// ═══════════════════════════════════════════════════════════
const el  = id => document.getElementById(id);

const DOM = {
  dropZone:       el('drop-zone'),
  browseBtn:      el('browse-btn'),
  fileInput:      el('file-input'),
  workspace:      el('workspace'),
  sourceImg:      el('source-img'),
  srcContainer:   el('source-container'),
  selCanvas:      el('selection-canvas'),
  previewCanvas:  el('preview-canvas'),
  previewWrap:    el('preview-canvas-wrap'),
  previewEmpty:   el('preview-empty'),
  previewBody:    el('preview-body'),
  convertBtn:     el('convert-btn'),
  saveImgBtn:     el('save-img-btn'),
  copyCodeBtn:    el('copy-code-btn'),
  resetBtn:       el('reset-btn'),
  outputSection:  el('output-section'),
  outputText:     el('output-text'),
  pxX:            el('px-x'),
  pxY:            el('px-y'),
  pxXNum:         el('px-x-num'),
  pxYNum:         el('px-y-num'),
  pxXVal:         el('px-x-val'),
  pxYVal:         el('px-y-val'),
  threshold:      el('threshold'),
  thresholdVal:   el('threshold-val'),
  maxColors:      el('max-colors'),
  maxColorsVal:   el('max-colors-val'),
  statusText:     el('status-text'),
  statusIcon:     el('status-icon'),
  progressWrap:   el('progress-wrap'),
  progressFill:   el('progress-fill'),
  paletteEl:      el('palette-container'),
  colorCount:     el('color-count'),
  selDim:         el('sel-dim'),
  previewMeta:    el('preview-meta'),
  zoomCtrl:       el('zoom-ctrl'),
  zoomOutBtn:     el('zoom-out-btn'),
  zoomInBtn:      el('zoom-in-btn'),
  zoomFitBtn:     el('zoom-fit-btn'),
  zoomVal:        el('zoom-val'),
  toast:          el('toast'),
  toastMsg:       el('toast-msg'),
};

const selCtx     = DOM.selCanvas.getContext('2d');
const previewCtx = DOM.previewCanvas.getContext('2d');

// ═══════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function colorDist(a, b) {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

let toastTimer = null;
function toast(msg, type = 'default', duration = 2800) {
  DOM.toastMsg.textContent = msg;
  DOM.toast.className = type !== 'default' ? `toast-${type}` : '';
  DOM.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => DOM.toast.classList.remove('show'), duration);
}

function setStatus(text, icon = '·') {
  DOM.statusText.textContent = text;
  DOM.statusIcon.textContent = icon;
}

function setStep(n) {
  for (let i = 1; i <= 5; i++) {
    const s = el(`step-${i}`);
    s.classList.remove('active', 'done');
    if (i < n)       s.classList.add('done');
    else if (i === n) s.classList.add('active');
  }
}

function tick(ms = 0) {
  return new Promise(r => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════
//  IMAGE LOADING
// ═══════════════════════════════════════════════════════════

function loadFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    toast('画像ファイルを選択してください', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload  = e => loadDataURL(e.target.result);
  reader.onerror = () => toast('ファイルの読み込みに失敗しました', 'error');
  reader.readAsDataURL(file);
}

function loadDataURL(src) {
  const img = new Image();
  img.onload = () => {
    state.originalImage = img;
    state.selection     = null;
    state.converted     = false;

    const oc = document.createElement('canvas');
    oc.width  = img.naturalWidth;
    oc.height = img.naturalHeight;
    oc.getContext('2d').drawImage(img, 0, 0);
    state.offscreenCanvas = oc;

    DOM.sourceImg.src = src;
    DOM.sourceImg.onload = onImageReady;
  };
  img.onerror = () => toast('画像の読み込みに失敗しました', 'error');
  img.src = src;
}

function onImageReady() {
  DOM.dropZone.style.display = 'none';
  DOM.workspace.classList.add('visible');
  DOM.workspace.removeAttribute('aria-hidden');

  DOM.convertBtn.disabled = false;
  DOM.outputSection.style.display = 'none';
  DOM.previewCanvas.style.display = 'none';
  DOM.previewWrap.style.display   = 'none';
  DOM.previewEmpty.style.display  = 'flex';
  DOM.zoomCtrl.style.display      = 'none';
  DOM.paletteEl.innerHTML = '<span class="palette-empty">変換後に表示</span>';
  DOM.colorCount.textContent  = '';
  DOM.previewMeta.textContent = '';

  updateSelDim();
  setupSelectionCanvas();
  state.imageLoaded = true;
  setStep(2);
  setStatus('ドラッグで切り抜き範囲を選択（省略すると画像全体を使用）');
}

// ═══════════════════════════════════════════════════════════
//  DROP ZONE
// ═══════════════════════════════════════════════════════════

DOM.dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  DOM.dropZone.classList.add('drag-over');
});

DOM.dropZone.addEventListener('dragleave', e => {
  if (!DOM.dropZone.contains(e.relatedTarget))
    DOM.dropZone.classList.remove('drag-over');
});

DOM.dropZone.addEventListener('drop', e => {
  e.preventDefault();
  DOM.dropZone.classList.remove('drag-over');
  loadFile(e.dataTransfer.files[0]);
});

DOM.dropZone.addEventListener('click', e => {
  if (DOM.browseBtn.contains(e.target) || e.target === DOM.browseBtn) return;
  DOM.fileInput.click();
});

DOM.browseBtn.addEventListener('click', e => {
  e.stopPropagation();
  DOM.fileInput.click();
});

DOM.fileInput.addEventListener('change', e => {
  loadFile(e.target.files[0]);
  DOM.fileInput.value = '';
});

window.addEventListener('paste', e => {
  const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'));
  if (item) loadFile(item.getAsFile());
});

// ═══════════════════════════════════════════════════════════
//  CROP SELECTION
// ═══════════════════════════════════════════════════════════

function setupSelectionCanvas() {
  const rect = DOM.sourceImg.getBoundingClientRect();
  DOM.selCanvas.width  = rect.width;
  DOM.selCanvas.height = rect.height;
  redrawSelection();
}

function toImgCoords(clientX, clientY) {
  const rect = DOM.sourceImg.getBoundingClientRect();
  const img  = state.originalImage;
  return {
    x: Math.round(Math.max(0, Math.min(img.naturalWidth,  (clientX - rect.left) * (img.naturalWidth  / rect.width)))),
    y: Math.round(Math.max(0, Math.min(img.naturalHeight, (clientY - rect.top)  * (img.naturalHeight / rect.height)))),
  };
}

function toCanvasCoords(imgX, imgY) {
  const rect = DOM.sourceImg.getBoundingClientRect();
  const img  = state.originalImage;
  return {
    x: imgX * (rect.width  / img.naturalWidth),
    y: imgY * (rect.height / img.naturalHeight),
  };
}

function redrawSelection() {
  selCtx.clearRect(0, 0, DOM.selCanvas.width, DOM.selCanvas.height);
  if (!state.selection || state.selection.w < 1 || state.selection.h < 1) return;

  const { x, y, w, h } = state.selection;
  const tl = toCanvasCoords(x, y);
  const br = toCanvasCoords(x + w, y + h);
  const cw = br.x - tl.x, ch = br.y - tl.y;

  selCtx.fillStyle = 'rgba(0,0,0,0.48)';
  selCtx.fillRect(0, 0, DOM.selCanvas.width, DOM.selCanvas.height);
  selCtx.clearRect(tl.x, tl.y, cw, ch);

  // White dashed marquee
  selCtx.strokeStyle = 'rgba(255,255,255,0.85)';
  selCtx.lineWidth   = 1;
  selCtx.setLineDash([5, 3]);
  selCtx.strokeRect(tl.x + 0.5, tl.y + 0.5, cw - 1, ch - 1);

  // Accent inner line
  selCtx.strokeStyle = 'rgba(229,48,0,0.75)';
  selCtx.lineWidth   = 1;
  selCtx.setLineDash([]);
  selCtx.strokeRect(tl.x + 2, tl.y + 2, cw - 4, ch - 4);

  // Corner squares (accent)
  const hs = 5;
  selCtx.fillStyle = '#e53000';
  [[tl.x, tl.y], [br.x, tl.y], [tl.x, br.y], [br.x, br.y]].forEach(([cx, cy]) => {
    selCtx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
  });
}

function updateSelDim() {
  const img = state.originalImage;
  if (!img) { DOM.selDim.textContent = '—'; return; }
  const sel = state.selection;
  DOM.selDim.textContent = (sel && sel.w > 3 && sel.h > 3)
    ? `${sel.w} × ${sel.h}`
    : `${img.naturalWidth} × ${img.naturalHeight}`;
}

// Crop drag
DOM.srcContainer.addEventListener('mousedown', e => {
  if (!state.imageLoaded) return;
  e.preventDefault();
  const pos = toImgCoords(e.clientX, e.clientY);
  state.dragging  = true;
  state.dragStart = pos;
  state.selection = { x: pos.x, y: pos.y, w: 0, h: 0 };
  setupSelectionCanvas();
});

// ═══════════════════════════════════════════════════════════
//  SHARED MOUSE MOVE / UP
// ═══════════════════════════════════════════════════════════

window.addEventListener('mousemove', e => {
  // Crop drag
  if (state.dragging) {
    const pos = toImgCoords(e.clientX, e.clientY);
    state.selection = {
      x: Math.min(state.dragStart.x, pos.x),
      y: Math.min(state.dragStart.y, pos.y),
      w: Math.abs(pos.x - state.dragStart.x),
      h: Math.abs(pos.y - state.dragStart.y),
    };
    redrawSelection();
    updateSelDim();
  }

  // Preview pan
  if (state.panning) {
    const dx = e.clientX - state.panStart.clientX;
    const dy = e.clientY - state.panStart.clientY;
    state.panX = state.panStart.panX + dx;
    state.panY = state.panStart.panY + dy;
    applyViewTransform();
  }
});

window.addEventListener('mouseup', () => {
  // Finish crop drag
  if (state.dragging) {
    state.dragging = false;
    const sel = state.selection;
    if (!sel || sel.w < 4 || sel.h < 4) {
      state.selection = null;
      setupSelectionCanvas();
      updateSelDim();
      setStatus('選択解除 — 画像全体を使用します');
    } else {
      updateSelDim();
      setStatus(`選択: ${sel.w} × ${sel.h} px — グリッドサイズを設定して変換`);
      setStep(3);
    }
  }

  // Finish pan
  if (state.panning) {
    state.panning = false;
  }
});

// Resize observer for crop canvas
const ro = new ResizeObserver(() => { if (state.imageLoaded) setupSelectionCanvas(); });
ro.observe(DOM.sourceImg);

// ═══════════════════════════════════════════════════════════
//  SLIDER / INPUT SYNC
// ═══════════════════════════════════════════════════════════

function syncRange(range, numInput, valLabel, min, max) {
  range.addEventListener('input', () => {
    valLabel.textContent = range.value;
    numInput.value = range.value;
  });
  numInput.addEventListener('input', () => {
    const v = Math.max(min, Math.min(max, parseInt(numInput.value) || min));
    range.value = v;
    valLabel.textContent = v;
  });
}

syncRange(DOM.pxX, DOM.pxXNum, DOM.pxXVal, 2, 128);
syncRange(DOM.pxY, DOM.pxYNum, DOM.pxYVal, 2, 128);
DOM.threshold.addEventListener('input', () => { DOM.thresholdVal.textContent = DOM.threshold.value; });
DOM.maxColors.addEventListener('input', () => { DOM.maxColorsVal.textContent = DOM.maxColors.value; });

// ═══════════════════════════════════════════════════════════
//  ZOOM / PAN
// ═══════════════════════════════════════════════════════════

const ZOOM_MIN  = 0.25;
const ZOOM_MAX  = 32;
const ZOOM_STEP = 1.5;

function applyViewTransform() {
  DOM.previewCanvas.style.transform =
    `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  DOM.zoomVal.textContent = state.zoom === 1 ? 'FIT' : `${state.zoom.toFixed(state.zoom < 2 ? 1 : 0)}×`;
}

function zoomBy(factor, resetPan = false) {
  state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom * factor));
  if (resetPan) { state.panX = 0; state.panY = 0; }
  applyViewTransform();
}

function resetZoom() {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  applyViewTransform();
}

DOM.zoomInBtn.addEventListener('click',  () => zoomBy(ZOOM_STEP));
DOM.zoomOutBtn.addEventListener('click', () => zoomBy(1 / ZOOM_STEP));
DOM.zoomFitBtn.addEventListener('click', resetZoom);

// Mouse wheel zoom
DOM.previewBody.addEventListener('wheel', e => {
  if (!state.converted) return;
  e.preventDefault();
  const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  zoomBy(factor);
}, { passive: false });

// Drag to pan on preview
DOM.previewCanvas.addEventListener('mousedown', e => {
  if (!state.converted) return;
  e.preventDefault();
  e.stopPropagation();
  state.panning  = true;
  state.panStart = { clientX: e.clientX, clientY: e.clientY, panX: state.panX, panY: state.panY };
});

// ═══════════════════════════════════════════════════════════
//  PREVIEW REDRAW  (called after transparency changes)
// ═══════════════════════════════════════════════════════════

function redrawPreview() {
  if (!state.converted) return;

  const numX = state.pixelIdx[0].length;
  const numY = state.pixelIdx.length;

  DOM.previewCanvas.width  = numX;
  DOM.previewCanvas.height = numY;
  previewCtx.clearRect(0, 0, numX, numY);

  const imgData = previewCtx.createImageData(numX, numY);
  for (let y = 0; y < numY; y++) {
    for (let x = 0; x < numX; x++) {
      const pi    = state.pixelIdx[y][x];
      const [r, g, b] = state.palette[pi].rgb;
      const alpha = state.transparentSet.has(pi) ? 0 : 255;
      const i     = (y * numX + x) * 4;
      imgData.data[i]     = r;
      imgData.data[i + 1] = g;
      imgData.data[i + 2] = b;
      imgData.data[i + 3] = alpha;
    }
  }
  previewCtx.putImageData(imgData, 0, 0);
  updateOutputText();
}

function updateOutputText() {
  let out = '';
  state.palette.forEach((c, i) => {
    const t = state.transparentSet.has(i) ? ' T' : '';
    out += `${i.toString(16)}=${c.rgb[0]};${c.rgb[1]};${c.rgb[2]}${t}\n`;
  });
  out += '\n';
  const numY = state.pixelIdx.length;
  const numX = state.pixelIdx[0].length;
  for (let y = 0; y < numY; y++) {
    for (let x = 0; x < numX; x++) out += state.pixelIdx[y][x].toString(16);
    out += '\n';
  }
  state.outputText = out;
  DOM.outputText.textContent = out;
}

// ═══════════════════════════════════════════════════════════
//  CONVERSION
// ═══════════════════════════════════════════════════════════

async function convert() {
  if (!state.imageLoaded) return;

  const numX   = parseInt(DOM.pxX.value);
  const numY   = parseInt(DOM.pxY.value);
  const thresh = parseFloat(DOM.threshold.value);
  const maxC   = parseInt(DOM.maxColors.value);

  DOM.convertBtn.disabled = true;
  DOM.progressWrap.classList.add('visible');
  DOM.progressFill.style.width = '0%';
  setStatus('変換中...', '→');
  setStep(4);

  // Reset transparency and zoom for fresh conversion
  state.transparentSet = new Set();
  resetZoom();

  await tick(20);

  try {
    // Determine source region
    const oc  = state.offscreenCanvas;
    let sx = 0, sy = 0, sw = oc.width, sh = oc.height;
    const sel = state.selection;
    if (sel && sel.w > 3 && sel.h > 3) {
      sx = sel.x; sy = sel.y; sw = sel.w; sh = sel.h;
    }

    const src    = document.createElement('canvas');
    src.width    = sw;
    src.height   = sh;
    const srcCtx = src.getContext('2d');
    srcCtx.drawImage(oc, sx, sy, sw, sh, 0, 0, sw, sh);

    const cellW = sw / numX;
    const cellH = sh / numY;

    // ─ Sample dominant color per cell ─────────────────────
    const rawColors = [];

    for (let y = 0; y < numY; y++) {
      rawColors.push([]);
      for (let x = 0; x < numX; x++) {
        const bx = Math.max(1, Math.floor(cellW * 0.05));
        const by = Math.max(1, Math.floor(cellH * 0.05));
        const rx = Math.floor(x * cellW) + bx;
        const ry = Math.floor(y * cellH) + by;
        const rw = Math.max(1, Math.floor(cellW) - bx * 2);
        const rh = Math.max(1, Math.floor(cellH) - by * 2);

        const data = srcCtx.getImageData(rx, ry, rw, rh).data;
        const freq = {};
        for (let i = 0; i < data.length; i += 4) {
          const key = `${data[i]},${data[i+1]},${data[i+2]}`;
          freq[key] = (freq[key] || 0) + 1;
        }
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
        rawColors[y].push(top.split(',').map(Number));
      }
      DOM.progressFill.style.width = `${(y + 1) / numY * 70}%`;
      if (y % 8 === 0) await tick();
    }

    // ─ Build palette with color merging ───────────────────
    DOM.progressFill.style.width = '78%';
    await tick();

    const palette  = [];
    const pixelIdx = Array.from({ length: numY }, () => new Array(numX).fill(0));

    for (let y = 0; y < numY; y++) {
      for (let x = 0; x < numX; x++) {
        const c = rawColors[y][x];
        let found = -1;

        for (let pi = 0; pi < palette.length; pi++) {
          if (colorDist(c, palette[pi].rgb) < thresh) { found = pi; break; }
        }

        if (found === -1 && palette.length < maxC) {
          found = palette.length;
          palette.push({ rgb: c, hex: rgbToHex(...c), count: 0 });
        } else if (found === -1) {
          let minD = Infinity;
          for (let pi = 0; pi < palette.length; pi++) {
            const d = colorDist(c, palette[pi].rgb);
            if (d < minD) { minD = d; found = pi; }
          }
        }

        palette[found].count++;
        pixelIdx[y][x] = found;
      }
    }

    state.palette   = palette;
    state.pixelIdx  = pixelIdx;
    state.converted = true;

    // ─ Render preview ─────────────────────────────────────
    DOM.progressFill.style.width = '90%';
    await tick();

    DOM.previewCanvas.style.display = 'block';
    DOM.previewWrap.style.display   = '';
    DOM.previewEmpty.style.display  = 'none';

    redrawPreview(); // renders imgData with alpha

    DOM.previewMeta.textContent = `${numX}×${numY} / ${palette.length}色`;

    // ─ Palette swatches ───────────────────────────────────
    DOM.paletteEl.innerHTML = '';
    palette.forEach((c, i) => {
      const sw = document.createElement('div');
      sw.className = 'swatch';
      sw.style.background = c.hex;
      sw.setAttribute('data-tip', `${c.hex}  ×${c.count}`);
      sw.setAttribute('title', `${c.hex} — ${c.count}ピクセル  クリックで透明切り替え`);

      sw.addEventListener('click', () => {
        if (state.transparentSet.has(i)) {
          state.transparentSet.delete(i);
          sw.classList.remove('is-transparent');
          sw.setAttribute('data-tip', `${c.hex}  ×${c.count}`);
        } else {
          state.transparentSet.add(i);
          sw.classList.add('is-transparent');
          sw.setAttribute('data-tip', `${c.hex}  ×${c.count}  [透明]`);
        }
        redrawPreview();
      });

      DOM.paletteEl.appendChild(sw);
    });
    DOM.colorCount.textContent = `${palette.length} 色`;

    // ─ Done ───────────────────────────────────────────────
    DOM.progressFill.style.width = '100%';
    DOM.outputSection.style.display = '';
    DOM.zoomCtrl.style.display = '';
    setStep(5);
    setStatus(`完了 — ${numX}×${numY}px / ${palette.length}色`, '✓');
    toast(`変換完了  ${numX}×${numY}px · ${palette.length}色`, 'ok');

    setTimeout(() => {
      DOM.progressWrap.classList.remove('visible');
      DOM.progressFill.style.width = '0%';
    }, 700);

  } catch (err) {
    console.error(err);
    setStatus('エラーが発生しました: ' + err.message, '!');
    toast('変換に失敗しました', 'error');
    DOM.progressWrap.classList.remove('visible');
  } finally {
    DOM.convertBtn.disabled = false;
  }
}

DOM.convertBtn.addEventListener('click', convert);

// ═══════════════════════════════════════════════════════════
//  SAVE / COPY / RESET
// ═══════════════════════════════════════════════════════════

DOM.saveImgBtn.addEventListener('click', () => {
  if (!state.converted) return;

  // Scale up for a nice-sized PNG, preserve transparency
  const src   = DOM.previewCanvas;
  const scale = Math.max(1, Math.floor(512 / Math.max(src.width, src.height)));
  const out   = document.createElement('canvas');
  out.width   = src.width  * scale;
  out.height  = src.height * scale;
  const ctx   = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0, out.width, out.height);

  const a    = document.createElement('a');
  a.download = 'pixel_art.png';
  a.href     = out.toDataURL('image/png');
  a.click();
  toast('画像を保存しました', 'ok');
});

DOM.copyCodeBtn.addEventListener('click', () => {
  if (!state.outputText) return;
  navigator.clipboard.writeText(state.outputText)
    .then(()  => toast('カラーコードをコピーしました', 'ok'))
    .catch(()  => toast('コピーに失敗しました', 'error'));
});

DOM.resetBtn.addEventListener('click', reset);

function reset() {
  state.imageLoaded     = false;
  state.originalImage   = null;
  state.offscreenCanvas = null;
  state.selection       = null;
  state.converted       = false;
  state.transparentSet  = new Set();
  state.zoom = 1; state.panX = 0; state.panY = 0;

  DOM.dropZone.style.display = '';
  DOM.workspace.classList.remove('visible');
  DOM.workspace.setAttribute('aria-hidden', 'true');
  DOM.outputSection.style.display  = 'none';
  DOM.zoomCtrl.style.display       = 'none';
  DOM.previewWrap.style.display    = 'none';
  DOM.fileInput.value = '';
  DOM.paletteEl.innerHTML = '<span class="palette-empty">変換後に表示</span>';
  DOM.colorCount.textContent  = '';
  DOM.previewMeta.textContent = '';
  setStep(1);
  setStatus('左パネルをドラッグして切り抜き範囲を選択（省略すると画像全体を使用）');
}

// ═══════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════

window.addEventListener('keydown', e => {
  // ⌘/Ctrl + Enter — convert
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!DOM.convertBtn.disabled) convert();
  }
  // Escape — clear selection
  if (e.key === 'Escape' && state.imageLoaded) {
    state.selection = null;
    setupSelectionCanvas();
    updateSelDim();
    setStatus('選択解除 — 画像全体を使用します');
  }
  // +/− for zoom when preview is shown
  if (state.converted) {
    if (e.key === '=' || e.key === '+') zoomBy(ZOOM_STEP);
    if (e.key === '-' || e.key === '_') zoomBy(1 / ZOOM_STEP);
    if (e.key === '0')                  resetZoom();
  }
});
