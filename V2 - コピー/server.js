// server.js を以下の内容に置き換えてください

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const rooms = {}; // 存在する部屋と参加者を管理するオブジェクト

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    // プレイヤーが部屋への参加を要求してきたときの処理
    socket.on('joinRoom', (roomName) => {
        // --- 1. 部屋に参加する ---
        socket.join(roomName);
        socket.room = roomName; // 後で使うためにsocketオブジェクトに部屋名を保存

        // --- 2. 部屋の参加人数を管理する ---
        if (!rooms[roomName]) {
            // 新しい部屋の場合
            rooms[roomName] = [];
        }
        rooms[roomName].push(socket.id);

        // --- 3. 部屋の状態に応じてイベントを送信 ---
        const playersInRoom = rooms[roomName];
        if (playersInRoom.length === 1) {
            // 1人目のプレイヤー：待機状態にする
            io.to(socket.id).emit('waiting');
            console.log(`Room '${roomName}' created. Player 1 (${socket.id}) is waiting.`);
        } else if (playersInRoom.length === 2) {
            // 2人目のプレイヤー：部屋の全員にゲーム開始を通知
            console.log(`Player 2 (${socket.id}) joined Room '${roomName}'. Starting game.`);
            io.to(roomName).emit('gameStart', { roomName: roomName });
        } else {
            // 3人目以降：観戦者モード（今回は何もしない）
            console.log(`Spectator (${socket.id}) tried to join Room '${roomName}'.`);
            // ここで「部屋は満員です」というイベントを送ることも可能
        }
    });

    // 盤面データの中継処理を、部屋の中の相手にだけ送るように修正
    socket.on('boardUpdate', (data) => {
        if (socket.room) {
            socket.broadcast.to(socket.room).emit('opponentUpdate', data);
        }
    });

    // アイテムを相手に送るイベント
    socket.on('sendItem', (data) => {
        if (socket.room) {
            // イベントを受け取ったプレイヤー以外（つまり相手）にアイテム情報を転送
            socket.broadcast.to(socket.room).emit('receiveItem', { itemName: data.itemName });
            console.log(`Player ${socket.id} sent item '${data.itemName}' to room '${socket.room}'`);
        }
    });
    
    // ゲージMAX攻撃を相手に送るイベント
    socket.on('gaugeAttack', () => {
        if (socket.room) {
            // 相手に攻撃イベントを転送
            socket.broadcast.to(socket.room).emit('receiveAttack');
            console.log(`Player ${socket.id} sent a gauge attack to room '${socket.room}'`);
        }
    });    

    // 切断時の処理
    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
        if (socket.room) {
            const roomName = socket.room;
            // 相手に切断を通知
            socket.to(roomName).emit('opponentDisconnect');
            
            // 部屋の管理オブジェクトから切断したプレイヤーを削除
            if (rooms[roomName]) {
                rooms[roomName] = rooms[roomName].filter(id => id !== socket.id);
                // 部屋が空になったら削除
                if (rooms[roomName].length === 0) {
                    delete rooms[roomName];
                    console.log(`Room '${roomName}' is now empty and closed.`);
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Game server listening on port ${PORT}`);
});