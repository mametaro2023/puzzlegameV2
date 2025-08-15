import * as C from './config.js'; // Cをインポートするのを忘れないように
import * as Utils from './utils.js';

export class AnimationManager {
    constructor() {
        // --- 盤面に関するアニメーション ---
        this.fallingBlocks = [];
        this.droppingXBlocks = [];
        this.particles = [];
        this.hardDropBlur = null;
        this.screenShake = null;
        this.attackEffect = null;

        // --- UIに関するアニメーション ---
        this.gaugeAnimation = null;
        this.usedItemAnimation = null;
        this.inventorySlideAnimation = null;
        this.nextMinoAnimation = null;
    }

    // 全てのアニメーションの状態を更新するメインメソッド
    update(now) {
        this.updateTimedEffect(this.attackEffect, now);
        this.updateTimedEffect(this.hardDropBlur, 150, now);
        this.updateTimedEffect(this.screenShake, now);
        this.updateTimedEffect(this.usedItemAnimation, now);
        this.updateTimedEffect(this.inventorySlideAnimation, now);
        
        this.updateParticles();
        this.updateGaugeAnimation(now);
        this.updateNextMinoAnimation(now);
    }

    // --- 各種アニメーションのトリガーメソッド ---
    triggerHardDropBlur(fromY, toY, x, cells) {
        this.hardDropBlur = {
            fromY, toY, x, cells,
            startTime: performance.now()
        };
    }
    triggerScreenShake(magnitude, duration) {
        this.screenShake = { startTime: performance.now(), magnitude, duration };
    }
    triggerAttackEffect() {
        this.attackEffect = { startTime: performance.now(), duration: 400 };
    }
    triggerItemUse(item) {
        const now = performance.now();
        this.usedItemAnimation = { item, startTime: now, duration: 300 };
        this.inventorySlideAnimation = { startTime: now, duration: 500 };
    }
    triggerNextMinoAnimation(slidingMino, fadingInMino) {
        this.nextMinoAnimation = {
            slidingMino, fadingInMino,
            startTime: performance.now(), duration: 250, progress: 0
        };
    }
    
    // --- ゲージアニメーション専用 ---
    setGauge(currentDisplayGauge, targetGauge) {
        if (this.gaugeAnimation) return; // アニメーション中は新しい命令を受け付けない
        this.startGaugeAnimation({
            startValue: currentDisplayGauge,
            endValue: targetGauge,
            duration: 500
        });
    }
    setGaugeAttackAnimation(currentDisplayGauge, finalGauge) {
        const step3 = { startValue: 0, endValue: finalGauge, duration: 300 };
        const step2 = { startValue: 100, endValue: 0, duration: 250, next: step3 };
        const step1 = { startValue: currentDisplayGauge, endValue: 100, duration: 150, next: step2 };
        this.startGaugeAnimation(step1);
    }
    setGaugeReset(currentDisplayGauge) {
        this.startGaugeAnimation({ startValue: currentDisplayGauge, endValue: 0, duration: 500 });
    }
    startGaugeAnimation(animData) {
        this.gaugeAnimation = {
            startTime: performance.now(),
            startValue: animData.startValue,
            endValue: animData.endValue,
            duration: animData.duration,
            next: animData.next || null,
        };
    }

    // --- 内部的な更新ヘルパーメソッド ---
    updateTimedEffect(effect, duration, now) {
        if (!effect) return;
        const d = duration || effect.duration;
        if (now - effect.startTime > d) {
            // effectオブジェクトのプロパティを直接nullにするのではなく、
            // effectの参照元をnullにする必要があるため、これはGameControllerで行う
        }
    }
    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.lifetime--;
            if (p.lifetime <= 0) this.particles.splice(i, 1);
        }
    }
    updateGaugeAnimation(now) {
        if (!this.gaugeAnimation) return;
        const anim = this.gaugeAnimation;
        const elapsedTime = now - anim.startTime;
        const progress = Math.min(elapsedTime / anim.duration, 1.0);
        
        // 表示用の値は直接更新せず、計算結果を返す
        anim.currentValue = anim.startValue + (anim.endValue - anim.startValue) * Utils.easeInOutCubic(progress);

        if (progress >= 1.0) {
            if (anim.next) {
                this.startGaugeAnimation(anim.next);
            } else {
                this.gaugeAnimation = null;
            }
        }
    }
    updateNextMinoAnimation(now) {
        if (!this.nextMinoAnimation) return;
        const anim = this.nextMinoAnimation;
        const elapsedTime = now - anim.startTime;
        const progress = Math.min(elapsedTime / anim.duration, 1.0);
        anim.progress = Utils.easeInOutCubic(progress);
        if (progress >= 1.0) {
            this.nextMinoAnimation = null;
        }
    }

    createParticles(r, c, colorIndex) {
        const count = 10;
        const color = C.COLORS[colorIndex];
        if (!color) return; // 不正なcolorIndexの場合は何もしない

        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: C.OFFX + c * C.BLOCK + C.BLOCK / 2,
                y: C.OFFY + r * C.BLOCK + C.BLOCK / 2,
                vx: (Math.random() - 0.5) * 5,
                vy: (Math.random() - 1.0) * 5,
                lifetime: Math.random() * 50 + 20,
                color: color,
                size: Math.random() * 3 + 2
            });
        }
    }
        
}