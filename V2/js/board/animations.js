import * as C from '../config.js';
import * as Utils from '../utils.js';

export function createParticles(x, y, colorIndex) {
    const count = 10;
    const color = C.COLORS[colorIndex];
    for (let i = 0; i < count; i++) {
        this.particles.push({
            x: C.OFFX + x * C.BLOCK + C.BLOCK / 2,
            y: C.OFFY + (y - C.HIDDEN_ROWS_TOP) * C.BLOCK + C.BLOCK / 2,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 1.0) * 5,
            lifetime: Math.random() * 50 + 20,
            color: color,
            size: Math.random() * 3 + 2
        });
    }
}

export function triggerClearStage(cells) {
    // cells: array of {r,c,color}
    this.clearingCells = cells.map(({ r, c, color }) => ({ r, c, color, startTime: performance.now() }));
}

export function triggerComboPopup(combo) {
    this.comboPopup = {
        combo,
        startTime: performance.now(),
        duration: C.COMBO_POPUP_DURATION
    };
}

export function triggerMoveBlur(fromX, toX, yBase, cells) {
    this.moveBlur = {
        fromX,
        toX,
        yBase,
        cells: [...cells],
        startTime: performance.now(),
        duration: C.MOVE_BLUR_DURATION
    };
}

export function triggerFallAnimation() {
    const blocksToAnimate = [];
    for (let c = 0; c < C.COLS; c++) {
        let fallDist = 0;
        for (let r = C.TOTAL_ROWS - 1; r >= 0; r--) {
            if (this.grid[r][c] === 0) { fallDist++; }
            else if (fallDist > 0) {
                blocksToAnimate.push({ fromR: r, toR: r + fallDist, col: c, value: this.grid[r][c], isLocked: this.lockGrid[r][c] });
            }
        }
    }
    if (blocksToAnimate.length === 0) {
        this.gainItem();
        this.clearPhase = false;
        this.combo = 0;
        setTimeout(() => this.spawn(), C.SPAWN_DELAY);
        return;
    }
    for (const block of blocksToAnimate) {
        this.grid[block.fromR][block.col] = 0; this.lockGrid[block.fromR][block.col] = false;
    }
    this.fallingBlocks = blocksToAnimate.map(b => ({ ...b, animStartTime: performance.now(), easing: 'easeOutBounce' }));
}

export function updateFallingBlocks(now) {
    const remainingBlocks = [];
    this.fallingBlocks.forEach(b => {
        if (now - b.animStartTime >= C.FALL_ANIM_DURATION) {
            this.grid[b.toR][b.col] = b.value;
            this.lockGrid[b.toR][b.col] = b.isLocked;
        } else {
            remainingBlocks.push(b);
        }
    });
    this.fallingBlocks = remainingBlocks;
    if (this.fallingBlocks.length === 0) {
        if (this.isFlipAnimating) {
            this.isFlipAnimating = false;
            this.clearPhase = false;
        } else {
            setTimeout(() => this.startClear(), C.DROP_ANIM_DELAY);
        }
    }
}

export function triggerFlipAnimation() {
    this.clearPhase = true; this.fallingBlocks = []; const now = performance.now();
    for (let c = 0; c < C.COLS; c++) {
        const existingBlocks = [];
        for (let r = 0; r < C.TOTAL_ROWS; r++) {
            if (this.grid[r][c] > 0) existingBlocks.push({ r: r, value: this.grid[r][c], isLocked: this.lockGrid[r][c] });
        }
        if (existingBlocks.length === 0) continue;
        const reversedBlocks = [...existingBlocks].reverse();
        for (let i = 0; i < existingBlocks.length; i++) {
            const fromBlock = existingBlocks[i]; const toBlock = reversedBlocks[i];
            this.fallingBlocks.push({ fromR: fromBlock.r, toR: toBlock.r, col: c, value: fromBlock.value, isLocked: fromBlock.isLocked, animStartTime: now, easing: 'easeOutCubic' });
        }
    }
    this.grid = Array.from({ length: C.TOTAL_ROWS }, () => Array(C.COLS).fill(0));
    this.lockGrid = Array.from({ length: C.TOTAL_ROWS }, () => Array(C.COLS).fill(false));
}

export function triggerXBlockFall() {
    this.clearPhase = true; this.droppingXBlocks = []; const newRow = [];
    for (let c = 0; c < C.COLS; c++) newRow.push({ col: c, value: Math.floor(Math.random() * 5) + 1 });
    for (const block of newRow) {
        let toR = C.TOTAL_ROWS - 1;
        for (let r = 0; r < C.TOTAL_ROWS; r++) { if (this.grid[r][block.col] > 0 || this.lockGrid[r][block.col]) { toR = r - 1; break; }}
        if (toR < 0) continue;
        this.droppingXBlocks.push({ fromR: -1, toR: toR, col: block.col, value: block.value, animStartTime: performance.now() });
    }
}

export function updateDroppingXBlocks(now) {
    let allLanded = true;
    this.droppingXBlocks.forEach(b => {
        if (now - b.animStartTime < C.FALL_ANIM_DURATION) allLanded = false;
    });
    if (allLanded) {
        this.droppingXBlocks.forEach(b => {
            if (b.toR >= 0) {
                this.grid[b.toR][b.col] = b.value;
                this.lockGrid[b.toR][b.col] = true;
            }
        });
        this.droppingXBlocks = [];
        this.clearPhase = false;
    }
}