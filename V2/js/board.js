import * as C from './config.js';
import { ITEM_PROBABILITY_TABLE } from './config.js'; // これに変更
import * as Utils from './utils.js';

let minoIdCounter = 0; // ミノのユニークIDを生成するためのカウンター

export class Board {
    constructor(isPlayerOne = true) {
        this.isPlayerOne = isPlayerOne; // プレイヤー1かどうか（将来の拡張用）
        this.aiMoveTimer = 0;
        this.aiMoveInterval = 2; // AIが何秒ごとに操作するか
        this.grid = Array.from({ length: C.TOTAL_ROWS }, () => Array(C.COLS).fill(0));
        this.lockGrid = Array.from({ length: C.TOTAL_ROWS }, () => Array(C.COLS).fill(false));
        
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
        this.isFlipAnimating = false;
        this.hardDropBlur = null; // モーションブラー演出用の情報を保持
        this.screenShake = null; // 画面振動の情報を保持

        // アニメーション用変数
        this.fallingBlocks = [];
        this.droppingXBlocks = [];
        this.particles = [];
        this.gaugeAnimation = null;
        this.usedItemAnimation = null;
        this.inventorySlideAnimation = null;

        // ▼▼▼ NEXTアニメーション用のプロパティを追加 ▼▼▼
        this.nextMinoAnimation = null;

        
        this.gaugeMaxCallback = () => {}; // ゲージMAX時の処理を外部から設定
        this.attackEffect = null; // 攻撃エフェクトの情報        

        //this.isGaugeResetting = false; // ゲージがリセット中かどうかのフラグ

        this.gameOverCallback = () => { console.log("Game Over"); };
    }

    onGameOver(callback) {
        this.gameOverCallback = callback;
    }

    onGaugeMax(callback) {
        this.gaugeMaxCallback = callback;
    }    

    init() {
        this.grid = Array.from({ length: C.TOTAL_ROWS }, () => Array(C.COLS).fill(0));
        this.lockGrid = Array.from({ length: C.TOTAL_ROWS }, () => Array(C.COLS).fill(false));
        this.nextQueue = [];
        this.inventory = ['+S'];
        this.gauge = 0;
        this.displayGauge = 0;
        this.combo = 0;
        this.clearPhase = false;
        this.fallingBlocks = [];
        this.droppingXBlocks = [];
        this.spawn();
    }


    update(dt) {
        const now = performance.now();
        //this.updateAnimations(now); // ゲージなどのUIアニメーション
        // 古いupdateAnimationsの処理をここに移動
        if (this.usedItemAnimation && now - this.usedItemAnimation.startTime > this.usedItemAnimation.duration) {
            this.usedItemAnimation = null;
        }
        if (this.inventorySlideAnimation && now - this.inventorySlideAnimation.startTime > this.inventorySlideAnimation.duration) {
            this.inventorySlideAnimation = null;
        }

        if (this.attackEffect && now - this.attackEffect.startTime > this.attackEffect.duration) {
            this.attackEffect = null;
        }

        // 画面揺れやハードドロップのブラーエフェクトを更新
        if (this.hardDropBlur && now - this.hardDropBlur.startTime > 150) {
            this.hardDropBlur = null;
        }
        if (this.screenShake && now - this.screenShake.startTime > this.screenShake.duration) {
            this.screenShake = null;
        }
        
        // パーティクルの位置更新処理を、常に実行される場所に移動
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1; // 重力
            p.lifetime--;
            if (p.lifetime <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // ▼▼▼ 新しいメソッド：アニメーションの更新処理を分離 ▼▼▼
        if (this.nextMinoAnimation) {
            const anim = this.nextMinoAnimation;
            const elapsedTime = now - anim.startTime;
            const progress = Math.min(elapsedTime / anim.duration, 1.0);
            
            anim.progress = Utils.easeInOutCubic(progress);

            if (progress >= 1.0) {
                this.nextMinoAnimation = null;
            }
        }

        // ▼▼▼ ゲージアニメーションの更新処理を修正 ▼▼▼
        if (this.gaugeAnimation) {
            const anim = this.gaugeAnimation;
            const elapsedTime = now - anim.startTime;
            const progress = Math.min(elapsedTime / anim.duration, 1.0);
            
            this.displayGauge = anim.startValue + (anim.endValue - anim.startValue) * Utils.easeInOutCubic(progress);

            // アニメーションが完了した瞬間をチェック
            if (progress >= 1.0) {
                // もし、アニメーションに次のステップが定義されていれば、それを開始する
                if (anim.next) {
                    this.startGaugeAnimation(anim.next);
                } else {
                    // 次のステップがなければ、アニメーションを終了
                    this.gaugeAnimation = null;
                }
            }
        }


        // ゲームの状態に応じて、排他的な処理を実行する
        if (this.droppingXBlocks.length > 0) {
            // アイテム「X」のブロックが落下中
            this.updateDroppingXBlocks(now);
        } else if (this.fallingBlocks.length > 0) {
            // 消去後のブロックが落下中
            this.updateFallingBlocks(now);
        } else if (this.cur && this.isPlayerOne) { // プレイヤー1（自分）のみ操作中のブロック落下を処理
            // 操作中のブロックが落下中
            if (this.falling) {
                const speed = C.BASE_SPEED + C.MAX_SPEED_BONUS * (this.gauge / 100);
                const newY = this.cur.y + speed * dt;
                const baseRow = Math.floor(this.cur.y);
                if (!this.collide(this.cur.x, baseRow + 1)) {
                    this.cur.y = newY;
                } else {
                    this.cur.y = baseRow;
                    this.falling = false;
                    clearTimeout(this.lockTimer);
                    this.lockTimer = setTimeout(() => this.lockPiece(), C.LOCK_DELAY);
                }
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

    rotate(direction) {
        if (!this.cur || this.clearPhase) return;
        if (direction === 1) {
            this.cur.cells.push(this.cur.cells.shift());
        } else {
            this.cur.cells.unshift(this.cur.cells.pop());
        }
    }

    hardDrop() {
        if (!this.cur || this.clearPhase) return;
        const fromY = this.cur.y; // ドロップ前のY座標を記録

        while (!this.collide(this.cur.x, this.cur.y + 1)) {
            this.cur.y++;
        }
        const toY = this.cur.y; // ドロップ後のY座標を記録

        // ブラーエフェクト情報をセット
        if (toY > fromY) { // 実際に落下した場合のみエフェクトを発生
             this.hardDropBlur = {
                fromY: fromY,
                toY: toY,
                x: this.cur.x,
                cells: [...this.cur.cells], // ミノの情報をコピー
                startTime: performance.now()
            };
        }
        clearTimeout(this.lockTimer);
        this.lockPiece();
    }

    useItem() {
        if (this.inventory.length === 0 || this.clearPhase || this.fallingBlocks.length > 0 || this.usedItemAnimation || this.inventorySlideAnimation) return;

        const item = this.inventory[0];
        const now = performance.now();

        this.usedItemAnimation = { item: item, startTime: now, duration: 300 };
        this.inventorySlideAnimation = { startTime: now, duration: 500 };
        this.inventory.shift();

        switch (item) {
            case '+1':
                this.triggerScreenShake(5, 200); // 弱い揺れを0.2秒
                this.riseGrid(1);
                break;
            case '+2':
                this.triggerScreenShake(10, 250); // 強い揺れを0.25秒
                this.riseGrid(2);
                break;
            case '-1': this.dropGrid(1); break;
            case '-2': this.dropGrid(2); break;
            case '!':
                this.grid.forEach(row => row.fill(0));
                this.lockGrid.forEach(row => row.fill(false));
                break;
            case 'P':
                this.isPBlockActive = true;
                this.nextQueue[0] = { cells: [C.P_BLOCK_ID, C.P_BLOCK_ID, C.P_BLOCK_ID], x: C.SPAWN_X, y: C.SPAWN_Y };
                break;
            case '+S': this.setGauge(99); break;
            case '-S': this.setGauge(0); break;
            case 'FR': this.isFlipAnimating = true; this.triggerFlipAnimation(); break;
            case 'X': this.triggerXBlockFall(); break;
        }
    }

    triggerItemUseAnimation() {
        if (this.inventory.length === 0) return;

        const item = this.inventory.shift(); // インベントリの先頭からアイテムを取り出して消費
        const now = performance.now();

        // UIアニメーション用の情報をセット
        this.usedItemAnimation = { item: item, startTime: now, duration: 300 };
        this.inventorySlideAnimation = { startTime: now, duration: 500 };
    }    

        // アイテム名を受け取り、その効果を盤面に適用する
    applyItemEffect(itemName) {
        // ここで、アイテム使用時に盤面にエフェクト（フラッシュなど）を出しても良い

        switch (itemName) {
            case '+1':
                this.triggerScreenShake(6, 200); // 弱い揺れ (強さ6, 0.2秒)
                this.riseGrid(1);
                break;
            case '+2':
                this.triggerScreenShake(12, 250); // 強い揺れ (強さ12, 0.25秒)
                this.riseGrid(2);
                break;
            case '-1': this.dropGrid(1); break;
            case '-2': this.dropGrid(2); break;
            case '!':
                this.grid.forEach(row => row.fill(0));
                this.lockGrid.forEach(row => row.fill(false));
                break;
            case 'P':
                this.isPBlockActive = true;
                this.nextQueue[0] = { cells: [C.P_BLOCK_ID, C.P_BLOCK_ID, C.P_BLOCK_ID], x: C.SPAWN_X, y: C.SPAWN_Y };
                break;
            case '+S':
                // setGaugeは「加算する値」を引数に取るので、現在のゲージを引いて差分を渡す
                this.setGauge({ absolute: 99 });
                break;
            case '-S':
                this.gauge = 0;
                this.startGaugeAnimation({ startValue: this.displayGauge, endValue: 0, duration: 500 });
                break;
            case 'FR': this.triggerFlipAnimation(); break;
            case 'X': this.triggerXBlockFall(); break;
        }
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

        // ▼▼▼ このアニメーション情報セット部分を修正 ▼▼▼
        if (this.nextQueue.length >= 3) {
            this.nextMinoAnimation = {
                // 1番目 -> 落下するミノ (これはもう使わない)
                
                // 2番目 -> 1番目の位置へ移動
                slidingMino: { ...this.nextQueue[1] },
                
                // 3番目 -> 2番目の位置へフェードイン
                fadingInMino: { ...this.nextQueue[2] },

                startTime: performance.now(),
                duration: 250, // 0.25秒
                progress: 0
            };
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
            const rRel = baseY + i;
            const c = x;
            const gridRow = rRel + C.HIDDEN_ROWS_TOP;
            if (gridRow >= C.TOTAL_ROWS) return true;
            if (gridRow >= 0 && gridRow < C.TOTAL_ROWS && this.grid[gridRow][c] > 0) return true;
        }
        return false;
    }
    
    lockPiece() {
        if (!this.cur) return;
        const baseY = Math.floor(this.cur.y);
        for (let i = 0; i < 3; i++) {
            const r = baseY + i;
            const c = this.cur.x;
            const gridRow = r + C.HIDDEN_ROWS_TOP;
            if (gridRow >= 0 && gridRow < C.TOTAL_ROWS) {
                this.grid[gridRow][c] = this.cur.cells[i];
            }
        }
        this.cur = null;
        this.startClear();
    }
    
    startClear() {
        this.clearPhase = true;
        setTimeout(() => {
            const toClear = new Set();
            const pBlocks = [];
            const colorsToClear = new Set();
            for (let r = 0; r < C.TOTAL_ROWS; r++) {
                for (let c = 0; c < C.COLS; c++) {
                    if (this.grid[r][c] === C.P_BLOCK_ID) {
                        pBlocks.push({ r, c });
                        if (r + 1 < C.TOTAL_ROWS && this.grid[r + 1][c] > 0 && this.grid[r + 1][c] !== C.P_BLOCK_ID) {
                            colorsToClear.add(this.grid[r + 1][c]);
                        }
                    }
                }
            }
            if (pBlocks.length > 0) {
                pBlocks.forEach(p => toClear.add(p.r + '_' + p.c));
                if (colorsToClear.size > 0) {
                    for (let r = 0; r < C.TOTAL_ROWS; r++) for (let c = 0; c < C.COLS; c++) {
                        if (colorsToClear.has(this.grid[r][c])) toClear.add(r + '_' + c);
                    }
                }
            }
            const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
            for (let r = 0; r < C.TOTAL_ROWS; r++) {
                for (let c = 0; c < C.COLS; c++) {
                    const v = this.grid[r][c];
                    if (!v || v === C.P_BLOCK_ID || this.lockGrid[r][c]) continue;
                    dirs.forEach(([dr, dc]) => {
                        let cnt = 1, rr = r, cc = c; const connected = [{ r, c }];
                        while (true) {
                            rr += dr; cc += dc;
                            if (rr < 0 || rr >= C.TOTAL_ROWS || cc < 0 || cc >= C.COLS || this.grid[rr][cc] !== v || this.lockGrid[rr][cc]) break;
                            cnt++; connected.push({ r: rr, c: cc });
                        }
                        if (cnt >= 3) connected.forEach(pos => toClear.add(pos.r + '_' + pos.c));
                    });
                }
            }
            if (toClear.size > 0) {
                const unlockedPositions = new Set();
                const checkDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                toClear.forEach(key => {
                    const [r, c] = key.split('_').map(Number);
                    checkDirs.forEach(([dr, dc]) => {
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < C.TOTAL_ROWS && nc >= 0 && nc < C.COLS && this.lockGrid[nr][nc]) {
                            unlockedPositions.add(nr + '_' + nc);
                        }
                    });
                });
                unlockedPositions.forEach(key => {
                    const [r, c] = key.split('_').map(Number); this.lockGrid[r][c] = false;
                });
            }

            if (toClear.size > 0) {
                this.combo++;
                const gaugeToAdd = toClear.size * this.combo * C.GAUGE_COMBO_MULTIPLIER;
                this.setGauge(gaugeToAdd);

                toClear.forEach(k => {
                    const [ar, ac] = k.split('_').map(Number);
                    const colorIndex = this.grid[ar][ac];
                    if (colorIndex > 0 && colorIndex !== C.P_BLOCK_ID) this.createParticles(ac, ar, colorIndex);
                    this.grid[ar][ac] = 0;
                });
                setTimeout(() => this.triggerFallAnimation(), C.CLEAR_ANIM_DELAY);
            } else {
                this.gainItem();
                this.clearPhase = false;
                this.combo = 0;
                setTimeout(() => this.spawn(), C.SPAWN_DELAY);
            }
        }, C.CLEAR_CHECK_DELAY);
    }
    
    setGauge(gaugeToAdd) {
        // アニメーションの途中では、新しいゲージ加算を受け付けない
        if (this.gaugeAnimation) return;

        // `+S`アイテムなどで直接値を設定する場合も考慮
        // `gaugeToAdd`がオブジェクトなら、それは直接設定の指示とみなす
        if (typeof gaugeToAdd === 'object' && gaugeToAdd.absolute !== undefined) {
            this.gauge = gaugeToAdd.absolute;
            this.startGaugeAnimation({
                startValue: this.displayGauge,
                endValue: this.gauge,
                duration: 500
            });
            return;
        }

        const oldValue = this.gauge;
        const newValue = oldValue + gaugeToAdd;

        if (newValue >= 100) {
            // --- 100%に達した場合 ---
            console.log("Gauge MAX! Attack!");
            this.gaugeMaxCallback(); // 攻撃を通知

            this.gauge = newValue % 100; // 内部的なゲージ値は超過分に更新
            
            // アニメーションを定義： ステップ1 (100%へ) -> ステップ2 (0%へ) -> ステップ3 (超過分へ)
            const step3 = { startValue: 0, endValue: this.gauge, duration: 300 };
            const step2 = { startValue: 100, endValue: 0, duration: 250, next: step3 };
            const step1 = { startValue: this.displayGauge, endValue: 100, duration: 150, next: step2 };
            
            this.startGaugeAnimation(step1);

        } else {
            // --- 100%未満の場合 ---
            this.gauge = newValue;
            this.startGaugeAnimation({
                startValue: this.displayGauge,
                endValue: this.gauge,
                duration: 500,
            });
        }
    }

    // ▼▼▼ 新しいヘルパーメソッドを追加 ▼▼▼
    startGaugeAnimation(animData) {
        this.gaugeAnimation = {
            startTime: performance.now(),
            startValue: animData.startValue,
            endValue: animData.endValue,
            duration: animData.duration,
            next: animData.next || null,
        };
    }    

    // 攻撃を受けた時のエフェクトをトリガーする
    triggerAttackEffect() {
        this.attackEffect = {
            startTime: performance.now(),
            duration: 400 // 0.4秒のエフェクト
        };
    }    

    createParticles(x, y, colorIndex) {
        const count = 10;
        const color = C.COLORS[colorIndex];
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: C.OFFX + x * C.BLOCK + C.BLOCK / 2,
                y: C.OFFY + (y - C.HIDDEN_ROWS_TOP) * C.BLOCK + C.BLOCK / 2,
                vx: (Math.random() - 0.5) * 5,
                vy: (Math.random() - 1.0) * 5, // 少し上向きに飛び散るように調整
                lifetime: Math.random() * 50 + 20,
                color: color,
                size: Math.random() * 3 + 2
            });
        }
    }

    triggerFallAnimation() {
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
            // ▼▼▼ 落下するブロックがなく、ここで連鎖が終了した場合 ▼▼▼
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

    triggerFlipAnimation() {
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

    triggerXBlockFall() {
        this.clearPhase = true; this.droppingXBlocks = []; const newRow = [];
        for (let c = 0; c < C.COLS; c++) newRow.push({ col: c, value: Math.floor(Math.random() * 5) + 1 });
        for (const block of newRow) {
            let toR = C.TOTAL_ROWS - 1;
            for (let r = 0; r < C.TOTAL_ROWS; r++) { if (this.grid[r][block.col] > 0 || this.lockGrid[r][block.col]) { toR = r - 1; break; }}
            if (toR < 0) continue;
            this.droppingXBlocks.push({ fromR: -1, toR: toR, col: block.col, value: block.value, animStartTime: performance.now() });
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
        // 1. これ以上上に押し上げられない場合を先にチェック（隠し行も含めて）
        for (let r = 0; r < numRows; r++) {
            if (this.grid[r].some(cell => cell > 0)) {
                this.gameOver();
                return; // ゲームオーバーなので処理を中断
            }
        }

        // 2. 安全なら、実際にブロックを上にずらす（全行）
        for (let r = 0; r < C.TOTAL_ROWS - numRows; r++) {
            this.grid[r] = this.grid[r + numRows];
            this.lockGrid[r] = this.lockGrid[r + numRows];
        }

        // 3. 下に新しい行を生成する
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
    
    dropGrid(numRows) {
        for (let r = C.TOTAL_ROWS - 1; r >= numRows; r--) {
            this.grid[r] = this.grid[r - numRows];
            this.lockGrid[r] = this.lockGrid[r - numRows];
        }
        for (let r = 0; r < numRows; r++) {
            this.grid[r].fill(0);
            this.lockGrid[r].fill(false);
        }
    }
/*
    updateAnimations(now) {
        if (this.gaugeAnimation) {
            const p = Math.min((now - this.gaugeAnimation.startTime) / this.gaugeAnimation.duration, 1.0);
            this.displayGauge = this.gaugeAnimation.startValue + (this.gaugeAnimation.endValue - this.gaugeAnimation.startValue) * Utils.easeInOutCubic(p);
            if (p >= 1.0) this.gaugeAnimation = null;
        }
        if (this.usedItemAnimation && now - this.usedItemAnimation.startTime > this.usedItemAnimation.duration) {
            this.usedItemAnimation = null;
        }
        if (this.inventorySlideAnimation && now - this.inventorySlideAnimation.startTime > this.inventorySlideAnimation.duration) {
            this.inventorySlideAnimation = null;
        }
    }
*/
    updateFallingBlocks(now) {
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

    updateDroppingXBlocks(now) {
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
    
    gameOver() {
        this.gameOverCallback();
    }
}