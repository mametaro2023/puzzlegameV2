// js/effects.js
// エフェクト管理（コンボ表示、パーティクル、フィールド振動、アイテム取得演出）
import { globalAnimator, easeInOutCubic, easeOutCubic, easeOutBounce } from './anim.js';

const comboEl = document.getElementById('combo-display');

export const effectsState = {
  shakeOffset: { x: 0, y: 0 }, // フィールド描画に乗せる揺れ
  shakeActive: false,
  particles: [], // 汎用パーティクル
  itemFlyAnims: [], // DOM フライアニメ
};

/** コンボ演出: 2コンボ以上なら中央に表示して装飾を増やす */
export function spawnCombo(count){
  if (count < 2) return;
  comboEl.classList.remove('hidden');
  comboEl.textContent = `${count} COMBO!`.toUpperCase();

  // 見た目のレベルを段階化
  const scaleBase = 1 + Math.min(0.8, (count - 2) * 0.12);
  const glow = Math.min(36, 12 + (count - 2) * 6);

  comboEl.style.color = `hsl(${120 - Math.min(90, count*6)}, 80%, 60%)`;
  comboEl.style.fontSize = `${48 * scaleBase}px`;
  comboEl.style.textShadow = `0 8px ${glow}px rgba(80,227,194,0.12), 0 4px 10px rgba(0,0,0,0.8)`;
  comboEl.style.transform = `translate(-50%,-50%) scale(${scaleBase})`;
  comboEl.style.opacity = '1';

  // アニメ: 拡大→縮小→フェードアウト
  const start = performance.now();
  const dur = 1000;
  globalAnimator.add((now)=>{
    const t = Math.min(1, (now - start) / dur);
    const eased = easeOutBounce(t);
    comboEl.style.transform = `translate(-50%,-50%) scale(${1 + 0.6 * eased})`;
    comboEl.style.opacity = `${1 - Math.pow(t, 1.2)}`;
    if (t >= 1){
      comboEl.classList.add('hidden');
      return true;
    }
    return false;
  });
}

/** パーティクル生成（消去時など） */
export function spawnParticles(x, y, color = '#ffffff', count = 10){
  for (let i=0;i<count;i++){
    effectsState.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 200,
      vy: (Math.random() - 1.5) * 200,
      life: 600 + Math.random()*400,
      born: performance.now(),
      size: 4 + Math.random()*6,
      color
    });
  }
}

/** パーティクルの tick と描画補助 */
export function tickParticles(now, ctx){
  const out = [];
  for (const p of effectsState.particles){
    const t = (now - p.born) / p.life;
    if (t >= 1) continue;
    // simple physics
    p.vy += 600 * (1/60) * 0.9;
    p.x += p.vx * (1/60);
    p.y += p.vy * (1/60);
    const alpha = 1 - t;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 - t), 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    out.push(p);
  }
  effectsState.particles = out;
}

/** フィールド全体を一瞬振動させる。落下中ミノは振動しないルールを守るため、ここでは効果値だけ設定 */
export function triggerShake(strength = 8, duration = 320){
  if (effectsState.shakeActive) return;
  effectsState.shakeActive = true;
  const started = performance.now();

  globalAnimator.add((now)=>{
    const t = Math.min(1, (now - started) / duration);
    // 強さはイージングで減衰
    const s = strength * (1 - easeOutCubic(t));
    // ランダム方向
    effectsState.shakeOffset.x = (Math.random() * 2 - 1) * s;
    effectsState.shakeOffset.y = (Math.random() * 2 - 1) * s;
    if (t >= 1){
      effectsState.shakeOffset.x = 0;
      effectsState.shakeOffset.y = 0;
      effectsState.shakeActive = false;
      return true;
    }
    return false;
  });
}

/**
 * アイテム取得時の演出（DOM要素を飛ばす / 小さいタスク用）
 * from: {x,y} canvas coords ; to: {x,y} DOM coords or canvas coords but we'll accept page coords
 */
export function spawnItemPickupAnim({fromX, fromY, toX, toY, label = '+1'}){
  // Create a temporary DOM element to fly
  const el = document.createElement('div');
  el.className = 'item-fly';
  el.textContent = label;
  Object.assign(el.style, {
    left: `${fromX}px`,
    top: `${fromY}px`,
    color: '#fff',
    fontWeight: '700',
    padding: '6px 8px',
    borderRadius: '8px',
    background: 'linear-gradient(90deg, rgba(80,227,194,0.14), rgba(80,227,194,0.06))',
    transform: 'translate(-50%,-50%) scale(1)',
    opacity: '1',
  });
  document.body.appendChild(el);

  const start = performance.now();
  const dur = 520;
  const sx = fromX, sy = fromY, tx = toX, ty = toY;
  globalAnimator.add((now)=>{
    const t = Math.min(1, (now - start) / dur);
    const eased = easeInOutCubic(t);
    const cx = sx + (tx - sx) * eased;
    const cy = sy + (ty - sy) * eased - 60 * Math.sin(eased * Math.PI); // arc
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.transform = `translate(-50%,-50%) scale(${1 - 0.25 * eased})`;
    el.style.opacity = `${1 - eased}`;
    if (t >= 1){
      el.remove();
      return true;
    }
    return false;
  });
}

/** -1/-2 による「下へ消える」移動関数（外でも使えるユーティリティ） */
/** given startY, endY, t (0..1) -> y */
export function cubicSink(startY, endY, t){
  // 既存の Cubic（easeOutCubic）を使って滑らかに
  const eased = easeOutCubic(t);
  return startY + (endY - startY) * eased;
}
