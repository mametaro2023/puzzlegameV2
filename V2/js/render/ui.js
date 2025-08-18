import * as C from '../config.js';
import * as Utils from '../utils.js';

export function drawUI(renderer, board, now) {
    const ctx = renderer.ctx;
    // NEXT label badge
    ctx.save();
    const badgeX = C.NEXT_X - 6;
    const badgeY = C.OFFY - 6;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(badgeX, badgeY, 90, 36);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(badgeX, badgeY, 90, 36);
    ctx.fillStyle = '#cfe2ff';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('NEXT', C.NEXT_X, C.OFFY - 2);
    ctx.restore();

    drawNextMinos(renderer, board);

    // Gauge
    const gaugeHeight = C.BOARD_HEIGHT;
    const gy = C.OFFY + (gaugeHeight - gaugeHeight * (board.displayGauge / 100));
    const gx = C.GAUGE_X;
    const gw = C.BLOCK * 0.8;

    renderer.ctx.fillStyle = 'rgba(85,85,85,0.6)';
    renderer.ctx.fillRect(C.GAUGE_X, C.OFFY, gw, gaugeHeight);

    const grad = renderer.ctx.createLinearGradient(0, gy, 0, C.OFFY + gaugeHeight);
    grad.addColorStop(0, '#79a7ff');
    grad.addColorStop(1, '#416bff');
    renderer.ctx.fillStyle = grad;
    renderer.ctx.fillRect(gx, gy, gw, gaugeHeight * (board.displayGauge / 100));

    renderer.ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    renderer.ctx.strokeRect(C.GAUGE_X, C.OFFY, gw, gaugeHeight);

    renderer.ctx.save();
    renderer.ctx.globalAlpha = 0.15 + 0.25 * (board.displayGauge / 100);
    renderer.ctx.fillStyle = '#cfe2ff';
    renderer.ctx.fillRect(gx, gy, gw, Math.min(10, gaugeHeight * (board.displayGauge / 100)));
    renderer.ctx.restore();

    const ticks = 5;
    for (let i = 1; i < ticks; i++) {
        const ty = C.OFFY + (gaugeHeight / ticks) * i;
        renderer.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        renderer.ctx.beginPath();
        renderer.ctx.moveTo(C.GAUGE_X, ty);
        renderer.ctx.lineTo(C.GAUGE_X + gw, ty);
        renderer.ctx.stroke();
    }

    if (board.displayGauge >= 80) {
        const pulse = Math.sin(performance.now() / 200) * 0.5 + 0.5;
        renderer.ctx.save();
        renderer.ctx.globalAlpha = 0.15 + 0.15 * pulse;
        renderer.ctx.fillStyle = '#ffffff';
        renderer.ctx.fillRect(gx - 2, gy - 4, gw + 4, 6);
        renderer.ctx.restore();
    }
    if (Math.floor(board.displayGauge) === 100) {
        renderer.ctx.save();
        renderer.ctx.globalAlpha = 0.35;
        renderer.ctx.strokeStyle = '#cfe2ff';
        renderer.ctx.lineWidth = 3;
        renderer.ctx.strokeRect(C.GAUGE_X - 2, C.OFFY - 2, gw + 4, gaugeHeight + 4);
        renderer.ctx.restore();
    }

    // 震え・ビリビリ（ゲージ量で強度切替）
    const g = board.displayGauge;
    if (g >= 50 && g < 100) {
        const strength = g < 75 ? 1 : g < 90 ? 2 : 3;
        // 震え: 枠内を僅かにランダムシフト
        const shakeX = (Math.random() - 0.5) * strength;
        const shakeY = (Math.random() - 0.5) * strength;
        renderer.ctx.save();
        renderer.ctx.translate(shakeX, shakeY);
        // ビリビリ: 稲妻風ラインを数本
        const bolts = strength; // 1〜3本
        for (let b = 0; b < bolts; b++) {
            const segments = 6;
            let bx = gx + gw / 2;
            let by = gy + (gaugeHeight * (1 - g / 100)) + b * 4;
            renderer.ctx.beginPath();
            renderer.ctx.moveTo(bx, by);
            for (let s = 0; s < segments; s++) {
                bx += (Math.random() - 0.5) * 8;
                by += (fillH / segments);
                renderer.ctx.lineTo(bx, by);
            }
            renderer.ctx.strokeStyle = 'rgba(207,226,255,0.35)';
            renderer.ctx.lineWidth = 1 + 0.5 * strength;
            renderer.ctx.stroke();
        }
        renderer.ctx.restore();
    }

    drawInventory(renderer, board, now);

    // Score HUD
    renderer.ctx.save();
    renderer.ctx.fillStyle = '#ffffff';
    renderer.ctx.textAlign = 'right';
    renderer.ctx.textBaseline = 'top';
    renderer.ctx.font = '28px sans-serif';
    const scoreText = (board.displayScore | 0).toLocaleString();
    renderer.ctx.fillText(scoreText, C.OFFX + C.BOARD_WIDTH - 8, C.OFFY + 6);
    renderer.ctx.restore();
}

export function drawNextMinos(renderer, board) {
    const ctx = renderer.ctx;
    if (board.nextQueue.length === 0) return;

    const anim = board.nextMinoAnimation;
    const next1 = board.nextQueue[0];
    const next2 = board.nextQueue[1];

    const pos1 = { x: C.NEXT_X, y: C.OFFY + 20 };
    const pos2 = { x: C.NEXT_X + C.BLOCK * 0.4, y: C.OFFY + 20 + C.BLOCK * 0.4 };

    ctx.save();
    const glow = ctx.createLinearGradient(pos1.x, pos1.y, pos1.x + C.BLOCK, pos1.y + C.BLOCK * 3);
    glow.addColorStop(0, 'rgba(65,107,255,0.15)');
    glow.addColorStop(1, 'rgba(121,167,255,0.05)');
    ctx.fillStyle = glow;
    ctx.fillRect(pos1.x - 10, pos1.y - 10, C.BLOCK + 20, C.BLOCK * 3 + 20);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    for (let i = 0; i < 3; i++) {
        const y = pos1.y + i * (C.BLOCK + 2);
        ctx.fillRect(pos1.x + 4, y + 4, C.BLOCK, C.BLOCK);
    }
    ctx.restore();

    if (anim && anim.progress < 1.0) {
        if (next2) {
            const wobble = Math.sin(performance.now() / 600) * 2;
            ctx.globalAlpha = anim.progress * 0.8;
            drawSingleNextMino(renderer, next2, pos2.x, pos2.y + wobble, C.BLOCK, 0.5);
            ctx.globalAlpha = 1.0;
        }
    } else {
        if (next2) {
            const wobble = Math.sin(performance.now() / 600) * 2;
            drawSingleNextMino(renderer, next2, pos2.x, pos2.y + wobble, C.BLOCK, 0.5);
        }
    }

    if (anim && anim.progress < 1.0) {
        const slideX = pos2.x + (pos1.x - pos2.x) * anim.progress;
        const slideY = pos2.y + (pos1.y - pos2.y) * anim.progress;
        drawSingleNextMino(renderer, next1, slideX, slideY, C.BLOCK);
    } else {
        const bounce = Math.sin(performance.now() / 400) * 1.5;
        drawSingleNextMino(renderer, next1, pos1.x, pos1.y + bounce, C.BLOCK);
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.strokeRect(pos1.x - 6, pos1.y - 6, C.BLOCK + 12, C.BLOCK * 3 + 12);
    ctx.restore();
}

export function drawSingleNextMino(renderer, mino, x, y, blockSize, brightness = 1.0) {
    const ctx = renderer.ctx;
    if (!mino) return;
    for (let i = 0; i < 3; i++) {
        const blockY = y + i * (blockSize + 2);
        renderer.drawBlock(mino.cells[i], x, blockY, blockSize, brightness);
    }
}

export function drawInventory(renderer, board, now) {
    const ctx = renderer.ctx;
    const invY = C.OFFY + C.BOARD_HEIGHT + 15;
    const itemSlotWidth = C.BOARD_WIDTH / C.MAX_INVENTORY;
    const itemGap = itemSlotWidth * 0.1;
    const itemSize = itemSlotWidth - itemGap;

    for (let i = 0; i < C.MAX_INVENTORY; i++) {
        const bgX = C.OFFX + i * itemSlotWidth + itemGap / 2;
        ctx.fillStyle = '#555';
        ctx.fillRect(bgX, invY, itemSize, itemSize);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(bgX, invY, itemSize, itemSize);
    }
    
    if (board.usedItemAnimation) {
        const p = Math.min((now - board.usedItemAnimation.startTime) / board.usedItemAnimation.duration, 1.0);
        const scale = 1 + p * 0.5;
        const alpha = 1 - p;
        const animX = C.OFFX + itemSize / 2 + itemGap / 2;
        const animY = invY + itemSize / 2;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(animX, animY);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#fff';
        ctx.font = `${itemSize * 0.6}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(board.usedItemAnimation.item, 0, 0);
        ctx.restore();
    }

    for (let i = 0; i < board.inventory.length; i++) {
        const startX = C.OFFX + (i + 1) * itemSlotWidth + itemGap / 2;
        const endX = C.OFFX + i * itemSlotWidth + itemGap / 2;
        let currentX = endX;

        if (board.inventorySlideAnimation) {
            const p = Math.min((now - board.inventorySlideAnimation.startTime) / board.inventorySlideAnimation.duration, 1.0);
            currentX = startX - (startX - endX) * Utils.easeInOutCubic(p);
        }
        
        ctx.fillStyle = '#fff';
        ctx.font = `${itemSize * 0.7}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(board.inventory[i], currentX + itemSize / 2, invY + itemSize / 2);
    }
}