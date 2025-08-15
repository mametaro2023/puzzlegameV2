import { Board } from './board.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './inputHandler.js';

export class GameController {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        
        this.renderer = new Renderer(canvas, ctx);
        this.inputHandler = new InputHandler(this);
        
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
        
        // イベントリスナーとコールバックを設定
        this.setupLobbyEvents();
        this.setupSocketEvents();
        this.player1Board.onGaugeMax(() => {
            this.socket.emit('gaugeAttack');
        });

        // 初回の背景描画
        this.renderer.draw(this.player1Board, this.player2Board);
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

    // ▼▼▼ 不要になった 'start' メソッドを削除 ▼▼▼
    // start() { ... }

    gameOver() {
        this.isRunning = false;
        alert("Game Over");
        window.location.reload();
    }

    loop() {
        if (!this.isRunning) return;
        
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.player1Board.update(deltaTime);
        
        if (this.socket.connected) {
             // ▼▼▼ 送信するデータも安全のためコピーを渡すようにする ▼▼▼
             const boardData = {
                grid: JSON.parse(JSON.stringify(this.player1Board.grid)),
                lockGrid: JSON.parse(JSON.stringify(this.player1Board.lockGrid)),
                cur: this.player1Board.cur ? JSON.parse(JSON.stringify(this.player1Board.cur)) : null,
            };
            this.socket.emit('boardUpdate', boardData);
        }

        this.renderer.draw(this.player1Board, this.player2Board);
        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }

    movePiece(dx) {
        this.player1Board.move(dx);
    }

    rotatePiece(direction) {
        this.player1Board.rotate(direction);
    }

    hardDrop() {
        this.player1Board.hardDrop();
    }

    useItem(target) {
        if (this.player1Board.inventory.length === 0 || !this.isRunning) {
            return;
        }
        const itemToUse = this.player1Board.inventory[0];
        this.player1Board.triggerItemUseAnimation();

        if (target === 'self') {
            console.log(`Using item on self: ${itemToUse}`);
            this.player1Board.applyItemEffect(itemToUse);
        } else {
            console.log(`Sending item to opponent: ${itemToUse}`);
            this.socket.emit('sendItem', { itemName: itemToUse });
        }
    }
}