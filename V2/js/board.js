import * as C from './config.js';
import { ITEM_PROBABILITY_TABLE } from './config.js'; // これに変更
import * as Utils from './utils.js';
import * as Collisions from './board/collisions.js';
import * as GridShift from './board/gridShift.js';
import * as Gauge from './board/gauge.js';
import * as Effects from './board/effects.js';
import * as Anim from './board/animations.js';
const { triggerMoveBlur, triggerClearStage, triggerComboPopup } = Anim;

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
        this.inventory = ['P'];
        
        this.gauge = 0;
        this.displayGauge = 0;
        this.combo = 0;
        
        this.matchElapsed = 0; // 経過時間（秒）
        this.score = 0;
        this.displayScore = 0;
        this.scoreTween = null;

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
        this.inventory = ['P'];
        this.gauge = 0;
        this.displayGauge = 0;
        this.combo = 0;
        this.clearPhase = false;
        this.fallingBlocks = [];
        this.droppingXBlocks = [];
        this.matchElapsed = 0;
        this.spawn();
    }


    update(dt) {
        const now = performance.now();
        this.matchElapsed += dt;
        // ゲージ・UIアニメ（省略）
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
            this.updateDroppingXBlocks(now);
        } else if (this.fallingBlocks.length > 0) {
            this.updateFallingBlocks(now);
        } else if (this.cur && this.isPlayerOne) {
            // 操作中のブロックが落下中
            if (this.falling) {
                // 時間経過ベース速度の上昇（緩やかに、上限あり）
                const timeBonus = Math.min(1.5, Math.floor(this.matchElapsed / 10) * 0.05);
                const base = C.BASE_SPEED + timeBonus;
                const gaugeBonus = C.MAX_SPEED_BONUS * (this.gauge / 100);
                let speed = base + gaugeBonus;

                // ソフトドロップ（下キー押下中）
                if (this.softDropping) {
                    const boosted = base * C.SOFT_DROP_MULT + gaugeBonus;
                    const maxSpeed = base + C.SOFT_DROP_MAX_DELTA + gaugeBonus;
                    speed = Math.min(boosted, maxSpeed);
                    this.score += C.SOFT_DROP_SCORE_RATE * dt;
                }

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
        
        // スコアのなめらか加算
        if (this.displayScore < this.score) {
            if (!this.scoreTween) {
                this.scoreTween = { start: this.displayScore, end: this.score, startTime: now };
            }
            const p = Math.min((now - this.scoreTween.startTime) / C.SCORE_TWEEN_DURATION, 1.0);
            this.displayScore = this.scoreTween.start + (this.scoreTween.end - this.scoreTween.start) * Utils.easeOutCubic(p);
            if (p >= 1.0) this.scoreTween = null;
        }
    }

    move(dx) {
        const before = this.cur ? this.cur.x : null;
        const beforeCells = this.cur ? [...this.cur.cells] : null;
        const beforeY = this.cur ? this.cur.y : null;
        const result = Collisions.move.call(this, dx);
        if (this.cur && before !== null && this.cur.x !== before) {
            // 横移動のモーションブラーをトリガ（軽め）
            this.nextMinoAnimation = this.nextMinoAnimation; // no-op to keep structure
            this.triggerMoveBlur(before, this.cur.x, beforeY, beforeCells);
        }
        return result;
    }

    rotate(direction) {
        if (!this.cur || this.clearPhase) return;
        if (direction === 1) {
            this.cur.cells.push(this.cur.cells.shift());
        } else {
            this.cur.cells.unshift(this.cur.cells.pop());
        }
    }

    // 下キーでソフトドロップを開始/停止するためのフラグ
    setSoftDrop(active) {
        this.softDropping = active;
    }

    hardDrop() {
        if (!this.cur || this.clearPhase) return;
        const fromY = this.cur.y;
        let cellsDropped = 0;
        while (!this.collide(this.cur.x, this.cur.y + 1)) {
            this.cur.y++;
            cellsDropped++;
        }
        const toY = this.cur.y;
        // スコア: ハードドロップ距離に応じて
        this.score += cellsDropped * C.HARD_DROP_SCORE_PER_CELL;

        if (toY > fromY) {
            this.hardDropBlur = {
                fromY: fromY,
                toY: toY,
                x: this.cur.x,
                cells: [...this.cur.cells],
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
                this.triggerScreenShake(5, 200, { dirY: 1.0, dirX: 0.4 }); // 縦寄りの揺れ（軽）
                this.riseGrid(1);
                break;
            case '+2':
                this.triggerScreenShake(10, 250, { dirY: 1.0, dirX: 0.4 }); // 縦寄りの揺れ（強）
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
                this.triggerScreenShake(6, 200, { dirY: 1.0, dirX: 0.4 }); // 縦寄りの揺れ（軽）
                this.riseGrid(1);
                break;
            case '+2':
                this.triggerScreenShake(12, 250, { dirY: 1.0, dirX: 0.4 }); // 縦寄りの揺れ（強）
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


    triggerScreenShake(magnitude, duration, options) { return Effects.triggerScreenShake.call(this, magnitude, duration, options); }    

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

    collide(x, y) { return Collisions.collide.call(this, x, y); }
    
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

                const cells = Array.from(toClear).map(k => {
                    const [ar, ac] = k.split('_').map(Number);
                    return { r: ar, c: ac, color: this.grid[ar][ac] };
                });
                this.triggerClearStage(cells);
                this.triggerComboPopup(this.combo);

                // スコア: ブロック数とコンボでベース点を増幅
                const blocks = toClear.size;
                const clearScore = blocks * (C.CLEAR_BASE_SCORE + blocks * C.CLEAR_PER_BLOCK_FACTOR + this.combo * C.CLEAR_COMBO_FACTOR);
                this.score += clearScore;

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
    
    setGauge(gaugeToAdd) { return Gauge.setGauge.call(this, gaugeToAdd); }

    // ▼▼▼ 新しいヘルパーメソッドを追加 ▼▼▼
    startGaugeAnimation(animData) { return Gauge.startGaugeAnimation.call(this, animData); }    

    // 攻撃を受けた時のエフェクトをトリガーする
    triggerAttackEffect() { return Effects.triggerAttackEffect.call(this); }    

    createParticles(x, y, colorIndex) { return Anim.createParticles.call(this, x, y, colorIndex); }

    triggerMoveBlur(fromX, toX, yBase, cells) { return Anim.triggerMoveBlur.call(this, fromX, toX, yBase, cells); }

    triggerClearStage(cells) { return Anim.triggerClearStage.call(this, cells); }

    triggerComboPopup(combo) { return Anim.triggerComboPopup.call(this, combo); }

    triggerFallAnimation() { return Anim.triggerFallAnimation.call(this); }

    triggerFlipAnimation() { return Anim.triggerFlipAnimation.call(this); }

    triggerXBlockFall() { return Anim.triggerXBlockFall.call(this); }

    gainItem() {
        if (this.inventory.length >= C.MAX_INVENTORY || this.combo === 0) {
            return; // インベントリ満杯か、コンボがなければ何もしない
        }

        const probabilityData = ITEM_PROBABILITY_TABLE[this.combo] || ITEM_PROBABILITY_TABLE.default;
        const itemsToDraw = probabilityData.items;
        const noItemWeight = probabilityData.noItemWeight;

        if (itemsToDraw.length === 0 && noItemWeight > 0) {
            return;
        }

        const totalWeight = itemsToDraw.reduce((sum, item) => sum + item.weight, 0) + noItemWeight;
        const rand = Math.random() * totalWeight;

        let cumulativeWeight = 0;
        cumulativeWeight += noItemWeight;
        if (rand < cumulativeWeight) {
            return;
        }

        for (const item of itemsToDraw) {
            cumulativeWeight += item.weight;
            if (rand < cumulativeWeight) {
                this.inventory.push(item.name);
                // 取得HUDアニメ（盤面→インベントリへ飛ぶ）
                this.usedItemAnimation = { item: item.name, startTime: performance.now(), duration: 300 };
                this.inventorySlideAnimation = { startTime: performance.now(), duration: 400 };
                return;
            }
        }
    }

    riseGrid(numRows) { return GridShift.riseGrid.call(this, numRows); }
    
    dropGrid(numRows) { return GridShift.dropGrid.call(this, numRows); }
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
    updateFallingBlocks(now) { return Anim.updateFallingBlocks.call(this, now); }

    updateDroppingXBlocks(now) { return Anim.updateDroppingXBlocks.call(this, now); }
    
    gameOver() {
        this.gameOverCallback();
    }
}