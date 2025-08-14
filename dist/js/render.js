// js/render.js
// 描画ロジック：モーションブラー、ブロック描画、ゲージ補間など
import { globalAnimator, easeInOutCubic } from './anim.js';
import { effectsState, tickParticles } from './effects.js';

/**
 * render.js は gameState を受け取り canvas に描画する責務を持つ
 *
 * 想定 gameState の一部:
 * {
 *   ctx, canvas,
 *   field { rows, cols, cellSize, grid[][] },
 *   activeMino { blocks: [ {r,c,color,x,y,hardDropping?} ], x,y, rotation },
 *   gauge: { value: 0..1 },
 *   displayGauge: { value: 0..1 } (視覚用補間値)
 * }
 */

export function createRenderer(canvas){
  const ctx = canvas.getContext('2d');
  const state = {
    canvas, ctx,
    lastFrame: performance.now(),
    // displayGauge をアニメで追従させるための値
    displayGauge: 0,
    gaugeAnim: null,
  };

  // gauge を animate させるためのヘルパー
  function animateGaugeTo(target, duration = 360){
    const start = performance.now();
    const from = state.displayGauge;
    globalAnimator.add((now)=>{
      const t = Math.min(1, (now - start) / duration);
      const eased = easeInOutCubic(t);
      state.displayGauge = from + (target - from) * eased;
      if (t >= 1) return true;
      return false;
    });
  }

  return {
    state,
    draw(gameState){
      const now = performance.now();
      const dt = now - state.lastFrame;
      state.lastFrame = now;
      const c = ctx;
      const canvasW = canvas.width;
      const canvasH = canvas.height;

      // clear
      c.clearRect(0,0,canvasW,canvasH);

      // 背景グラデと vignette
      const g = c.createLinearGradient(0,0,0,canvasH);
      g.addColorStop(0, 'rgba(255,255,255,0.01)');
      g.addColorStop(1, 'rgba(0,0,0,0.02)');
      c.fillStyle = g;
      c.fillRect(0,0,canvasW,canvasH);

      // 設定
      const cell = gameState.field.cellSize;
      const fieldW = gameState.field.cols * cell;
      const fieldH = gameState.field.rows * cell;
      const fieldX = (canvasW - fieldW) / 2;
      const fieldY = (canvasH - fieldH) / 2;

      // Apply field shake offset (effectsState) but do NOT apply to activeMino
      c.save();
      c.translate(effectsState.shakeOffset.x, effectsState.shakeOffset.y);

      // Draw field background panel
      c.fillStyle = 'rgba(12,12,13,0.6)';
      roundRect(c, fieldX - 12, fieldY - 12, fieldW + 24, fieldH + 24, 12);
      c.fill();

      // draw grid + blocks (固定ブロック)
      drawBlocksGrid(c, gameState.field, fieldX, fieldY);

      // draw clear animations/pulse handled externally via gameState.clearAnimations
      if (gameState.clearAnimations){
        for (const ca of gameState.clearAnimations){
          // ca has x,y,color,start,duration
          const t = Math.min(1, (now - ca.start) / ca.duration);
          const s = 1 + easeInOutCubic(t) * 0.8;
          c.save();
          c.globalAlpha = 1 - t;
          c.translate(fieldX + ca.c * cell + cell/2, fieldY + ca.r * cell + cell/2);
          c.scale(s, s);
          // glow
          c.fillStyle = ca.color;
          c.beginPath();
          c.rect(-cell/2, -cell/2, cell, cell);
          c.fill();
          c.restore();

          // spawn particles once (when t is small); game.js should call spawnParticles
        }
      }

      // draw particles that are tied to canvas
      tickParticles(now, c);

      c.restore(); // restore after field + shake

      // Draw active mino WITHOUT shake (so translate back to zero)
      drawActiveMino(c, gameState.activeMino, fieldX, fieldY, cell);

      // Motion blur for hard drop: if activeMino.hardDropping then draw trails
      if (gameState.activeMino && gameState.activeMino.hardDropping){
        drawHardDropTrail(c, gameState.activeMino, fieldX, fieldY, cell);
      }

      // Draw Gauge (top-left)
      drawGauge(c, 48, 48, 220, 18, state.displayGauge);

      // Update displayGauge when underlying gauge changes
      if (Math.abs(state.displayGauge - gameState.gauge.value) > 0.001){
        animateGaugeTo(gameState.gauge.value, 360);
      }
    }
  }
}

/********** 描画ユーティリティ **********/
function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

/** 固定ブロックの描画（シャドウ＋グロー） */
function drawBlocksGrid(ctx, field, offsetX, offsetY){
  const cell = field.cellSize;
  const rows = field.rows, cols = field.cols;
  ctx.save();
  // soft shadow under the panel
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  for (let r=0;r<rows;r++){
    for (let c=0;c<cols;c++){
      const cellObj = field.grid[r][c];
      if (!cellObj) continue;
      const x = offsetX + c * cell;
      const y = offsetY + r * cell;
      // block background
      ctx.save();
      // inset
      ctx.fillStyle = shadeColor(cellObj.color, -10);
      roundRect(ctx, x+2, y+2, cell-4, cell-4, 6);
      ctx.fill();
      // top gloss
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.rect(x+4, y+4, cell-8, (cell-8)/2);
      ctx.fill();
      ctx.restore();

      // optional overlay for special blocks
      if (cellObj.bad) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.beginPath();
        ctx.moveTo(x+6, y+6);
        ctx.lineTo(x+cell-6, y+cell-6);
        ctx.lineTo(x+6, y+cell-6);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

/** Active mino 描画: 落下中のブロックは motion blur と分離して描く */
function drawActiveMino(ctx, mino, offsetX, offsetY, cell){
  if (!mino) return;
  ctx.save();
  // draw each block normally
  for (const b of mino.blocks){
    const x = offsetX + b.c * cell;
    const y = offsetY + b.r * cell;
    drawBlock(ctx, x, y, cell, b.color, /*withShadow=*/true);
  }
  ctx.restore();
}

/** ハードドロップ時のトレイル（motion blur）: 複数のコピーを半透明で重ねる */
function drawHardDropTrail(ctx, mino, offsetX, offsetY, cell){
  // number of trail copies depends on drop speed or fixed
  const copies = 6;
  for (let i=1;i<=copies;i++){
    const alpha = 0.18 * (1 - i / (copies + 1));
    const blurOffset = i * 6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, blurOffset);
    for (const b of mino.blocks){
      const x = offsetX + b.c * cell;
      const y = offsetY + b.r * cell + i * 2; // slight offset
      // draw a flattened translucent block
      drawBlock(ctx, x, y, cell, b.color, false, /*gloss*/ true);
    }
    ctx.restore();
  }
}

/** 単一ブロック描画ユーティリティ */
function drawBlock(ctx, x, y, size, color, withShadow=true, gloss=false){
  ctx.save();
  if (withShadow){
    ctx.shadowColor = hexToRgba(color, 0.28);
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
  }
  ctx.fillStyle = color;
  roundRect(ctx, x + 3, y + 3, size - 6, size - 6, 6);
  ctx.fill();

  if (gloss){
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.rect(x + 6, y + 6, size - 12, (size - 12) / 2);
    ctx.fill();
  }
  ctx.restore();
}

/** シンプルなゲージ描画 */
function drawGauge(ctx, x, y, w, h, value){
  ctx.save();
  // background
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();

  // foreground (accent)
  const fillW = Math.max(2, w * Math.max(0, Math.min(1, value)));
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, 'rgba(80,227,194,0.95)');
  grad.addColorStop(1, 'rgba(80,200,220,0.9)');
  ctx.fillStyle = grad;
  roundRect(ctx, x+2, y+2, fillW-4, h-4, 6);
  ctx.fill();
  ctx.restore();
}

/********** 色ユーティリティ **********/
function shadeColor(hex, percent) {
  // simple shade: hex like #rrggbb
  const c = hex.replace('#','');
  const num = parseInt(c,16);
  const r = Math.max(0, Math.min(255, (num >> 16) + percent));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + percent));
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + percent));
  return `rgb(${r},${g},${b})`;
}
function hexToRgba(hex, a=1){
  const c = hex.replace('#','');
  const num = parseInt(c,16);
  const r = num >> 16;
  const g = (num >> 8) & 0xFF;
  const b = num & 0xFF;
  return `rgba(${r},${g},${b},${a})`;
}
