import { GameController } from './gameController.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    
    // Canvasのサイズを固定値で設定（論理サイズ）
    canvas.width = 1600;
    canvas.height = 900;

    const controller = new GameController(canvas, ctx);
    // 固定サイズに戻す（スケーリングなし）
});