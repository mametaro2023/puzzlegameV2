import * as C from './config.js';
import { ITEM_PROBABILITY_TABLE } from './config.js';

let minoIdCounter = 0;

export class Board {
    constructor(isPlayerOne = true) {
        this.isPlayerOne = isPlayerOne;
        this.grid = Array.from({ length: C.ROWS }, () => Array(C.COLS).fill(0));
        this.lockGrid = Array.from({ length: C.ROWS }, () => Array(C.COLS).fill(false));
        
        this.cur = null;
        this.nextQueue = [];
        this.inventory = ['+S'];
        
        this.gauge = 0;
        this.displayGauge = 0;
        this.combo = 0;

        this.lockTimer = null;
        this.falling = true;
        this.clearPhase = false;
        this.isPBlockActive = false;
        
        this.gaugeMaxCallback = () => {};
        this.gameOverCallback = () => {};
    }

    onGameOver(callback) { this.gameOverCallback = callback; }
    onGaugeMax(callback) { this.gaugeMaxCallback = callback; }

    init() {
        this.grid.forEach(row => row.fill(0));
        this.lockGrid.forEach(row => row.fill(false));
        this.nextQueue = [];
        this.inventory = ['+S'];
        this.gauge = 0;
        this.displayGauge = 0;
        this.combo = 0;
        this.clearPhase = false;
        this.spawn();
    }
    
    update(dt) {
        // 落下アニメーション中は操作ブロックを動かさない
        if (this.cur && this.isPlayerOne && this.falling && !this.clearPhase) {
            const speed = C.BASE_SPEED + C.MAX_SPEED_BONUS * (this.gauge / 100);
            const newY = this.cur.y + speed * dt;
            const baseRow = Math.floor(this.cur.y);
            if (!this.collide(this.cur.x, baseRow + 1)) {
                this.cur.y = newY;
            } else {
                this.cur.y = baseRow;
                // ▼▼▼ 修正点 ▼▼▼
                // 落下が止まったことを示すフラグを立てるだけにする
                this.falling = false; 
                // setTimeoutの呼び出しを削除
            }
        }
    }

    move(dx) {
        if (!this.cur || this.clearPhase) return;
        const nx = this.cur.x + dx;
        if (nx < 0 || nx >= C.COLS) return;

        for (let i = 0; i < 3; i++) {
            const r1 = Math.floor(this.cur.y + i);
            const r2 = Math.floor(this.cur.y + i + 0.999);
            
            // ▼▼▼ この行の条件式を修正 ▼▼▼
            // r2がgridの範囲内にあることを確認するチェックを追加
            if ((r1 >= 0 && this.grid[r1][nx] > 0) || (r2 !== r1 && r2 >= 0 && r2 < C.ROWS && this.grid[r2][nx] > 0)) {
                return; // 衝突するので移動しない
            }
        }
        
        const baseRow = Math.floor(this.cur.y);
        // この衝突チェックは不要なので削除しても良いが、安全のために残す
        if (this.collide(nx, baseRow + 1) && !this.collide(this.cur.x, baseRow + 1)) {
            // return;
        }

        this.cur.x = nx;
        if (!this.falling && !this.collide(this.cur.x, Math.floor(this.cur.y) + 1)) {
            this.falling = true;
        }
    }

    rotate(direction) {
        if (!this.cur || this.clearPhase) return;
        if (direction === 1) {
            this.cur.cells.push(this.cur.cells.shift());
        } else {
            this.cur.cells.unshift(this.cur.cells.pop());
        }
        // ▼▼▼ 修正点 ▼▼▼
        // 落下が再開したことを示すフラグを立てるだけにする
        if (!this.falling && !this.collide(this.cur.x, Math.floor(this.cur.y) + 1)) {
            this.falling = true;
        }
    }

    hardDrop() {
        if (!this.cur || this.clearPhase) return null;
        const fromY = this.cur.y;
        const dropX = this.cur.x;
        const dropCells = [...this.cur.cells];
        while (!this.collide(this.cur.x, this.cur.y + 1)) { this.cur.y++; }
        const toY = this.cur.y;
        clearTimeout(this.lockTimer);
        const lockResult = this.lockPiece();
        return { type: 'hardDrop', fromY, toY, x: dropX, cells: dropCells, lockResult };
    }

    // アイテム名を受け取り、その効果を盤面に適用する
    applyItemEffect(itemName) {
        switch (itemName) {
            case '+1':
                this.riseGrid(1);
                return { type: 'shake', magnitude: 6, duration: 200 };
            case '+2':
                this.riseGrid(2);
                return { type: 'shake', magnitude: 12, duration: 250 };
            case '-1': this.dropGrid(1); break;
            case '-2': this.dropGrid(2); break;
            case '!':
                this.grid.forEach(row => row.fill(0));
                this.lockGrid.forEach(row => row.fill(false));
                break;
            case 'P':
                this.isPBlockActive = true;
                this.nextQueue[0] = { ...this.nextQueue[0], cells: [C.P_BLOCK_ID, C.P_BLOCK_ID, C.P_BLOCK_ID]};
                break;
            case '+S': 
                const gaugeToAdd = 99 - this.gauge;
                this.gauge = 99;
                return { type: 'gaugeSet', value: 99 };
            case '-S': 
                this.gauge = 0;
                return { type: 'gaugeReset' };
            // FR, X など、アニメーションを伴うアイテムは今後 AnimationManager に移管
        }
        return null; // アニメーションがない場合はnullを返す
    }


    triggerScreenShake(magnitude, duration) {
        this.screenShake = {
            startTime: performance.now(),
            magnitude: magnitude,
            duration: duration
        };
    }    

    spawn() {
        this.isPBlockActive = false;
        while (this.nextQueue.length < 3) {
            this.nextQueue.push(this.generateMino());
        }
        this.cur = this.nextQueue.shift();
        this.cur.x = C.SPAWN_X;
        this.cur.y = C.SPAWN_Y;
        this.combo = 0;
        this.falling = true;
        if (this.collide(this.cur.x, this.cur.y)) {
            this.gameOver();
        }
    }

    generateMino() {
        const types = [1, 2, 3, 4, 5];
        return {
            id: minoIdCounter++, // ユニークIDを付与
            cells: Array.from({ length: 3 }, () => types[Math.random() * 5 | 0]),
            x: C.SPAWN_X,
            y: C.SPAWN_Y
        };
    }

    collide(x, y) {
        const baseY = Math.floor(y);
        for (let i = 0; i < 3; i++) {
            const r = baseY + i;
            const c = x;
            if (r >= C.ROWS) return true;
            if (r >= 0 && this.grid[r][c] > 0) return true;
        }
        return false;
    }
    
    lockPiece() {
        if (!this.cur) return { clearedBlocks: [], fallingBlocks: [] };
        const baseY = Math.floor(this.cur.y);
        for (let i = 0; i < 3; i++) {
            const r = baseY + i, c = this.cur.x;
            if (r >= 0 && r < C.ROWS) { this.grid[r][c] = this.cur.cells[i]; }
        }
        this.cur = null;
        return this.startClear();
    }
    
    startClear() {
        this.clearPhase = true;
        const toClear = this.findClearableBlocks();
        let clearedBlocks = [];
        let gaugeAnimInfo = null;

        if (toClear.size > 0) {
            this.combo++;
            const gaugeToAdd = toClear.size * this.combo * C.GAUGE_COMBO_MULTIPLIER;
            gaugeAnimInfo = this.setGauge(gaugeToAdd); // ゲージ変更のアニメーション情報を取得

            toClear.forEach(k => {
                const [r, c] = k.split('_').map(Number);
                clearedBlocks.push({ r, c, value: this.grid[r][c] });
                this.grid[r][c] = 0;
                this.lockGrid[r][c] = false;
            });

            const fallingBlocks = this.applyGravity();
            this.clearPhase = false;
            return { clearedBlocks, fallingBlocks, isChaining: true, gaugeAnimInfo };
        } else {
            this.gainItem();
            this.clearPhase = false;
            this.combo = 0;
            // spawnは直接呼び出さず、Controllerに通知してspawnしてもらう
            return { clearedBlocks: [], fallingBlocks: [], isChaining: false, needsSpawn: true };
        }
    }

    // ▼▼▼ このメソッドを置き換え ▼▼▼
    applyGravity() {
        const blocksToAnimate = [];
        for (let c = 0; c < C.COLS; c++) {
            let emptySpaces = [];
            // 下から上に見ていき、空のマスを記録
            for (let r = C.ROWS - 1; r >= 0; r--) {
                if (this.grid[r][c] === 0) {
                    emptySpaces.push(r);
                } else if (emptySpaces.length > 0) {
                    // ブロックを見つけたら、一番下の空マスに移動
                    const toR = emptySpaces.shift();
                    blocksToAnimate.push({ fromR: r, toR, col: c, value: this.grid[r][c], isLocked: this.lockGrid[r][c] });
                    
                    // 盤面データを即座に更新
                    this.grid[toR][c] = this.grid[r][c];
                    this.lockGrid[toR][c] = this.lockGrid[r][c];
                    this.grid[r][c] = 0;
                    this.lockGrid[r][c] = false;
                    
                    // 移動したので、このマスも空になる
                    emptySpaces.push(r);
                    // 空マスリストをソートして、常に一番下の空マスが先頭に来るようにする
                    emptySpaces.sort((a, b) => b - a);
                }
            }
        }
        return blocksToAnimate;
    }

    // ▼▼▼ このメソッドを置き換え ▼▼▼
    findClearableBlocks() {
        const toClear = new Set();
        
        // Pブロックによる消去
        const pBlocks = [];
        const colorsToClear = new Set();
        for (let r = 0; r < C.ROWS; r++) {
            for (let c = 0; c < C.COLS; c++) {
                if (this.grid[r][c] === C.P_BLOCK_ID) {
                    pBlocks.push({ r, c });
                    if (r + 1 < C.ROWS && this.grid[r + 1][c] > 0 && this.grid[r + 1][c] !== C.P_BLOCK_ID) {
                        colorsToClear.add(this.grid[r + 1][c]);
                    }
                }
            }
        }
        if (pBlocks.length > 0) {
            pBlocks.forEach(p => toClear.add(`${p.r}_${p.c}`));
            if (colorsToClear.size > 0) {
                for (let r = 0; r < C.ROWS; r++) {
                    for (let c = 0; c < C.COLS; c++) {
                        if (colorsToClear.has(this.grid[r][c])) {
                            toClear.add(`${r}_${c}`);
                        }
                    }
                }
            }
        }
        
        // 通常の3つ以上繋がったブロックの消去
        const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (let r = 0; r < C.ROWS; r++) {
            for (let c = 0; c < C.COLS; c++) {
                const value = this.grid[r][c];
                if (!value || value === C.P_BLOCK_ID || this.lockGrid[r][c]) continue;

                dirs.forEach(([dr, dc]) => {
                    const connected = [{r, c}];
                    // 正方向
                    let [rr, cc] = [r + dr, c + dc];
                    while (rr >= 0 && rr < C.ROWS && cc >= 0 && cc < C.COLS && this.grid[rr][cc] === value && !this.lockGrid[rr][cc]) {
                        connected.push({r: rr, c: cc});
                        rr += dr;
                        cc += dc;
                    }
                    // 逆方向
                    [rr, cc] = [r - dr, c - dc];
                     while (rr >= 0 && rr < C.ROWS && cc >= 0 && cc < C.COLS && this.grid[rr][cc] === value && !this.lockGrid[rr][cc]) {
                        connected.push({r: rr, c: cc});
                        rr -= dr;
                        cc -= dc;
                    }

                    if (connected.length >= 3) {
                        connected.forEach(pos => toClear.add(`${pos.r}_${pos.c}`));
                    }
                });
            }
        }
        return toClear;
    }
    
    setGauge(gaugeToAdd) {
        const oldValue = this.gauge;
        const newValue = oldValue + gaugeToAdd;
        
        if (newValue >= 100) {
            this.gaugeMaxCallback(); // 攻撃を通知
            this.gauge = newValue % 100;
            // ゲージ攻撃アニメーションの指示を返す
            return { type: 'gaugeAttack', finalValue: this.gauge };
        } else {
            this.gauge = newValue;
            // 通常のゲージ設定アニメーションの指示を返す
            return { type: 'gaugeSet', value: this.gauge };
        }
    }

    gainItem() {
        if (this.inventory.length >= C.MAX_INVENTORY || this.combo === 0) {
            return; // インベントリ満杯か、コンボがなければ何もしない
        }

        // 1. コンボ数に応じた抽選テーブルを取得
        const probabilityData = ITEM_PROBABILITY_TABLE[this.combo] || ITEM_PROBABILITY_TABLE.default;
        
        // 2. 抽選対象のアイテムリストと、「ハズレ」の重みを取得
        const itemsToDraw = probabilityData.items;
        const noItemWeight = probabilityData.noItemWeight;

        // 抽選対象がなければ何もしない (1コンボ時など)
        if (itemsToDraw.length === 0 && noItemWeight > 0) {
            return;
        }

        // 3. 全ての重みの合計を計算（アイテムの重み合計 + ハズレの重み）
        const totalWeight = itemsToDraw.reduce((sum, item) => sum + item.weight, 0) + noItemWeight;

        // 4. 0から合計重みまでの範囲で乱数を生成
        const rand = Math.random() * totalWeight;

        // 5. 抽選開始
        let cumulativeWeight = 0;

        // 5-1. まず「ハズレ」かどうかを判定
        cumulativeWeight += noItemWeight;
        if (rand < cumulativeWeight) {
            // ハズレだったので、何も獲得せずに終了
            console.log(`No item acquired (Combo: ${this.combo})`);
            return;
        }

        // 5-2. アイテムの中から抽選
        for (const item of itemsToDraw) {
            cumulativeWeight += item.weight;
            if (rand < cumulativeWeight) {
                this.inventory.push(item.name);
                console.log(`Acquired Item: ${item.name} (Combo: ${this.combo})`);
                return; // アイテムを獲得したので処理終了
            }
        }
    }

    riseGrid(numRows) {
        // 1. せり上がることで天井を突き抜けるブロックがないか、先にチェックする
        for (let r = 0; r < numRows; r++) {
            if (this.grid[r].some(cell => cell > 0)) {
                this.gameOver();
                return; // ゲームオーバーなので処理を中断
            }
        }

        // 2. 安全なら、実際にブロックを上にずらす
        for (let r = 0; r < C.ROWS - numRows; r++) {
            this.grid[r] = this.grid[r + numRows];
            this.lockGrid[r] = this.lockGrid[r + numRows];
        }

        // 3. 下に新しい行を生成する
        for (let r = C.ROWS - numRows; r < C.ROWS; r++) {
            const newGridRow = [];
            const newLockRow = [];
            for (let c = 0; c < C.COLS; c++) {
                newGridRow.push(Math.floor(Math.random() * 5) + 1);
                // ▼▼▼ この行の確率を 0.25 に修正 ▼▼▼
                newLockRow.push(Math.random() < 0.25);
            }
            this.grid[r] = newGridRow;
            this.lockGrid[r] = newLockRow;
        }
    }
    
    dropGrid(numRows) {
        for (let r = C.ROWS - 1; r >= numRows; r--) this.grid[r] = this.grid[r - numRows];
        for (let r = 0; r < numRows; r++) this.grid[r].fill(0);
    }
    
    gameOver() {
        this.gameOverCallback();
    }
}