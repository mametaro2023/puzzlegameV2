export class InputHandler {
    constructor(gameController) {
        this.controller = gameController;
        this._initialized = false;
        this._onKeyDown = null;
        this._onKeyUp = null;
    }

    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Keyboard
        this._onKeyDown = (e) => {
            // ブラウザのデフォルト動作を抑制（スクロールなど）
            const handledKeys = new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','v','V','x','X','c','C']);
            if (handledKeys.has(e.key)) e.preventDefault();
            switch (e.key) {
                case 'ArrowLeft': this.controller.movePiece(-1); break;
                case 'ArrowRight': this.controller.movePiece(1); break;
                case 'ArrowUp': this.controller.rotatePiece(1); break;
                case 'ArrowDown': this.controller.setSoftDrop(true); break;
                case ' ': this.controller.hardDrop(); break;
                case 'v': case 'V': this.controller.rotateInventory(); break;
                case 'x': case 'X': this.controller.useItem('self'); break;
                case 'c': case 'C': this.controller.useItem('opponent'); break;
            }
        };
        this._onKeyUp = (e) => {
            if (e.key === 'ArrowDown') this.controller.setSoftDrop(false);
        };
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);

        // Touch Controls: 長押しでソフトドロップ（簡易）
        const handleTouchEvent = (e, callback) => { e.preventDefault(); callback(); };
        
        document.getElementById('btn-left').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.movePiece(-1)), { passive: false });
        document.getElementById('btn-right').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.movePiece(1)), { passive: false });
        document.getElementById('btn-rotate-up').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.rotatePiece(1)), { passive: false });
        // Soft drop button (hold)
        const softBtn = document.getElementById('btn-soft-drop');
        softBtn.addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.setSoftDrop(true)), { passive: false });
        softBtn.addEventListener('touchend', () => this.controller.setSoftDrop(false), { passive: true });
        softBtn.addEventListener('touchcancel', () => this.controller.setSoftDrop(false), { passive: true });

        document.getElementById('btn-hard-drop').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.hardDrop()), { passive: false });
        document.getElementById('btn-use-self').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.useItem('self')), { passive: false });
        document.getElementById('btn-use-opponent').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.useItem('opponent')), { passive: false });
        const btnInv = document.getElementById('btn-rotate-inv');
        if (btnInv) btnInv.addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.rotateInventory()), { passive: false });
    }
}