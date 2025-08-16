import { GameController } from './gameController.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    
    // Canvasのサイズを固定値で設定（論理サイズ）
    canvas.width = 1600;
    canvas.height = 900;

    const controller = new GameController(canvas, ctx);

    // レスポンシブ: 物理解像度に合わせてスケール
    const updateScale = () => {
        const dpr = window.devicePixelRatio || 1;
        // 表示領域に収まるようにスケール計算（縦横比維持）
        const vw = window.innerWidth * dpr;
        const vh = window.innerHeight * dpr;
        const scaleX = vw / canvas.width;
        const scaleY = vh / canvas.height;
        const pixelScale = Math.min(scaleX, scaleY);
        const isPortrait = window.innerHeight > window.innerWidth;
        controller.renderer.setScale(pixelScale, isPortrait);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    window.addEventListener('orientationchange', () => setTimeout(updateScale, 0));
});