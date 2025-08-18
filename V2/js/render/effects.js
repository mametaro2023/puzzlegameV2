import * as C from '../config.js';

export function drawLockedEffect(renderer, x, y) {
    const ctx = renderer.ctx;
    const now = performance.now();
    const alpha = 0.5 + Math.sin(now / 500) * 0.25;
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    // 斜めクロスの光（薄く）
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 5);
    ctx.lineTo(x + C.BLOCK - 5, y + C.BLOCK - 5);
    ctx.moveTo(x + C.BLOCK - 5, y + 5);
    ctx.lineTo(x + 5, y + C.BLOCK - 5);
    ctx.stroke();
    ctx.lineWidth = 2;
    // 南京錠アイコン
    ctx.strokeStyle = `rgba(207,226,255, ${alpha})`;
    const cx = x + C.BLOCK / 2;
    const cy = y + C.BLOCK / 2;
    const w = C.BLOCK * 0.55;
    const h = C.BLOCK * 0.45;
    ctx.strokeRect(cx - w/2, cy - h/4, w, h/2);
    ctx.beginPath();
    ctx.arc(cx, cy - h/4, w/3, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
}

export function drawHardDropBlur(renderer, board, now) {
    const ctx = renderer.ctx;
    const blur = board.hardDropBlur;
    if (!blur) return;
    const elapsedTime = now - blur.startTime;
    const duration = 150;
    if (elapsedTime > duration) return;
    const alpha = 0.6 * (1 - (elapsedTime / duration));
    ctx.save();
    ctx.globalAlpha = alpha;
    const x = C.OFFX + blur.x * C.BLOCK;
    for (let i = 0; i < 3; i++) {
        const value = blur.cells[i];
        if (value > 0) {
            const startY = C.OFFY + (blur.fromY + i) * C.BLOCK;
            const endY = C.OFFY + (blur.toY + i) * C.BLOCK;
            const height = Math.max(0, endY - startY);
            if (height > 0) {
                ctx.fillStyle = C.COLORS[value];
                ctx.fillRect(x, startY, C.BLOCK, height);
            }
        }
    }
    ctx.restore();
}

export function drawParticles(renderer, board) {
    const ctx = renderer.ctx;
    board.particles.forEach(p => {
        const x = p.x;
        const y = p.y;
        ctx.save();
        ctx.globalAlpha = p.lifetime / 50;
        ctx.fillStyle = p.color;
        ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
        ctx.restore();
    });
}