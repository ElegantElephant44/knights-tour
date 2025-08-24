// Knight's Tour — Canvas (polished)
// - Canvas board, green valid moves, responsive + DPR aware
// - Visited cell style toggle: icon (fills cell) OR move number
// - Front overlay for WIN (full tour) and STUCK (no moves)
// - External knight.svg with safe fallback to inline SVG

// ---------- DOM ----------
const wrap = document.getElementById('wrap');
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const sizeSel = document.getElementById('size');
const styleSel = document.getElementById('visitedStyle');
const statusEl = document.getElementById('status');
const toastEl = document.getElementById('toast');
const undoBtn = document.getElementById('undoBtn');
const resetBtn = document.getElementById('resetBtn');
const newBtn = document.getElementById('newBtn');

// overlay
const overlay = document.getElementById('overlay');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const overlayClose = document.getElementById('overlayClose');
const overlayUndo = document.getElementById('overlayUndo');
const overlayNew = document.getElementById('overlayNew');

if (!ctx) throw new Error('2D context not available');
const DPR = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));
const keyOf = (r, c) => `${r},${c}`;

// ---------- State ----------
/** @typedef {{r:number,c:number}} Pos */
const state = {
  size: Number(localStorage.getItem('kt_size') ?? sizeSel.value),
  current: /** @type {Pos|null} */ (null),
  history: /** @type {Pos[]} */ ([]),
  visited: new Set(),                // keys "r,c"
  moveIndex: new Map(),              // key -> move number
  nextMoves: /** @type {string[]} */ ([]),
  visitedStyle: /** @type {'icon'|'number'} */ (localStorage.getItem('kt_style') ?? styleSel.value),
};

// sync initial controls
sizeSel.value = String(state.size);
styleSel.value = state.visitedStyle;

// ---------- Knight image ----------
const KNIGHT_URL = 'knight.svg'; // put your SVG next to index.html
const FALLBACK_SVG = ``;

let knightImg = null;
let knightReady = false;
let knightBitmap = null; // raster per cell size

function loadKnight() {
  return new Promise((resolve) => {
    const ext = new Image();
    ext.crossOrigin = 'anonymous';
    ext.decoding = 'async';
    ext.onload = () => {
      if (ext.naturalWidth > 0) { knightImg = ext; knightReady = true; resolve(true); }
      else fallback();
    };
    ext.onerror = fallback;
    ext.src = KNIGHT_URL;

    function fallback() {
      const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(FALLBACK_SVG);
      const fb = new Image();
      fb.decoding = 'async';
      fb.onload = () => { knightImg = fb; knightReady = fb.naturalWidth > 0; resolve(true); };
      fb.onerror = () => { knightReady = false; resolve(false); };
      fb.src = dataUrl;
    }
  });
}

function updateKnightCache() {
  if (!knightReady || !knightImg) return;
  const sizeCSS = canvas.clientWidth / state.size;
  const dpr = DPR();
  const w = Math.max(1, Math.round(sizeCSS * dpr));
  const off = document.createElement('canvas');
  off.width = w; off.height = w;
  const ictx = off.getContext('2d');
  if (!ictx) return;
  ictx.imageSmoothingEnabled = true;
  ictx.clearRect(0, 0, w, w);
  // Add 5% padding on all sides
  const pad = w * 0.05;
  try {
    ictx.drawImage(knightImg, pad, pad, w - 2 * pad, w - 2 * pad);
    knightBitmap = off;
  } catch {
    // ignore; fallback already handled
  }
}

// ---------- Logic ----------
function computeNextMoves(size, r, c, visited) {
  const deltas = [[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]];
  const res = [];
  for (const [dr, dc] of deltas) {
    const nr = r + dr, nc = c + dc;
    if (nr>=0 && nr<size && nc>=0 && nc<size) {
      const k = keyOf(nr,nc);
      if (!visited.has(k)) res.push(k);
    }
  }
  return res;
}

function showOverlay(kind, detail) {
  // kind: 'win' | 'stuck'
  if (kind === 'win') {
    modalTitle.textContent = '🎉 Full Tour!';
    modalDesc.textContent = `You visited all ${state.size * state.size} squares.`;
  } else {
    modalTitle.textContent = 'No Moves Left';
    modalDesc.textContent = `Stuck at ${detail.visited}/${detail.total}. Undo or start a new tour.`;
  }
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
}
function hideOverlay() {
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
}

// ---------- Rendering ----------
function render() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const n = state.size;
  const cell = w / n;

  ctx.clearRect(0,0,w,h);

  // bg + checkerboard
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h);
  const cLight = getCSS('--cell-light');
  const cDark = getCSS('--cell-dark');
  for (let r=0;r<n;r++) for (let c=0;c<n;c++) {
    ctx.fillStyle = ((r+c)%2===0) ? cLight : cDark;
    ctx.fillRect(c*cell, r*cell, cell, cell);
  }

  // grid
  ctx.strokeStyle = getCSS('--grid'); ctx.lineWidth = 1;
  for (let i=1;i<n;i++) {
    const p = i*cell + 0.5;
    ctx.beginPath(); ctx.moveTo(p,0); ctx.lineTo(p,h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,p); ctx.lineTo(w,p); ctx.stroke();
  }

  // visited cells: icon or number
  if (state.visited.size) {
    const entries = [...state.moveIndex.entries()];
    for (const [k, idx] of entries) {
      const [r,c] = k.split(',').map(Number);
      const x = c*cell, y = r*cell;

      if (state.visitedStyle === 'icon' && knightBitmap) {
        ctx.drawImage(knightBitmap, x, y, cell, cell);
      } else {
        // number style
        // light overlay to mark visited
        ctx.fillStyle = 'rgba(255,255,255,.65)';
        ctx.fillRect(x, y, cell, cell);
        // big centered number, pure black
        const fontPx = Math.max(14, Math.floor(cell * 0.55));
        ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, Segoe UI, Roboto`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 0;
        ctx.strokeStyle = 'transparent';
        ctx.fillStyle = '#000';
        const cx = x + cell/2, cy = y + cell/2 + (cell*0.01);
        ctx.fillText(String(idx), cx, cy);
      }
    }
  }

  // current outline
  if (state.current) {
    const {r,c} = state.current; const x = c*cell, y = r*cell;
    ctx.lineWidth = Math.max(2, cell*0.05);
    ctx.strokeStyle = '#3b46ff';
    ctx.strokeRect(x+1, y+1, cell-2, cell-2);
  }

  // valid next moves
  if (state.nextMoves.length) {
    const ok = getCSS('--ok');
    for (const k of state.nextMoves) {
      const [r,c] = k.split(',').map(Number);
      const cx = c*cell + cell/2, cy = r*cell + cell/2;
      const rad = cell*0.26;
      ctx.beginPath(); ctx.fillStyle = 'rgba(47,158,68,0.18)';
      ctx.arc(cx, cy, rad, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.lineWidth = Math.max(2, cell*0.045);
      ctx.strokeStyle = ok; ctx.arc(cx, cy, rad, 0, Math.PI*2); ctx.stroke();
    }
  }

  // buttons + status
  undoBtn.disabled = state.history.length === 0;
  resetBtn.disabled = state.history.length === 0;

  const total = n*n, visitedCount = state.visited.size;
  if (!state.current) {
    statusEl.textContent = 'Place the knight anywhere to begin.';
    hideToast();
  } else if (visitedCount === total) {
    statusEl.textContent = `Tour complete! ${visitedCount}/${total} squares visited.`;
    showOverlay('win', {});
  } else if (state.nextMoves.length === 0) {
    statusEl.textContent = `No moves available. Stuck at ${visitedCount}/${total}.`;
    showOverlay('stuck', { visited: visitedCount, total });
  } else {
    statusEl.textContent = `Visited ${visitedCount}/${total}. ${state.nextMoves.length} move${state.nextMoves.length>1?'s':''} available.`;
    hideToast();
  }
}

function getCSS(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

// ---------- Actions ----------
function reset(clearSize=false){
  state.current = null;
  state.history = [];
  state.visited.clear();
  state.moveIndex.clear();
  state.nextMoves = [];
  if (clearSize) {
    state.size = Number(sizeSel.value);
    localStorage.setItem('kt_size', String(state.size));
  }
  updateKnightCache();
  render();
}

function startNew(){ reset(true); }

function placeOrMove(r,c){
  const k = keyOf(r,c);
  if(!state.current){
    state.current = {r,c};
    state.history.push({r,c});
    state.visited.add(k);
    state.moveIndex.set(k, state.history.length); // 1-based
    state.nextMoves = computeNextMoves(state.size, r, c, state.visited);
    render();
    return;
  }
  if(!state.nextMoves.includes(k)){
    showToast('Invalid move.', true); setTimeout(hideToast, 600);
    return;
  }
  state.current = {r,c};
  state.history.push({r,c});
  state.visited.add(k);
  state.moveIndex.set(k, state.history.length);
  state.nextMoves = computeNextMoves(state.size, r, c, state.visited);
  render();
}

function undo(){
  if(state.history.length === 0) return;
  const last = state.history.pop();
  if(last){
    const k = keyOf(last.r,last.c);
    state.visited.delete(k);
    state.moveIndex.delete(k);
  }
  if(state.history.length === 0){
    state.current = null; state.nextMoves = [];
  }else{
    const cur = state.history[state.history.length-1];
    state.current = {r:cur.r, c:cur.c};
    state.nextMoves = computeNextMoves(state.size, cur.r, cur.c, state.visited);
  }
  hideOverlay();
  render();
}

// ---------- Events ----------
canvas.addEventListener('pointerdown', (ev)=>{
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  const cell = rect.width / state.size;
  const c = Math.max(0, Math.min(state.size-1, Math.floor(x / cell)));
  const r = Math.max(0, Math.min(state.size-1, Math.floor(y / cell)));
  placeOrMove(r,c);
}, {passive:true});

sizeSel.addEventListener('change', ()=>{ state.size = Number(sizeSel.value); startNew(); });
styleSel.addEventListener('change', ()=>{
  state.visitedStyle = styleSel.value;
  localStorage.setItem('kt_style', state.visitedStyle);
  render();
});
undoBtn.addEventListener('click', undo);
resetBtn.addEventListener('click', ()=> reset(false));
newBtn.addEventListener('click', ()=> startNew());

// overlay buttons
overlayClose.addEventListener('click', hideOverlay);
overlayUndo.addEventListener('click', ()=> { hideOverlay(); undo(); });
overlayNew.addEventListener('click', ()=> { hideOverlay(); startNew(); });
window.addEventListener('keydown', (e)=>{
  const key = e.key.toLowerCase();
  if ((e.ctrlKey||e.metaKey) && key==='z'){ e.preventDefault(); undo(); }
  else if (key==='z'){ undo(); }
  else if (key==='r'){ reset(false); }
  else if (key==='escape'){ hideOverlay(); }
});

// ---------- Resize ----------
const ro = new ResizeObserver(() => resizeCanvas());
if (wrap) ro.observe(wrap);
window.addEventListener('resize', resizeCanvas);

function resizeCanvas(){
  if(!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const dpr = DPR();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // CSS px coords
  updateKnightCache();
  render();
}

// ---------- Toast helpers ----------
function showToast(text, isDanger){ toastEl.textContent = text; toastEl.hidden = false; toastEl.classList.toggle('danger', !!isDanger); }
function hideToast(){ toastEl.hidden = true; toastEl.classList.remove('danger'); }

// ---------- Boot ----------
loadKnight().then(() => { resizeCanvas(); render(); });
