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
        this.createRoomButton = document.getElementById('create-room-button');
        this.enterRoomButton = document.getElementById('enter-room-button');
        this.createButton = document.getElementById('create-button');
        this.refreshRoomsButton = document.getElementById('refresh-rooms');
        this.roomList = document.getElementById('room-list');
        this.roomInput = document.getElementById('room-input');
        this.statusText = document.getElementById('status-text');
        this.statusOverlay = document.getElementById('status-overlay');
        this.preGameControls = document.getElementById('pre-game-controls');
        this.btnStart = document.getElementById('btn-start');
        this.btnLeave = document.getElementById('btn-leave');
        this.resultOverlay = document.getElementById('result-overlay');
        this.resultText = document.getElementById('result-text');
        this.btnCloseResult = document.getElementById('btn-close-result');
        
        // イベントリスナーとコールバックを設定
        this.setupLobbyEvents();
        this.setupSocketEvents();
        this.player1Board.onGaugeMax(() => {
            this.socket.emit('gaugeAttack');
        });
        this.player1Board.onGameOver(this.gameOver.bind(this));

        // 初回の背景描画
        this.renderer.draw(this.player1Board, this.player2Board);
    }        

    setupLobbyEvents() {
        this.createRoomButton.addEventListener('click', () => {
            this.titleScreen.classList.add('hidden');
            this.roomScreen.classList.remove('hidden');
        });

        this.enterRoomButton.addEventListener('click', () => {
            this.titleScreen.classList.add('hidden');
            document.getElementById('room-list-screen').classList.remove('hidden');
            if (!this.socket.connected) this.socket.connect();
            this.socket.emit('getRooms');
        });

        this.createButton.addEventListener('click', () => {
            const roomName = this.roomInput.value.trim();
            if (roomName) {
                if (!this.socket.connected) this.socket.connect();
                this.socket.emit('joinRoom', roomName);
                this.titleScreen.classList.add('hidden');
                this.roomScreen.classList.add('hidden');
                this.statusOverlay.style.display = 'block';
                this.statusText.textContent = '準備中...';
            }
        });

        this.refreshRoomsButton.addEventListener('click', () => {
            if (!this.socket.connected) this.socket.connect();
            this.socket.emit('getRooms');
        });

        this.btnStart.addEventListener('click', () => {
            this.socket.emit('hostStartGame');
        });

        this.btnLeave.addEventListener('click', () => {
            this.socket.emit('leaveRoom');
            // UIリセットしてロビーへ
            this.resetToLobby();
        });

        this.btnCloseResult.addEventListener('click', () => {
            this.resultOverlay.style.display = 'none';
            this.statusOverlay.style.display = 'block';
        });
    }  

    setupSocketEvents() {
        this.socket.on('roomReady', (data) => {
            // 準備状態: ボタン表示（ホストのみ開始ボタン可視）
            this.lobbyOverlay.classList.add('hidden');
            this.statusOverlay.style.display = 'block';
            const isHost = this.socket.id === data.hostId;
            this.btnStart.classList.toggle('hidden', !isHost);
            this.preGameControls.style.display = 'block';
            this.statusText.textContent = data.members.length < 2 ? '相手を待っています...' : '開始できます';
            // ゲームループは開始しない
        });

        this.socket.on('gameStart', (data) => {
            this.statusOverlay.style.display = 'none';
            this.preGameControls.style.display = 'none';
            this.startMatch(); 
            // ゲーム中は退出/開始ボタンは非表示
        });

        this.socket.on('opponentUpdate', (opponentData) => {
            this.player2Board.grid = JSON.parse(JSON.stringify(opponentData.grid));
            this.player2Board.lockGrid = JSON.parse(JSON.stringify(opponentData.lockGrid));
            this.player2Board.cur = opponentData.cur ? JSON.parse(JSON.stringify(opponentData.cur)) : null;
        });
        
        this.socket.on('opponentDisconnect', () => {
            this.statusOverlay.style.display = 'block';
            this.preGameControls.style.display = 'block';
            this.statusText.textContent = '相手が離脱しました。準備中...';
            this.player2Board.init();
        });

        this.socket.on('receiveItem', (data) => {
            this.player1Board.applyItemEffect(data.itemName);
        });

        this.socket.on('receiveAttack', () => {
            this.player1Board.riseGrid(1);
            this.player1Board.triggerAttackEffect();
        });        

        this.socket.on('roomsList', (rooms) => {
            this.roomList.innerHTML = '';
            if (!rooms || rooms.length === 0) {
                const p = document.createElement('p');
                p.style.color = '#fff';
                p.textContent = '参加可能な部屋がありません';
                this.roomList.appendChild(p);
                return;
            }
            rooms.forEach(r => {
                const btn = document.createElement('button');
                btn.textContent = `${r.name}（${r.count}/2）`;
                btn.style.margin = '6px';
                btn.addEventListener('click', () => {
                    this.socket.emit('joinRoom', r.name);
                    document.getElementById('room-list-screen').classList.add('hidden');
                    this.statusOverlay.style.display = 'block';
                    this.statusText.textContent = '準備中...';
                });
                this.roomList.appendChild(btn);
            });
        });

        this.socket.on('gameOver', ({ winnerId, loserId }) => {
            const isWinner = this.socket.id === winnerId;
            this.isRunning = false;
            this.resultText.textContent = isWinner ? 'You Win!' : 'You Lose...';
            this.resultOverlay.style.display = 'block';
            // 次の開始まで準備状態に戻る（サーバ側からroomReadyが届く）
        });
    }

    resetToLobby() {
        // 画面戻し
        this.lobbyOverlay.classList.remove('hidden');
        this.titleScreen.classList.remove('hidden');
        this.roomScreen.classList.add('hidden');
        document.getElementById('room-list-screen').classList.add('hidden');
        this.statusOverlay.style.display = 'none';
        this.preGameControls.style.display = 'none';
        this.resultOverlay.style.display = 'none';
        // ゲーム停止
        this.isRunning = false;
        this.player1Board.init();
        this.player2Board.init();
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