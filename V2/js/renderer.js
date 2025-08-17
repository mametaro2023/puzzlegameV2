// js/renderer.js

import * as C from './config.js';
import * as Utils from './utils.js';

export class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.pixelScale = 1;
        this.isPortrait = false;
    }

    setScale(pixelScale, isPortrait) {
        this.pixelScale = pixelScale || 1;
        this.isPortrait = !!isPortrait;
    }

    // メインの描画関数
    draw(player1Board, player2Board) {
        const now = performance.now();
        // 固定スケール（スケーリング無効化）
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        
        // --- 画面全体をクリア（論理座標） ---
        this.ctx.clearRect(0, 0, C.CW, C.CH);

        // --- 攻撃ヒットエフェクト（柔らかいパルス/ショックウェーブ） ---
        if (player1Board.attackEffect) {
            const effect = player1Board.attackEffect;
            const progress = (now - effect.startTime) / effect.duration;
            if (progress < 1.0) {
                const p = Math.max(0, Math.min(1, progress));
                const eased = Utils.easeOutCubic(p);
                const cx = C.OFFX + C.BOARD_WIDTH / 2;
                const cy = C.OFFY + C.BOARD_HEIGHT / 2;
                const maxR = Math.hypot(C.BOARD_WIDTH, C.BOARD_HEIGHT) * 0.5;
                const r = maxR * eased;

                this.ctx.save();
                // 盤面内に限定
                this.ctx.beginPath();
                this.ctx.rect(C.OFFX, C.OFFY, C.BOARD_WIDTH, C.BOARD_HEIGHT);
                this.ctx.clip();

                // 穏やかな白パルス（中心から淡く広がる）
                const g = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                g.addColorStop(0, 'rgba(255,255,255,0.18)');
                g.addColorStop(1, 'rgba(255,255,255,0.00)');
                this.ctx.fillStyle = g;
                this.ctx.fillRect(C.OFFX, C.OFFY, C.BOARD_WIDTH, C.BOARD_HEIGHT);

                // ショックウェーブのリング
                this.ctx.globalAlpha = 0.18 * (1 - eased);
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 6 * (1 - eased) + 2;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
                this.ctx.stroke();

                this.ctx.restore();
            }
        }        

        // --- 1. 振動オフセットを計算 ---
        let shakeX = 0, shakeY = 0;
        if (player1Board.screenShake) {
            const shake = player1Board.screenShake;
            const elapsedTime = now - shake.startTime;
            const progress = elapsedTime / shake.duration;
            if (progress < 1.0) {
                // 減衰エンベロープ
                const envelope = Math.pow(1 - progress, 2);
                // 疑似ノイズ（周期をずらしたサイン合成）
                const t = now / 1000; // 秒
                // 方向性（イベントに応じて横/縦の比率を渡せるようにする。既定は等方）
                const dirX = shake.dirX ?? 1.0;
                const dirY = shake.dirY ?? 1.0;
                // 基本振幅
                const amp = (shake.magnitude ?? 8) * envelope;
                // ノイズ生成
                const nx = Math.sin(t * 17.0) * 0.6 + Math.sin(t * 29.0) * 0.3 + Math.sin(t * 43.0) * 0.1;
                const ny = Math.sin((t + 0.37) * 19.0) * 0.6 + Math.sin((t + 0.11) * 31.0) * 0.3 + Math.sin((t + 0.57) * 47.0) * 0.1;
                shakeX = amp * dirX * nx;
                shakeY = amp * dirY * ny;
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
        // 横移動モーションブラー（軽め、水平スワイプ）
        if (player1Board.moveBlur) {
            const blur = player1Board.moveBlur;
            const p = Math.min((now - blur.startTime) / blur.duration, 1.0);
            if (p < 1.0) {
                const fromX = C.OFFX + blur.fromX * C.BLOCK;
                const toX = C.OFFX + blur.toX * C.BLOCK;
                const baseY = C.OFFY + blur.yBase * C.BLOCK;
                const alpha = 0.25 * (1 - p);
                this.ctx.save();
                this.ctx.globalAlpha = alpha;
                const steps = 4;
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const x = fromX + (toX - fromX) * t;
                    for (let i = 0; i < 3; i++) {
                        const y = baseY + i * C.BLOCK;
                        const v = blur.cells[i];
                        if (v > 0) this.drawBlock(v, x, y, C.BLOCK);
                    }
                }
                this.ctx.restore();
            } else {
                player1Board.moveBlur = null;
            }
        }

        this.drawUI(player1Board, now);           // NEXT, ゲージ, インベントリは揺れない

        // カウントダウン描画
        if (this.countdown) {
            const elapsed = now - this.countdown.startTime;
            const per = this.countdown.per;
            const total = this.countdown.total;
            const remaining = Math.max(0, total - Math.floor(elapsed / per));
            const phaseT = (elapsed % per) / per; // 0..1
            const scale = 1.0 + 0.6 * (1 - Utils.easeOutCubic(phaseT));
            const alpha = 0.9 * (1 - phaseT);
            const text = remaining >= 1 ? String(remaining) : 'GO!';

            this.ctx.save();
            const cx = C.OFFX + C.BOARD_WIDTH / 2;
            const cy = C.OFFY + C.BOARD_HEIGHT / 2;
            this.ctx.translate(cx, cy);
            this.ctx.scale(scale, scale);
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.font = '120px sans-serif';
            this.ctx.fillText(text, 0, 0);
            this.ctx.restore();
        }

        if (player2Board) {
            this.drawPlayer2View(player2Board, now); // 相手画面も揺れない
        }

        // --- 消去の段階演出（弾ける→拡散→消失：フェードなし） ---
        if (player1Board.clearingCells && player1Board.clearingCells.length > 0) {
            const t = Math.min((now - player1Board.clearingCells[0].startTime) / C.CLEAR_STAGE_DURATION, 1.0);
            const explode = Utils.easeOutCubic(Math.min(t / 0.5, 1.0)); // 0..0.5 区間で完了
            this.ctx.save();
            player1Board.clearingCells.forEach(cell => {
                const baseX = C.OFFX + cell.c * C.BLOCK;
                const baseY = C.OFFY + (cell.r - C.HIDDEN_ROWS_TOP) * C.BLOCK;
                const spreadX = cell.offX * explode;
                const spreadY = cell.offY * explode;
                // スクイーズ→ポップアップ（フェードなし）
                let scale;
                if (t < 0.2) {
                    scale = 1 - 0.12 * (t / 0.2);
                } else if (t < 0.5) {
                    scale = 1 + 0.25 * ((t - 0.2) / 0.3);
                } else {
                    scale = 0; // 以降は描画しない
                }
                if (scale > 0) {
                    this.ctx.save();
                    this.ctx.globalAlpha = 0.95; // フェードしない
                    this.ctx.translate(baseX + C.BLOCK / 2 + spreadX, baseY + C.BLOCK / 2 + spreadY);
                    this.ctx.rotate(cell.rotDir * explode);
                    this.ctx.scale(scale, scale);
                    this.ctx.translate(-C.BLOCK / 2, -C.BLOCK / 2);
                    this.drawBlock(cell.color, 0, 0, C.BLOCK);
                    // スターバースト
                    this.ctx.strokeStyle = 'rgba(255,255,255,0.6)';
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    const rays = 6;
                    for (let i = 0; i < rays; i++) {
                        const ang = (Math.PI * 2 * i) / rays + cell.rotDir;
                        const len = 6 + 16 * explode;
                        this.ctx.moveTo(C.BLOCK / 2, C.BLOCK / 2);
                        this.ctx.lineTo(C.BLOCK / 2 + Math.cos(ang) * len, C.BLOCK / 2 + Math.sin(ang) * len);
                    }
                    this.ctx.stroke();
                    this.ctx.restore();
                }
            });
            this.ctx.restore();
            if (t >= 0.6) player1Board.clearingCells = [];
        }

        // --- コンボポップアップ ---
        if (player1Board.comboPopup) {
            const pop = player1Board.comboPopup;
            const t = Math.min((now - pop.startTime) / pop.duration, 1.0);
            const up = Utils.easeOutCubic(t);
            const alpha = 1 - t;
            const cx = C.OFFX + C.BOARD_WIDTH / 2;
            const cy = C.OFFY + 40 - up * 20;
            const scale = 1 + Math.min(pop.combo, 5) * 0.05; // コンボが増えると少し大きく
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.translate(cx, cy);
            this.ctx.scale(scale, scale);
            this.ctx.fillStyle = pop.combo >= 4 ? '#ffee88' : '#ffffff';
            this.ctx.font = pop.combo >= 6 ? '48px sans-serif' : '36px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(`Combo x${pop.combo}`, 0, 0);
            this.ctx.restore();
            if (t >= 1.0) player1Board.comboPopup = null;
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
            this.drawBlock(board.cur.cells[i], x, y, C.BLOCK);
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
            this.drawBlock(board.cur.cells[i], C.OFFX + board.cur.x * C.BLOCK, C.OFFY + (ghostY + i) * C.BLOCK, C.BLOCK);
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
        // 背景
        this.ctx.fillStyle = 'rgba(85,85,85,0.6)';
        this.ctx.fillRect(C.GAUGE_X, C.OFFY, C.BLOCK * 0.8, gaugeHeight);
        // 塗り
        const fillH = gaugeHeight * (board.displayGauge / 100);
        const gy = C.OFFY + (gaugeHeight - fillH);
        const gx = C.GAUGE_X;
        const gw = C.BLOCK * 0.8;
        // グラデーション塗り
        const grad = this.ctx.createLinearGradient(0, gy, 0, gy + fillH);
        grad.addColorStop(0, '#79a7ff');
        grad.addColorStop(1, '#416bff');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(gx, gy, gw, fillH);
        // 外枠
        this.ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        this.ctx.strokeRect(C.GAUGE_X, C.OFFY, C.BLOCK * 0.8, gaugeHeight);
        // ハイライト
        this.ctx.save();
        this.ctx.globalAlpha = 0.15 + 0.25 * (board.displayGauge / 100);
        this.ctx.fillStyle = '#cfe2ff';
        this.ctx.fillRect(gx, gy, gw, Math.min(10, fillH));
        this.ctx.restore();
        // ティック/しきい値のきらめき
        const ticks = 5;
        for (let i = 1; i < ticks; i++) {
            const ty = C.OFFY + (gaugeHeight / ticks) * i;
            this.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            this.ctx.beginPath();
            this.ctx.moveTo(C.GAUGE_X, ty);
            this.ctx.lineTo(C.GAUGE_X + gw, ty);
            this.ctx.stroke();
        }
        // 臨界域のパルス（80%以上）
        if (board.displayGauge >= 80) {
            const pulse = Math.sin(performance.now() / 200) * 0.5 + 0.5; // 0..1
            this.ctx.save();
            this.ctx.globalAlpha = 0.15 + 0.15 * pulse;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(gx - 2, gy - 4, gw + 4, 6);
            this.ctx.restore();
        }
        // 100%到達時の縁光
        if (Math.floor(board.displayGauge) === 100) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.35;
            this.ctx.strokeStyle = '#cfe2ff';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(C.GAUGE_X - 2, C.OFFY - 2, gw + 4, gaugeHeight + 4);
            this.ctx.restore();
        }
        
        // --- Inventory ---
        this.drawInventory(board, now);
    }
    
    drawNextMinos(board) {
        if (board.nextQueue.length === 0) return;

        const anim = board.nextMinoAnimation;
        const next1 = board.nextQueue[0];
        const next2 = board.nextQueue[1];

        const pos1 = { x: C.NEXT_X, y: C.OFFY + 20 };
        const pos2 = { x: C.NEXT_X + C.BLOCK * 0.4, y: C.OFFY + 20 + C.BLOCK * 0.4 };

        // グロー背景
        this.ctx.save();
        const glow = this.ctx.createLinearGradient(pos1.x, pos1.y, pos1.x + C.BLOCK, pos1.y + C.BLOCK * 3);
        glow.addColorStop(0, 'rgba(65,107,255,0.15)');
        glow.addColorStop(1, 'rgba(121,167,255,0.05)');
        this.ctx.fillStyle = glow;
        this.ctx.fillRect(pos1.x - 10, pos1.y - 10, C.BLOCK + 20, C.BLOCK * 3 + 20);
        this.ctx.restore();

        // 影
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        for (let i = 0; i < 3; i++) {
            const y = pos1.y + i * (C.BLOCK + 2);
            this.ctx.fillRect(pos1.x + 4, y + 4, C.BLOCK, C.BLOCK);
        }
        this.ctx.restore();

        // 後ろ（2個目）
        if (anim && anim.progress < 1.0) {
            if (next2) {
                // 奥側は軽く上下にパララックス
                const wobble = Math.sin(performance.now() / 600) * 2;
                this.ctx.globalAlpha = anim.progress * 0.8;
                this.drawSingleNextMino(next2, pos2.x, pos2.y + wobble, C.BLOCK, 0.5);
                this.ctx.globalAlpha = 1.0;
            }
        } else {
            if (next2) {
                const wobble = Math.sin(performance.now() / 600) * 2;
                this.drawSingleNextMino(next2, pos2.x, pos2.y + wobble, C.BLOCK, 0.5);
            }
        }

        // 手前（1個目）
        if (anim && anim.progress < 1.0) {
            const slideX = pos2.x + (pos1.x - pos2.x) * anim.progress;
            const slideY = pos2.y + (pos1.y - pos2.y) * anim.progress;
            this.drawSingleNextMino(next1, slideX, slideY, C.BLOCK);
        } else {
            // 先頭は僅かなバウンス
            const bounce = Math.sin(performance.now() / 400) * 1.5;
            this.drawSingleNextMino(next1, pos1.x, pos1.y + bounce, C.BLOCK);
        }

        // ハイライト枠
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        this.ctx.strokeRect(pos1.x - 6, pos1.y - 6, C.BLOCK + 12, C.BLOCK * 3 + 12);
        this.ctx.restore();
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
        // レイアウト切替: ポートレート時は盤面下に配置
        const p2ViewY = C.OFFY;
        const p2ViewX = C.P2_VIEW_X;

        this.ctx.save();
        this.ctx.translate(p2ViewX, p2ViewY);

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
                this.drawBlock(board.cur.cells[i], board.cur.x * p2BlockSize, (board.cur.y + i) * p2BlockSize, p2BlockSize);
            }
        }
        this.ctx.restore();
    }
}