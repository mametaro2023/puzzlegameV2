export function triggerScreenShake(magnitude, duration, options = {}) {
    this.screenShake = {
        startTime: performance.now(),
        magnitude: magnitude,
        duration: duration,
        dirX: options.dirX ?? 1.0,
        dirY: options.dirY ?? 1.0,
    };
}

export function triggerAttackEffect() {
    this.attackEffect = {
        startTime: performance.now(),
        duration: 400
    };
}