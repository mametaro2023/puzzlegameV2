// js/anim.js
// exported as module; 他モジュールはこのユーティリティを import して使います
export function easeInOutCubic(x){
  // 要求どおりの関数
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutCubic(x){
  return 1 - Math.pow(1 - x, 3);
}

export function easeOutBounce(x){
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) {
    return n1 * x * x;
  } else if (x < 2 / d1) {
    return n1 * (x -= 1.5 / d1) * x + 0.75;
  } else if (x < 2.5 / d1) {
    return n1 * (x -= 2.25 / d1) * x + 0.9375;
  } else {
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  }
}

/**
 * 小さなアニメ管理クラス（軽量）
 * 登録して requestAnimationFrame 内で tick を呼ぶだけで動く想定。
 */
export class Animator {
  constructor(){
    this.anims = new Set();
  }
  // fn: (t)->boolean  returns true if finished
  add(fn){
    this.anims.add(fn);
  }
  tick(now){
    for (const fn of Array.from(this.anims)){
      try{
        const done = fn(now);
        if (done) this.anims.delete(fn);
      }catch(e){
        console.error(e);
        this.anims.delete(fn);
      }
    }
  }
  clear(){ this.anims.clear(); }
}

export const globalAnimator = new Animator();
