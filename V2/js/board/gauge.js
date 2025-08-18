import * as Utils from '../utils.js';

export function startGaugeAnimation(animData) {
    this.gaugeAnimation = {
        startTime: performance.now(),
        startValue: animData.startValue,
        endValue: animData.endValue,
        duration: animData.duration,
        next: animData.next || null,
    };
}

export function setGauge(gaugeToAdd) {
    // 絶対値指定はアニメ中でも優先して反映（現在表示値から補間し直す）
    if (typeof gaugeToAdd === 'object' && gaugeToAdd.absolute !== undefined) {
        this.gauge = gaugeToAdd.absolute;
        this.startGaugeAnimation({
            startValue: this.displayGauge,
            endValue: this.gauge,
            duration: 500
        });
        return;
    }

    // 加算要求は、進行中アニメがある場合はスキップ（過度な連続補間を避ける）
    if (this.gaugeAnimation) return;

    const oldValue = this.gauge;
    const newValue = oldValue + gaugeToAdd;

    if (newValue >= 100) {
        this.gaugeMaxCallback();
        this.gauge = newValue % 100;
        const step3 = { startValue: 0, endValue: this.gauge, duration: 300 };
        const step2 = { startValue: 100, endValue: 0, duration: 250, next: step3 };
        const step1 = { startValue: this.displayGauge, endValue: 100, duration: 150, next: step2 };
        this.startGaugeAnimation(step1);
    } else {
        this.gauge = newValue;
        this.startGaugeAnimation({
            startValue: this.displayGauge,
            endValue: this.gauge,
            duration: 500,
        });
    }
}