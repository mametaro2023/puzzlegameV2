import * as C from '../config.js';

export function collide(x, y) {
    const baseY = Math.floor(y);
    for (let i = 0; i < 3; i++) {
        const rRel = baseY + i;
        const c = x;
        const gridRow = rRel + C.HIDDEN_ROWS_TOP;
        if (gridRow >= C.TOTAL_ROWS) return true;
        if (gridRow >= 0 && gridRow < C.TOTAL_ROWS && this.grid[gridRow][c] > 0) return true;
    }
    return false;
}

export function move(dx) {
    if (!this.cur || this.clearPhase) return;
    const nx = this.cur.x + dx;
    if (nx < 0 || nx >= C.COLS) return;

    for (let i = 0; i < 3; i++) {
        const r1 = Math.floor(this.cur.y + i);
        const r2 = Math.floor(this.cur.y + i + 0.999);
        const gridRow1 = r1 + C.HIDDEN_ROWS_TOP;
        const gridRow2 = r2 + C.HIDDEN_ROWS_TOP;
        if ((gridRow1 >= 0 && gridRow1 < C.TOTAL_ROWS && this.grid[gridRow1][nx] > 0) ||
            (r2 !== r1 && gridRow2 >= 0 && gridRow2 < C.TOTAL_ROWS && this.grid[gridRow2][nx] > 0)) {
            return;
        }
    }
    
    const baseRow = Math.floor(this.cur.y);
    if (this.collide(nx, baseRow + 1) && !this.collide(this.cur.x, baseRow + 1)) {
        return;
    }

    this.cur.x = nx;
    if (!this.falling && !this.collide(this.cur.x, Math.floor(this.cur.y) + 1)) {
        this.falling = true;
        clearTimeout(this.lockTimer);
        this.lockTimer = null;
    }
}