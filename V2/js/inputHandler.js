export class InputHandler {
    constructor(gameController) {
        this.controller = gameController;
    }

    init() {
        // Keyboard
        document.addEventListener('keydown', e => {
            switch (e.key) {
                case 'ArrowLeft': this.controller.movePiece(-1); break;
                case 'ArrowRight': this.controller.movePiece(1); break;
                case 'ArrowUp': this.controller.rotatePiece(1); break;
                case 'ArrowDown': this.controller.rotatePiece(-1); break;
                case ' ': this.controller.hardDrop(); break;
                case 'x': case 'X':
                    this.controller.useItem('self'); // 自分に使う
                    break;
                case 'c': case 'C':
                    this.controller.useItem('opponent'); // 相手に使う
                    break;
            }
        });

        // Touch Controls
        const handleTouchEvent = (e, callback) => { e.preventDefault(); callback(); };
        
        document.getElementById('btn-left').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.movePiece(-1)), { passive: false });
        document.getElementById('btn-right').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.movePiece(1)), { passive: false });
        document.getElementById('btn-rotate-up').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.rotatePiece(1)), { passive: false });
        document.getElementById('btn-rotate-down').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.rotatePiece(-1)), { passive: false });
        document.getElementById('btn-hard-drop').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.hardDrop()), { passive: false });
        document.getElementById('btn-use-self').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.useItem('self')), { passive: false });
        document.getElementById('btn-use-opponent').addEventListener('touchstart', (e) => handleTouchEvent(e, () => this.controller.useItem('opponent')), { passive: false });
    }
}