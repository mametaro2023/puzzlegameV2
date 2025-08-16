export function triggerScreenShake(magnitude, duration) {
    this.screenShake = {
        startTime: performance.now(),
        magnitude: magnitude,
        duration: duration
    };
}

export function triggerAttackEffect() {
    this.attackEffect = {
        startTime: performance.now(),
        duration: 400
    };
}