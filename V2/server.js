// server.js を以下の内容に置き換えてください

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
// rooms: { [roomName]: { members: string[], host: string, inGame: boolean } }
const rooms = {};

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    const broadcastRoomReady = (roomName) => {
        const room = rooms[roomName];
        if (!room) return;
        io.to(roomName).emit('roomReady', { roomName, hostId: room.host, members: room.members });
    };

    socket.on('joinRoom', (roomName) => {
        socket.join(roomName);
        socket.room = roomName;

        if (!rooms[roomName]) {
            rooms[roomName] = { members: [], host: socket.id, inGame: false };
        }
        const room = rooms[roomName];
        if (!room.members.includes(socket.id)) {
            room.members.push(socket.id);
        }
        // 新規参加者に現状の状態を返す/部屋全体に準備状態を通知
        broadcastRoomReady(roomName);
        io.emit('roomsChanged');
    });

    // ルーム一覧を返す（待機中＝メンバー1人、未開始）
    socket.on('getRooms', () => {
        const list = Object.entries(rooms)
            .filter(([, r]) => Array.isArray(r.members) && r.members.length > 0 && r.members.length < 2 && !r.inGame)
            .map(([name, r]) => ({ name, count: r.members.length }));
        io.to(socket.id).emit('roomsList', list);
    });

    // ホストが開始要求
    socket.on('hostStartGame', () => {
        const roomName = socket.room;
        if (!roomName || !rooms[roomName]) return;
        const room = rooms[roomName];
        if (room.host !== socket.id) return; // ホストのみ
        if (room.members.length < 2) return; // 2人揃っていない
        room.inGame = true;
        io.to(roomName).emit('gameStart', { roomName });
        io.emit('roomsChanged');
    });

    // クライアントからのボード同期（ゲーム中のみ中継）
    socket.on('boardUpdate', (data) => {
        if (socket.room) {
            socket.broadcast.to(socket.room).emit('opponentUpdate', data);
        }
    });

    // アイテム送付
    socket.on('sendItem', (data) => {
        if (socket.room) {
            socket.broadcast.to(socket.room).emit('receiveItem', { itemName: data.itemName });
            console.log(`Player ${socket.id} sent item '${data.itemName}' to room '${socket.room}'`);
        }
    });
    
    // ゲージ攻撃
    socket.on('gaugeAttack', () => {
        if (socket.room) {
            socket.broadcast.to(socket.room).emit('receiveAttack');
            console.log(`Player ${socket.id} sent a gauge attack to room '${socket.room}'`);
        }
    });    

    // プレイヤーが任意に部屋を離れる
    socket.on('leaveRoom', () => {
        const roomName = socket.room;
        if (!roomName || !rooms[roomName]) return;
        const room = rooms[roomName];
        room.members = room.members.filter(id => id !== socket.id);
        socket.leave(roomName);
        socket.room = null;
        // 相手に離脱を通知
        io.to(roomName).emit('opponentDisconnect');
        // ホストがいなければ再割当
        if (room.host === socket.id) {
            room.host = room.members[0] || null;
        }
        // 空になったら削除
        if (room.members.length === 0) {
            delete rooms[roomName];
        } else {
            room.inGame = false;
            broadcastRoomReady(roomName);
        }
        io.emit('roomsChanged');
    });

    // ゲームオーバー通知（どちらかが負けた）
    socket.on('gameOver', () => {
        const roomName = socket.room;
        if (!roomName || !rooms[roomName]) return;
        const room = rooms[roomName];
        const winnerId = room.members.find(id => id !== socket.id) || null;
        io.to(roomName).emit('gameOver', { winnerId, loserId: socket.id });
        room.inGame = false;
        // 準備状態へ
        broadcastRoomReady(roomName);
    });

    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
        if (socket.room) {
            const roomName = socket.room;
            const room = rooms[roomName];
            if (room) {
                // 相手に切断を通知
                socket.to(roomName).emit('opponentDisconnect');
                // メンバーから削除
                room.members = room.members.filter(id => id !== socket.id);
                // ホストなら再割当
                if (room.host === socket.id) {
                    room.host = room.members[0] || null;
                }
                // 空なら削除
                if (room.members.length === 0) {
                    delete rooms[roomName];
                    console.log(`Room '${roomName}' is now empty and closed.`);
                } else {
                    room.inGame = false;
                    broadcastRoomReady(roomName);
                }
                io.emit('roomsChanged');
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Game server listening on port ${PORT}`);
});