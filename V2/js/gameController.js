import { Board } from './board.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './inputHandler.js';
import { AnimationManager } from './animationManager.js'; // AnimationManagerをインポート


export class GameController {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        
        this.renderer = new Renderer(canvas, ctx);
        this.inputHandler = new InputHandler(this);
        this.animationManager = new AnimationManager();
        
        this.player1Board = new Board(true);
        this.player2Board = new Board(false);
        this.isRunning = false;
        this.animationFrameId = null;

        this.socket = io({ autoConnect: false });

        // UI要素の取得
        this.lobbyOverlay = document.getElementById('lobby-overlay');
        this.titleScreen = document.getElementById('title-screen');
        this.roomScreen = document.getElementById('room-screen');
        this.playButton = document.getElementById('play-button');
        this.joinButton = document.getElementById('join-button');
        this.roomInput = document.getElementById('room-input');
        this.statusText = document.getElementById('status-text');
        this.statusOverlay = document.getElementById('status-overlay');
        
        this.setupLobbyEvents();
        this.setupSocketEvents();
        this.player1Board.onGaugeMax(() => {
            this.socket.emit('gaugeAttack');
            this.animationManager.setGaugeAttackAnimation(
                this.player1Board.displayGauge,
                this.player1Board.gauge
            );
        });

        this.renderer.draw(this.player1Board, this.player2Board, this.animationManager);
    }       

    setupLobbyEvents() {
        this.playButton.addEventListener('click', () => {
            this.titleScreen.classList.add('hidden');
            this.roomScreen.classList.remove('hidden');
        });

        this.joinButton.addEventListener('click', () => {
            const roomName = this.roomInput.value.trim();
            if (roomName) {
                this.socket.connect();
                this.socket.emit('joinRoom', roomName);
                this.lobbyOverlay.classList.add('hidden');
                this.startPractice();
            }
        });
    }  

    setupSocketEvents() {
        this.socket.on('waiting', () => {
            this.statusOverlay.style.display = 'block';
            this.statusText.textContent = 'マッチング相手を探しています...';
        });

        this.socket.on('gameStart', (data) => {
            console.log(`Match found in room: ${data.roomName}.`);
            this.statusOverlay.style.display = 'none';
            this.startMatch(); 
        });

        this.socket.on('opponentUpdate', (opponentData) => {
            // JSONを介してデータの完全なコピー（ディープコピー）を作成する
            this.player2Board.grid = JSON.parse(JSON.stringify(opponentData.grid));
            this.player2Board.lockGrid = JSON.parse(JSON.stringify(opponentData.lockGrid));
            this.player2Board.cur = opponentData.cur ? JSON.parse(JSON.stringify(opponentData.cur)) : null;
        });
        
        this.socket.on('opponentDisconnect', () => {
            this.statusOverlay.style.display = 'block';
            this.statusText.textContent = '相手が切断しました。マッチングを待っています...';
            // 相手ボードをリセット
            this.player2Board.init();
        });

        this.socket.on('receiveItem', (data) => {
            console.log(`Received item from opponent: ${data.itemName}`);
            this.player1Board.applyItemEffect(data.itemName);
        });

        this.socket.on('receiveAttack', () => {
            console.log("Received gauge attack from opponent!");
            this.player1Board.riseGrid(1);
            this.player1Board.triggerAttackEffect();
        });        
    }

    startPractice() {
        console.log("Starting practice mode...");
        this.inputHandler.init();
        this.player1Board.init();
        this.player2Board.grid.forEach(row => row.fill(0));
        
        this.isRunning = true;
        this.lastTime = performance.now();
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.loop();
    }
    
    startMatch() {
        console.log("Starting match!");
        this.player1Board.init();
        this.player2Board.init();
        this.isRunning = true;
    }


    gameOver() {
        this.isRunning = false;
        alert("Game Over");
        window.location.reload();
    }

    loop() {
        if (!this.isRunning) return;
        const now = performance.now();
        const deltaTime = (now - this.lastTime) / 1000;
        this.lastTime = now;

        this.animationManager.update(now);
        this.player1Board.update(deltaTime);
        this.syncAnimations();

        if (this.socket.connected) {
            const boardData = { /* ... */ };
            this.socket.emit('boardUpdate', boardData);
        }

        this.renderer.draw(this.player1Board, this.player2Board, this.animationManager);
        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }

    syncAnimations() {
        // AnimationManagerで計算された表示用のゲージ値を、Boardのプロパティに反映
        if (this.animationManager.gaugeAnimation) {
            this.player1Board.displayGauge = this.animationManager.gaugeAnimation.currentValue;
        }

        // 時間が経過した一時的なエフェクトをクリアする
        const now = performance.now();
        if (this.animationManager.hardDropBlur && now - this.animationManager.hardDropBlur.startTime > 150) {
            this.animationManager.hardDropBlur = null;
        }
        if (this.animationManager.screenShake && now - this.animationManager.screenShake.startTime > this.animationManager.screenShake.duration) {
            this.animationManager.screenShake = null;
        }
        if (this.animationManager.attackEffect && now - this.animationManager.attackEffect.startTime > this.animationManager.attackEffect.duration) {
            this.animationManager.attackEffect = null;
        }
        if (this.animationManager.usedItemAnimation && now - this.animationManager.usedItemAnimation.startTime > this.animationManager.usedItemAnimation.duration) {
            this.animationManager.usedItemAnimation = null;
        }
        if (this.animationManager.inventorySlideAnimation && now - this.animationManager.inventorySlideAnimation.startTime > this.animationManager.inventorySlideAnimation.duration) {
            this.animationManager.inventorySlideAnimation = null;
        }
    }

    handleAnimationInfo(info) {
        if (!info) return;

        switch (info.type) {
            case 'shake':
                this.animationManager.triggerScreenShake(info.magnitude, info.duration);
                break;
            case 'gaugeSet':
                this.animationManager.setGauge(this.player1Board.displayGauge, info.value);
                break;
            case 'gaugeReset':
                this.animationManager.setGaugeReset(this.player1Board.displayGauge);
                break;
            // 今後、'flip'や'x-fall'などの新しいアニメーションタイプを追加できる
        }
    }

    movePiece(dx) {
        this.player1Board.move(dx);
    }

    rotatePiece(direction) {
        this.player1Board.rotate(direction);
    }

    hardDrop() {
        const result = this.player1Board.hardDrop();
        if (result) {
            this.animationManager.triggerHardDropBlur(result.fromY, result.toY, result.x, result.cells);
            this.handleLockResult(result.lockResult);
        }
    }

    lockPiece() {
        const lockResult = this.player1Board.lockPiece();
        this.handleLockResult(lockResult);
    }

    handleLockResult(lockResult) {
        if (!lockResult) return;

        // 消えたブロックのパーティクルを生成
        if (lockResult.clearedBlocks.length > 0) {
            lockResult.clearedBlocks.forEach(b => {
                this.animationManager.createParticles(b.r, b.c, b.value);
            });
        }
        // 落下するブロックのアニメーションをセット
        if (lockResult.fallingBlocks.length > 0) {
            this.animationManager.fallingBlocks = lockResult.fallingBlocks;
            // 落下アニメーションが終わった後に、再度消去チェックを行う
            setTimeout(() => this.handleLockResult(this.player1Board.startClear()), 350);
        }
    }

    useItem(target) {
        if (this.player1Board.inventory.length === 0 || !this.isRunning) return;
        
        const itemToUse = this.player1Board.inventory[0]; // 先に名前を取得
        this.animationManager.triggerItemUse(itemToUse); // アニメーションを開始
        this.player1Board.inventory.shift(); // Boardのインベントリから削除

        if (target === 'self') {
            console.log(`Using item on self: ${itemToUse}`);
            const animInfo = this.player1Board.applyItemEffect(itemToUse);
            this.handleAnimationInfo(animInfo);
        } else {
            console.log(`Sending item to opponent: ${itemToUse}`);
            this.socket.emit('sendItem', { itemName: itemToUse });
        }
    }
}