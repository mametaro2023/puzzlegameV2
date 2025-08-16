import * as C from '../config.js';

export function riseGrid(numRows) {
    // shift up without game over; spawn will handle terminal condition
    for (let r = 0; r < C.TOTAL_ROWS - numRows; r++) {
        this.grid[r] = this.grid[r + numRows];
        this.lockGrid[r] = this.lockGrid[r + numRows];
    }
    for (let r = C.TOTAL_ROWS - numRows; r < C.TOTAL_ROWS; r++) {
        const newGridRow = [];
        const newLockRow = [];
        for (let c = 0; c < C.COLS; c++) {
            newGridRow.push(Math.floor(Math.random() * 5) + 1);
            newLockRow.push(Math.random() < 0.25);
        }
        this.grid[r] = newGridRow;
        this.lockGrid[r] = newLockRow;
    }
}

export function dropGrid(numRows) {
    for (let r = C.TOTAL_ROWS - 1; r >= numRows; r--) {
        this.grid[r] = this.grid[r - numRows];
        this.lockGrid[r] = this.lockGrid[r - numRows];
    }
    for (let r = 0; r < numRows; r++) {
        this.grid[r].fill(0);
        this.lockGrid[r].fill(false);
    }
}