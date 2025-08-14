// js/game.js
import { globalAnimator, easeInOutCubic, easeOutCubic } from './anim.js';
import { effectsState, spawnCombo, spawnParticles, triggerShake, spawnItemPickupAnim, cubicSink } from './effects.js';
import { createRenderer } from './render.js';

const canvas = document.getElementById('game');
canvas.width = Math.min(1600, window.innerWidth - 80);
canvas.height = Math.min(1000, window.innerHeight - 80);

const renderer = createRenderer(canvas);

// ゲーム状態
const gameState = {
  canvas,
  ctx: canvas.getContext('2d'),
  field: {
    rows: 20,
    cols: 10,
    cellSize: 40,
    grid: createEmptyGrid(20, 10)
  },
  activeMino: null,
  gauge: { value: 0 },
  clearAnimations: [],
  combo: 0
};

let lastNow = performance.now();

// 初期化
function start() {
  bindInput();
  spawnTestBlocks();
  loop();
}

// メインループ
function loop(now = performance.now()) {
  const dt = now - lastNow;
  lastNow = now;

  globalAnimator.tick(now);

  // 簡易重力
  if (gameState.activeMino && !gameState.activeMino.hardDropping) {
    gameState.activeMino.offsetY = (gameState.activeMino.offsetY || 0) + dt * 0.0012;
  }

  renderer.draw(gameState);
  requestAnimationFrame(loop);
}

// 入力設定
function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') moveMino(-1, 0);
    if (e.code === 'ArrowRight') moveMino(1, 0);
    if (e.code === 'ArrowDown') moveMino(0, 1);
    if (e.code === 'ArrowUp') rotateMino();
    if (e.code === 'Space') {
      e.preventDefault();
      onHardDrop();
    }
    if (e.key === '1') useItem('+1');
    if (e.key === '2') useItem('+2');
    if (e.key === '-') useItem('-1');
    if (e.key === '=') useItem('-2');
    if (e.key === 'c') simulateClear();
  });
}

// ハードドロップ処理
function onHardDrop() {
  if (!gameState.activeMino) return;
  gameState.activeMino.hardDropping = true;

  const startTime = performance.now();
  const duration = 140;
  const origRows = gameState.activeMino.blocks.map(b => b.r);

  globalAnimator.add((now) => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = Math.min(1, Math.pow(t, 0.5) * 1.3);

    for (let i = 0; i < gameState.activeMino.blocks.length; i++) {
      const b = gameState.activeMino.blocks[i];
      b._visualOffsetY = eased * (gameState.field.rows - 1 - b.r) * gameState.field.cellSize;
    }

    if (t >= 1) {
      for (const b of gameState.activeMino.blocks) {
        const targetR = gameState.field.rows - 1 - (origRows[0] - b.r);
        gameState.field.grid[targetR][b.c] = { color: b.color };
      }
      gameState.activeMino = null;
      spawnParticles(canvas.width / 2, canvas.height / 2, '#fff', 12);
      gameState.combo = 1;
      spawnCombo(gameState.combo);
      return true;
    }
    return false;
  });

  setTimeout(() => {
    if (gameState.activeMino) gameState.activeMino.hardDropping = false;
  }, 300);
}

// アイテム使用
function useItem(itemType) {
  if (itemType === '+1' || itemType === '+2') {
    const strength = itemType === '+2' ? 14 : 9;
    triggerShake(strength, 360);

    const rect = canvas.getBoundingClientRect();
    spawnItemPickupAnim({
      fromX: rect.left + rect.width / 2,
      fromY: rect.top + rect.height / 2,
      toX: window.innerWidth - 60,
      toY: 60,
      label: itemType
    });

    gameState.gauge.value = Math.max(0, Math.min(1, gameState.gauge.value + (itemType === '+2' ? 0.18 : 0.1)));
  } else if (itemType === '-1' || itemType === '-2') {
    const sinkRows = itemType === '-2' ? 2 : 1;
    const rows = gameState.field.rows;
    const cols = gameState.field.cols;
    const cell = gameState.field.cellSize;
    const startTime = performance.now();
    const duration = 520;
    const animBlocks = [];

    for (let r = rows - sinkRows; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellObj = gameState.field.grid[r][c];
        if (cellObj) {
          animBlocks.push({ r, c, color: cellObj.color, startY: r * cell, endY: (r + rows) * cell });
          gameState.field.grid[r][c] = null;
        }
      }
    }

    globalAnimator.add((now) => {
      const t = Math.min(1, (now - startTime) / duration);
      for (const b of animBlocks) {
        b._y = cubicSink(b.startY, b.endY, t);
      }
      if (t >= 1) {
        spawnParticles(canvas.width / 2, canvas.height / 2 + 120, '#ff6b6b', 18);
        return true;
      }
      return false;
    });

    gameState.gauge.value = Math.max(0, gameState.gauge.value - (itemType === '-2' ? 0.25 : 0.12));
  }
}

// ブロック消去時アニメ
export function triggerBlockClear(clears) {
  const now = performance.now();
  for (const cl of clears) {
    gameState.clearAnimations.push({
      r: cl.r, c: cl.c, color: cl.color || '#fff',
      start: now, duration: 420 + Math.random() * 180
    });
    spawnParticles(
      canvas.width / 2 + (cl.c - gameState.field.cols / 2) * gameState.field.cellSize,
      canvas.height / 2 + (cl.r - gameState.field.rows / 2) * gameState.field.cellSize,
      cl.color || '#fff', 6
    );
  }
  setTimeout(() => {
    gameState.clearAnimations = gameState.clearAnimations.filter(a => (performance.now() - a.start) < a.duration);
  }, 900);
}

// ヘルパー
function createEmptyGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

function spawnTestBlocks() {
  const colors = ['#5eead4', '#60a5fa', '#f472b6', '#fca5a5', '#fde68a'];
  for (let r = 12; r < 20; r++) {
    for (let c = 3; c < 7; c++) {
      gameState.field.grid[r][c] = { color: colors[(r + c) % colors.length] };
    }
  }
  gameState.activeMino = {
    blocks: [
      { r: 2, c: 4, color: '#60a5fa' },
      { r: 3, c: 4, color: '#60a5fa' },
      { r: 3, c: 5, color: '#60a5fa' }
    ],
    hardDropping: false
  };
  gameState.gauge.value = 0.28;
}

function simulateClear() {
  const clears = [{ r: 15, c: 4, color: '#5eead4' }, { r: 16, c: 4, color: '#5eead4' }];
  triggerBlockClear(clears);
  gameState.combo += 1;
  spawnCombo(gameState.combo);
}

/********** ミノの定義と生成 **********/
const MINO_SHAPES = {
  I: [[1,1,1,1]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1]],
  S: [[0,1,1],[1,1,0]],
  Z: [[1,1,0],[0,1,1]],
  J: [[1,0,0],[1,1,1]],
  L: [[0,0,1],[1,1,1]]
};
const COLORS = ['#5eead4','#60a5fa','#f472b6','#fca5a5','#fde68a'];

function spawnMino(type=null){
  if (!type) {
    const keys = Object.keys(MINO_SHAPES);
    type = keys[Math.floor(Math.random()*keys.length)];
  }
  const shape = MINO_SHAPES[type];
  const color = COLORS[Math.floor(Math.random()*COLORS.length)];
  const blocks = [];
  for (let r=0;r<shape.length;r++){
    for (let c=0;c<shape[r].length;c++){
      if (shape[r][c]){
        blocks.push({r, c, color});
      }
    }
  }
  // スポーン位置は上部中央
  const spawnCol = Math.floor(gameState.field.cols/2) - Math.floor(shape[0].length/2);
  for (const b of blocks){
    b.r += 0;
    b.c += spawnCol;
  }
  gameState.activeMino = {
    blocks,
    type,
    rotation: 0,
    hardDropping: false
  };
}

/********** ミノ操作 **********/
function moveMino(dx, dy){
  if (!gameState.activeMino) return;
  if (canMove(dx, dy)){
    for (const b of gameState.activeMino.blocks){
      b.r += dy;
      b.c += dx;
    }
  } else if (dy > 0) {
    // 着地
    lockMino();
  }
}

function rotateMino(){
  if (!gameState.activeMino) return;
  const mino = gameState.activeMino;
  const pivot = mino.blocks[0]; // 単純に最初のブロックを回転中心に
  const newBlocks = mino.blocks.map(b=>{
    const dr = b.r - pivot.r;
    const dc = b.c - pivot.c;
    return {
      r: pivot.r - dc,
      c: pivot.c + dr,
      color: b.color
    };
  });
  if (canRotate(newBlocks)){
    mino.blocks = newBlocks;
  }
}

function canMove(dx, dy){
  const field = gameState.field;
  for (const b of gameState.activeMino.blocks){
    const nr = b.r + dy;
    const nc = b.c + dx;
    if (nr < 0 || nr >= field.rows || nc < 0 || nc >= field.cols) return false;
    if (field.grid[nr][nc]) return false;
  }
  return true;
}

function canRotate(blocks){
  const field = gameState.field;
  for (const b of blocks){
    if (b.r < 0 || b.r >= field.rows || b.c < 0 || b.c >= field.cols) return false;
    if (field.grid[b.r][b.c]) return false;
  }
  return true;
}

/********** ミノ着地処理 **********/
function lockMino(){
  for (const b of gameState.activeMino.blocks){
    gameState.field.grid[b.r][b.c] = { color: b.color };
  }
  gameState.activeMino = null;
  checkLines();
  spawnMino();
}

/********** ライン消去・コンボ **********/
function checkLines(){
  const fullRows = [];
  for (let r=0; r<gameState.field.rows; r++){
    if (gameState.field.grid[r].every(cell => cell !== null)){
      fullRows.push(r);
    }
  }
  if (fullRows.length > 0){
    // ブロック消去アニメ
    const clears = [];
    for (const r of fullRows){
      for (let c=0;c<gameState.field.cols;c++){
        clears.push({ r, c, color: gameState.field.grid[r][c].color });
        gameState.field.grid[r][c] = null;
      }
    }
    triggerBlockClear(clears);

    // 行を下に詰める
    for (const r of fullRows){
      for (let rr = r; rr > 0; rr--){
        gameState.field.grid[rr] = gameState.field.grid[rr-1].slice();
      }
      gameState.field.grid[0] = Array(gameState.field.cols).fill(null);
    }

    // コンボ数更新
    gameState.combo = (gameState.combo || 0) + 1;
    spawnCombo(gameState.combo);

    // ゲージ加算
    gameState.gauge.value = Math.min(1, gameState.gauge.value + 0.05 * fullRows.length);
  } else {
    // コンボリセット
    gameState.combo = 0;
  }
}

/********** 重力更新（ループで呼ばれる） **********/
let fallTimer = 0;
function updateGravity(dt){
  fallTimer += dt;
  const fallInterval = 500; // ms
  if (fallTimer >= fallInterval){
    fallTimer = 0;
    moveMino(0, 1);
  }
}



start();

