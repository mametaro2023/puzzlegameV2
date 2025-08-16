// js/renderer.js

import * as C from './config.js';
import * as Utils from './utils.js';

export class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
    }

    // メインの描画関数
    draw(player1Board, player2Board) {
        const now = performance.now();
        this.ctx.save();
        
        // --- 画面全体をクリア ---
        this.ctx.clearRect(0, 0, C.CW, C.CH);

        // --- 攻撃ヒットエフェクト（赤いフラッシュ） ---
        if (player1Board.attackEffect) {
            const effect = player1Board.attackEffect;
            const progress = (now - effect.startTime) / effect.duration;
            if (progress < 1.0) {
                // 最初は明るく、すぐに消えるアルファ値
                const alpha = Math.sin(progress * Math.PI) * 0.5; // sinカーブで滑らかに
                this.ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
                this.ctx.fillRect(0, 0, C.CW, C.CH);
            }
        }        

        // --- 1. 振動オフセットを計算 ---
        let shakeX = 0, shakeY = 0;
        if (player1Board.screenShake) {
            const shake = player1Board.screenShake;
            const elapsedTime = now - shake.startTime;
            const progress = elapsedTime / shake.duration;
            if (progress < 1.0) {
                const currentMagnitude = shake.magnitude * (1 - progress * progress); // 急に始まりゆっくり終わる
                shakeX = (Math.random() - 0.5) * currentMagnitude;
                shakeY = (Math.random() - 0.5) * currentMagnitude;
            }
        }

        // --- 2. 「揺れる要素」の描画 ---
        this.ctx.save();
        this.ctx.translate(Math.round(shakeX), Math.round(shakeY));
        
        // これらの要素はフィールドと一体なので揺れる
        this.drawGridLines();
        this.drawGhostPiece(player1Board);
        this.drawBoardState(player1Board);
        this.drawFallingBlocks(player1Board, now);
        this.drawDroppingXBlocks(player1Board, now);
        this.drawParticles(player1Board);

        this.ctx.restore();


        // --- 3. 「揺れない要素」の描画 ---
        // save/restoreの外で描画するので、揺れの影響を受けない
        this.drawHardDropBlur(player1Board, now);
        this.drawCurrentPiece(player1Board); // 操作中のミノは揺れない
        this.drawUI(player1Board, now);           // NEXT, ゲージ, インベントリは揺れない

        if (player2Board) {
            this.drawPlayer2View(player2Board, now); // 相手画面も揺れない
        }
    }

    drawGridLines() {
        this.ctx.strokeStyle = '#555';
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= C.COLS; i++) {
            const x = C.OFFX + i * C.BLOCK;
            this.ctx.beginPath();
            this.ctx.moveTo(x, C.OFFY);
            this.ctx.lineTo(x, C.OFFY + C.BOARD_HEIGHT);
            this.ctx.stroke();
        }
        for (let i = 0; i <= C.ROWS; i++) {
            const y = C.OFFY + i * C.BLOCK;
            this.ctx.beginPath();
            this.ctx.moveTo(C.OFFX, y);
            this.ctx.lineTo(C.OFFX + C.BOARD_WIDTH, y);
            this.ctx.stroke();
        }
    }

    drawBoardState(board) {
        // draw only visible rows
        const rowStart = C.HIDDEN_ROWS_TOP;
        const rowEnd = C.HIDDEN_ROWS_TOP + C.ROWS;
        for (let r = rowStart; r < rowEnd; r++) {
            for (let c = 0; c < C.COLS; c++) {
                const v = board.grid[r][c];
                if (v) {
                    const x = C.OFFX + c * C.BLOCK;
                    const y = C.OFFY + (r - C.HIDDEN_ROWS_TOP) * C.BLOCK;
                    this.ctx.save();
                    if (board.lockGrid[r][c]) { this.ctx.globalAlpha = 0.5; }
                    this.drawBlock(v, x, y, C.BLOCK);
                    this.ctx.restore();
                    if (board.lockGrid[r][c]) { this.drawLockedEffect(x, y); }
                }
            }
        }
    }

    drawCurrentPiece(board) {
        if (!board.cur) return;
        for (let i = 0; i < 3; i++) {
            const x = C.OFFX + board.cur.x * C.BLOCK;
            const y = C.OFFY + (board.cur.y + i) * C.BLOCK;
            if (board.cur.y + i >= 0) {
                this.drawBlock(board.cur.cells[i], x, y, C.BLOCK);
            }
        }
    }

    drawGhostPiece(board) {
        if (!board.cur) return;
        let ghostY = Math.floor(board.cur.y);
        // avoid infinite loop when board is filled to the top of hidden rows
        if (board.collide(board.cur.x, ghostY)) return;
        while (!board.collide(board.cur.x, ghostY + 1)) {
            ghostY++;
            if (ghostY > C.ROWS + C.HIDDEN_ROWS_TOP) break;
        }
        this.ctx.globalAlpha = 0.3;
        for (let i = 0; i < 3; i++) {
            if (ghostY + i >= 0) {
                this.drawBlock(board.cur.cells[i], C.OFFX + board.cur.x * C.BLOCK, C.OFFY + (ghostY + i) * C.BLOCK, C.BLOCK);
            }
        }
        this.ctx.globalAlpha = 1.0;
    }
    
    // ▼▼▼ 修正点：第4引数にblockSizeを追加 ▼▼▼
    drawBlock(value, x, y, blockSize, brightness = 1.0) {
        this.ctx.save();
        if (value === C.P_BLOCK_ID) {
            // Pブロックのロジックは変更なし
            this.ctx.fillStyle = '#fff';
            this.ctx.fillRect(x, y, blockSize, blockSize);
            this.ctx.fillStyle = '#f00';
            this.ctx.font = `${blockSize * 0.8}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('P', x + blockSize / 2, y + blockSize / 2 + (blockSize * 0.1));
        } else {
            let color = C.COLORS[value];
            if (brightness !== 1.0) {
                color = this.adjustColorBrightness(color, brightness);
            }
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x, y, blockSize, blockSize);
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(x, y, blockSize, blockSize);
            this.drawSymbol(value, x, y, blockSize);
        }
        this.ctx.restore();
    }

    adjustColorBrightness(hex, factor) {
        hex = hex.replace('#', '');
        let r = parseInt(hex.substring(0, 2), 16);
        let g = parseInt(hex.substring(2, 4), 16);
        let b = parseInt(hex.substring(4, 6), 16);
        r = Math.round(r * factor);
        g = Math.round(g * factor);
        b = Math.round(b * factor);
        const toHex = (c) => ('0' + c.toString(16)).slice(-2);
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }    
    
    // ▼▼▼ 修正点：第4引数にblockSizeを追加 ▼▼▼
    drawSymbol(value, x, y, blockSize) {
        const padding = blockSize * 0.2;
        const size = blockSize - (padding * 2);
        const centerX = x + blockSize / 2;
        const centerY = y + blockSize / 2;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        this.ctx.lineWidth = blockSize * 0.1;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();

        switch (value) {
            case 1: this.ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2); break;
            case 2:
                this.ctx.moveTo(x + padding, y + padding);
                this.ctx.lineTo(x + blockSize - padding, y + blockSize - padding);
                this.ctx.moveTo(x + blockSize - padding, y + padding);
                this.ctx.lineTo(x + padding, y + blockSize - padding);
                break;
            case 3:
                this.ctx.moveTo(centerX, y + padding);
                this.ctx.lineTo(x + blockSize - padding, y + blockSize - padding);
                this.ctx.lineTo(x + padding, y + blockSize - padding);
                this.ctx.closePath();
                break;
            case 4:
                this.ctx.moveTo(centerX, y + padding);
                this.ctx.lineTo(x + blockSize - padding, centerY);
                this.ctx.lineTo(centerX, y + blockSize - padding);
                this.ctx.lineTo(x + padding, centerY);
                this.ctx.closePath();
                break;
            case 5: this.ctx.strokeRect(x + padding, y + padding, size, size); break;
        }
        this.ctx.stroke();
    }

    drawFallingBlocks(board, now) {
        if (board.fallingBlocks.length === 0) return;
        board.fallingBlocks.forEach(b => {
            const progress = Math.min((now - b.animStartTime) / C.FALL_ANIM_DURATION, 1.0);
            const eased = b.easing === 'easeOutBounce' ? Utils.easeOutBounce(progress) : Utils.easeOutCubic(progress);
            const fromY = C.OFFY + (b.fromR - C.HIDDEN_ROWS_TOP) * C.BLOCK;
            const toY = C.OFFY + (b.toR - C.HIDDEN_ROWS_TOP) * C.BLOCK;
            const y = fromY + (toY - fromY) * eased;
            const x = C.OFFX + b.col * C.BLOCK;
            this.ctx.save();
            if (b.isLocked) { this.ctx.globalAlpha = 0.5; }
            this.drawBlock(b.value, x, y, C.BLOCK); // 通常サイズを渡す
            this.ctx.restore();
            if (b.isLocked) { this.drawLockedEffect(x, y); }
        });
    }

    drawDroppingXBlocks(board, now) {
        if (board.droppingXBlocks.length === 0) return;
        board.droppingXBlocks.forEach(b => {
            const progress = Math.min((now - b.animStartTime) / C.FALL_ANIM_DURATION, 1.0);
            const fromY = C.OFFY + (b.fromR - C.HIDDEN_ROWS_TOP) * C.BLOCK;
            const toY = C.OFFY + (b.toR - C.HIDDEN_ROWS_TOP) * C.BLOCK;
            const y = fromY + (toY - fromY) * Utils.easeOutBounce(progress);
            const x = C.OFFX + b.col * C.BLOCK;
            this.ctx.save();
            this.ctx.globalAlpha = 0.5;
            this.drawBlock(b.value, x, y, C.BLOCK); // 通常サイズを渡す
            this.ctx.restore();
            this.drawLockedEffect(x, y);
        });
    }

    drawParticles(board) {
        board.particles.forEach(p => {
            const x = p.x;
            const y = p.y;
            this.ctx.save();
            this.ctx.globalAlpha = p.lifetime / 50;
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
            this.ctx.restore();
        });
    }

    drawLockedEffect(x, y) {
        const now = performance.now();
        const alpha = 0.5 + Math.sin(now / 500) * 0.25;
        this.ctx.save();
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 5, y + 5);
        this.ctx.lineTo(x + C.BLOCK - 5, y + C.BLOCK - 5);
        this.ctx.moveTo(x + C.BLOCK - 5, y + 5);
        this.ctx.lineTo(x + 5, y + C.BLOCK - 5);
        this.ctx.stroke();
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 5, y + 5);
        this.ctx.lineTo(x + C.BLOCK - 5, y + C.BLOCK - 5);
        this.ctx.moveTo(x + C.BLOCK - 5, y + 5);
        this.ctx.lineTo(x + 5, y + C.BLOCK - 5);
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawUI(board, now) {
        // --- NEXT Queue ---
        this.ctx.font = '30px sans-serif';
        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'alphabetic';
        this.ctx.fillText('NEXT', C.NEXT_X, C.OFFY);

        this.drawNextMinos(board);

        // --- Gauge ---
        const gaugeHeight = C.BOARD_HEIGHT;
        this.ctx.fillStyle = '#555';
        this.ctx.fillRect(C.GAUGE_X, C.OFFY, C.BLOCK * 0.8, gaugeHeight);
        const fillH = gaugeHeight * (board.displayGauge / 100);
        this.ctx.fillStyle = '#f00';
        this.ctx.fillRect(C.GAUGE_X, C.OFFY + (gaugeHeight - fillH), C.BLOCK * 0.8, fillH);
        this.ctx.strokeStyle = '#fff';
        this.ctx.strokeRect(C.GAUGE_X, C.OFFY, C.BLOCK * 0.8, gaugeHeight);
        
        // --- Inventory ---
        this.drawInventory(board, now);
    }
    
    drawNextMinos(board) {
        if (board.nextQueue.length === 0) return;

        const anim = board.nextMinoAnimation;
        const next1 = board.nextQueue[0];
        const next2 = board.nextQueue[1];

        // --- 各ポジションの基本座標を定義 ---
        const pos1 = { x: C.NEXT_X, y: C.OFFY + 20 };
        const pos2 = { x: C.NEXT_X + C.BLOCK * 0.4, y: C.OFFY + 20 + C.BLOCK * 0.4 };

        // --- 1. 影の描画 ---
        // 1個目のミノの最終位置に、うっすらとした黒い影を直接描画する
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; // 半透明の黒
        for (let i = 0; i < 3; i++) {
            const y = pos1.y + i * (C.BLOCK + 2);
            // 影の位置を少しずらす
            this.ctx.fillRect(pos1.x + 4, y + 4, C.BLOCK, C.BLOCK);
        }
        this.ctx.restore();

        // --- 2. 後ろにあるミノ（2個目）から先に描画する ---
        if (anim && anim.progress < 1.0) {
            // --- アニメーション中の描画 ---

            // 2-1. フェードイン中のミノ (現在のnext2) を描画
            if (next2) {
                this.ctx.globalAlpha = anim.progress;
                this.drawSingleNextMino(next2, pos2.x, pos2.y, C.BLOCK, 0.4); // 暗いままフェードイン
                this.ctx.globalAlpha = 1.0;
            }

        } else {
            // --- 静止時の描画 ---
            
            // 2-2. 静止している2個目のミノを描画
            if (next2) {
                this.drawSingleNextMino(next2, pos2.x, pos2.y, C.BLOCK, 0.4);
            }
        }

        // --- 3. 手前にあるミノ（1個目）を最後に描画する ---
        if (anim && anim.progress < 1.0) {
            // --- アニメーション中の描画 ---

            // 3-1. スライド中のミノ (現在のnext1) を描画
            const slideX = pos2.x + (pos1.x - pos2.x) * anim.progress;
            const slideY = pos2.y + (pos1.y - pos2.y) * anim.progress;
            this.drawSingleNextMino(next1, slideX, slideY, C.BLOCK);

        } else {
            // --- 静止時の描画 ---

            // 3-2. 静止している1個目のミノを描画
            this.drawSingleNextMino(next1, pos1.x, pos1.y, C.BLOCK);
        }
    }

    // NEXTミノ一つを描画する処理を共通化
    drawSingleNextMino(mino, x, y, blockSize, brightness = 1.0) {
        if (!mino) return;
        for (let i = 0; i < 3; i++) {
            const blockY = y + i * (blockSize + 2);
            this.drawBlock(mino.cells[i], x, blockY, blockSize, brightness);
        }
    }

    drawInventory(board, now) {
        const invY = C.OFFY + C.BOARD_HEIGHT + 15;
        const itemSlotWidth = C.BOARD_WIDTH / C.MAX_INVENTORY;
        const itemGap = itemSlotWidth * 0.1;
        const itemSize = itemSlotWidth - itemGap;

        for (let i = 0; i < C.MAX_INVENTORY; i++) {
            const bgX = C.OFFX + i * itemSlotWidth + itemGap / 2;
            this.ctx.fillStyle = '#555';
            this.ctx.fillRect(bgX, invY, itemSize, itemSize);
            this.ctx.strokeStyle = '#fff';
            this.ctx.strokeRect(bgX, invY, itemSize, itemSize);
        }
        
        if (board.usedItemAnimation) {
            const p = Math.min((now - board.usedItemAnimation.startTime) / board.usedItemAnimation.duration, 1.0);
            const scale = 1 + p * 0.5;
            const alpha = 1 - p;
            const animX = C.OFFX + itemSize / 2 + itemGap / 2;
            const animY = invY + itemSize / 2;
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.translate(animX, animY);
            this.ctx.scale(scale, scale);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = `${itemSize * 0.6}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(board.usedItemAnimation.item, 0, 0);
            this.ctx.restore();
        }

        for (let i = 0; i < board.inventory.length; i++) {
            const startX = C.OFFX + (i + 1) * itemSlotWidth + itemGap / 2;
            const endX = C.OFFX + i * itemSlotWidth + itemGap / 2;
            let currentX = endX;

            if (board.inventorySlideAnimation) {
                const p = Math.min((now - board.inventorySlideAnimation.startTime) / board.inventorySlideAnimation.duration, 1.0);
                currentX = startX - (startX - endX) * Utils.easeInOutCubic(p);
            }
            
            this.ctx.fillStyle = '#fff';
            this.ctx.font = `${itemSize * 0.7}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(board.inventory[i], currentX + itemSize / 2, invY + itemSize / 2);
        }
    }

    drawHardDropBlur(board, now) {
        const blur = board.hardDropBlur;
        if (!blur) return;
        const elapsedTime = now - blur.startTime;
        const duration = 150;
        if (elapsedTime > duration) return;
        const alpha = 0.6 * (1 - (elapsedTime / duration));
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        const x = C.OFFX + blur.x * C.BLOCK;
        for (let i = 0; i < 3; i++) {
            const value = blur.cells[i];
            if (value > 0) {
                const startY = C.OFFY + (blur.fromY + i) * C.BLOCK;
                const endY = C.OFFY + (blur.toY + i) * C.BLOCK;
                const height = Math.max(0, endY - startY);
                if (height > 0) {
                    this.ctx.fillStyle = C.COLORS[value];
                    this.ctx.fillRect(x, startY, C.BLOCK, height);
                }
            }
        }
        this.ctx.restore();
    }
    
    drawPlayer2View(board, now) {
        if (!board) return;
        
        const p2BlockSize = Math.floor(200 / C.COLS);
        const p2BoardWidth = p2BlockSize * C.COLS;
        const p2BoardHeight = p2BlockSize * C.ROWS;
        const p2ViewY = C.OFFY;

        this.ctx.save();
        this.ctx.translate(C.P2_VIEW_X, p2ViewY);

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, p2BoardWidth, p2BoardHeight);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(0, 0, p2BoardWidth, p2BoardHeight);
        
        // 固定ブロック
        const rowStart = C.HIDDEN_ROWS_TOP;
        const rowEnd = C.HIDDEN_ROWS_TOP + C.ROWS;
        for (let r = rowStart; r < rowEnd; r++) {
            for (let c = 0; c < C.COLS; c++) {
                const v = board.grid[r][c];
                if (v) {
                    this.drawBlock(v, c * p2BlockSize, (r - C.HIDDEN_ROWS_TOP) * p2BlockSize, p2BlockSize);
                }
            }
        }
        // 操作中ブロック
        if (board.cur) {
            for (let i = 0; i < 3; i++) {
                if (board.cur.y + i >= 0) {
                    this.drawBlock(board.cur.cells[i], board.cur.x * p2BlockSize, (board.cur.y + i) * p2BlockSize, p2BlockSize);
                }
            }
        }
        this.ctx.restore();
    }
}