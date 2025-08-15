import { GameController } from './gameController.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    
    // Canvasのサイズを固定値で設定
    canvas.width = 1600;
    canvas.height = 900;

    // GameControllerをインスタンス化してゲームを開始
    new GameController(canvas, ctx);
});