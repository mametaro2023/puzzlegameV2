// js/config.js

// --- 定数定義 ---
// Canvasの固定サイズ
export const CW = 1600;
export const CH = 900;

// --- グリッド設定 ---
export const COLS = 8;
export const ROWS = 15;
export const HIDDEN_ROWS_TOP = 6;
export const TOTAL_ROWS = ROWS + HIDDEN_ROWS_TOP;

// --- レイアウトの主要な間隔（ギャップ）設定 ---
const TOP_BOTTOM_PADDING = 30; // 画面の上下の合計余白
const INV_GAP = 15;            // ボードとインベントリ間の隙間
const INV_ITEM_SIZE_RATIO = 0.8; // ブロックサイズに対するインベントリアイテムの大きさの比率

// --- サイズ計算の基点 ---
// (画面の高さ - 上下余白 - 隙間) を (ボードの行数 + インベントリの高さ比率) で割ることで、ブロック1つの理想的なサイズを算出
export const BLOCK = Math.floor(
    (CH - TOP_BOTTOM_PADDING * 2 - INV_GAP) / (ROWS + INV_ITEM_SIZE_RATIO)
);

// --- 計算結果を定数としてエクスポート ---
export const BOARD_WIDTH = BLOCK * COLS;
export const BOARD_HEIGHT = BLOCK * ROWS;

// --- 各UIエリアの幅を定義（ブロックサイズを基準に） ---
const P2_VIEW_WIDTH = BLOCK * 4;
const NEXT_AREA_WIDTH = BLOCK * 3;
const GAUGE_WIDTH = BLOCK * 0.8;
const UI_GAP = BLOCK * 0.5;

// --- 全体の幅を計算 ---
const TOTAL_WIDTH = P2_VIEW_WIDTH + UI_GAP + BOARD_WIDTH + UI_GAP + GAUGE_WIDTH + UI_GAP + NEXT_AREA_WIDTH;

// --- X, Y座標を計算 ---
// 全体を画面中央に配置するための左側のオフセット
const HORIZONTAL_OFFSET = Math.floor((CW - TOTAL_WIDTH) / 2);

export const P2_VIEW_X = HORIZONTAL_OFFSET;
export const OFFX = P2_VIEW_X + P2_VIEW_WIDTH + UI_GAP; // メインボードの開始X
export const GAUGE_X = OFFX + BOARD_WIDTH + UI_GAP;
export const NEXT_X = GAUGE_X + GAUGE_WIDTH + UI_GAP;
export const OFFY = TOP_BOTTOM_PADDING; // 上の余白


// --- 色やゲームプレイに関する定数はそのまま ---
export const COLORS = [
    '#000', '#EE7733', '#0077BB', '#33BBEE', '#EE3377', '#CCBB44',
];
export const LOCK_DELAY = 500;
export const CLEAR_ANIM_DELAY = 200;
export const DROP_ANIM_DELAY = 100;
export const FALL_ANIM_DURATION = 300;
export const SPAWN_DELAY = 50;
export const CLEAR_CHECK_DELAY = 200;
export const CLEAR_STAGE_DURATION = 180; // 消去段階演出の長さ(ms)
export const COMBO_POPUP_DURATION = 900; // コンボポップアップ(ms)
export const MOVE_BLUR_DURATION = 90; // 横移動のモーションブラー(ms)
export const SPAWN_X = 3;
export const SPAWN_Y = -3;
export const MAX_INVENTORY = 8;
export const P_BLOCK_ID = 99;
export const BASE_SPEED = 1.0;
export const MAX_SPEED_BONUS = 3.0;
export const GAUGE_COMBO_MULTIPLIER = 2;

// --- アイテム確率テーブル（変更なし） ---
export const ITEM_PROBABILITY_TABLE = {
    1: { noItemWeight: 1, items: [] },
    2: {
        noItemWeight: 50,
        items: [
            { name: '-1', weight: 20 }, { name: '-S', weight: 15 },
            { name: '+1', weight: 10 }, { name: '+S', weight: 5 },
        ]
    },
    3: {
        noItemWeight: 0,
        items: [
            { name: '-2', weight: 25 }, { name: 'X',  weight: 25 },
            { name: '+1', weight: 25 }, { name: '+S', weight: 25 },
        ]
    },
    4: {
        noItemWeight: 0,
        items: [
            { name: 'P',  weight: 25 }, { name: 'FR', weight: 20 },
            { name: 'X',  weight: 20 }, { name: '+2', weight: 15 },
            { name: '-2', weight: 20 },
        ]
    },
    5: {
        noItemWeight: 0,
        items: [
            { name: '!',  weight: 10 }, { name: 'P',  weight: 30 },
            { name: 'FR', weight: 30 }, { name: '+2', weight: 30 },
        ]
    },
    default: {
        noItemWeight: 0,
        items: [
            { name: '!',  weight: 15 }, { name: 'P',  weight: 35 },
            { name: 'FR', weight: 25 }, { name: '+2', weight: 25 },
        ]
    }
};