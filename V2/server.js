// server.js を以下の内容に置き換えてください

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
// rooms: { [roomName]: { members: string[], host: string, inGame: boolean, playerStates: { [socketId]: PlayerState } } }
const rooms = {};

// 設定（サーバ側でも簡易に保持）
const GAUGE_COMBO_MULTIPLIER = 2;
const ITEM_PROBABILITY_TABLE = {
  1: { noItemWeight: 1, items: [] },
  2: { noItemWeight: 50, items: [ { name: '-1', weight: 20 }, { name: '-S', weight: 15 }, { name: '+1', weight: 10 }, { name: '+S', weight: 5 } ] },
  3: { noItemWeight: 0, items: [ { name: '-2', weight: 25 }, { name: 'X', weight: 25 }, { name: '+1', weight: 25 }, { name: '+S', weight: 25 } ] },
  4: { noItemWeight: 0, items: [ { name: 'P', weight: 25 }, { name: 'FR', weight: 20 }, { name: 'X', weight: 20 }, { name: '+2', weight: 15 }, { name: '-2', weight: 20 } ] },
  5: { noItemWeight: 0, items: [ { name: '!', weight: 10 }, { name: 'P', weight: 30 }, { name: 'FR', weight: 30 }, { name: '+2', weight: 30 } ] },
  default: { noItemWeight: 0, items: [ { name: '!', weight: 15 }, { name: 'P', weight: 35 }, { name: 'FR', weight: 25 }, { name: '+2', weight: 25 } ] }
};

function ensureRoom(roomName) {
  if (!rooms[roomName]) {
    rooms[roomName] = { members: [], host: null, inGame: false, playerStates: {} };
  }
  if (!rooms[roomName].playerStates) rooms[roomName].playerStates = {};
  return rooms[roomName];
}

function initPlayerState(room, socketId) {
  room.playerStates[socketId] = { inventory: ['P'], gauge: 0, version: 0 };
}

function drawItem(probTable, combo) {
  const p = probTable[combo] || probTable.default;
  const items = p.items;
  const noItem = p.noItemWeight;
  const total = items.reduce((s, it) => s + it.weight, 0) + noItem;
  const r = Math.random() * total;
  let acc = noItem;
  if (r < acc) return null;
  for (const it of items) {
    acc += it.weight;
    if (r < acc) return it.name;
  }
  return null;
}

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

    const room = ensureRoom(roomName);
    if (!room.members.includes(socket.id)) room.members.push(socket.id);
    if (!room.host) room.host = socket.id;
    initPlayerState(room, socket.id);

    // 初期状態を本人へ送る
    const ps = room.playerStates[socket.id];
    io.to(socket.id).emit('playerState', { inventory: ps.inventory, gauge: ps.gauge, version: ps.version });

    broadcastRoomReady(roomName);
    io.emit('roomsChanged');
  });

  socket.on('getRooms', () => {
    const list = Object.entries(rooms)
      .filter(([, r]) => Array.isArray(r.members) && r.members.length > 0 && r.members.length < 2 && !r.inGame)
      .map(([name, r]) => ({ name, count: r.members.length }));
    io.to(socket.id).emit('roomsList', list);
  });

  socket.on('hostStartGame', () => {
    const roomName = socket.room;
    if (!roomName || !rooms[roomName]) return;
    const room = rooms[roomName];
    if (room.host !== socket.id) return;
    if (room.members.length < 2) return;
    room.inGame = true;
    // 試合開始時に状態リセット
    room.members.forEach(id => initPlayerState(room, id));
    io.to(roomName).emit('gameStart', { roomName });
    // 各自に初期state
    room.members.forEach(id => {
      const ps = room.playerStates[id];
      io.to(id).emit('playerState', { inventory: ps.inventory, gauge: ps.gauge, version: ps.version });
    });
    io.emit('roomsChanged');
  });

  // 権威: 消去報告（blocks, combo）
  socket.on('reportClear', ({ blocks, combo }) => {
    const roomName = socket.room; if (!roomName) return;
    const room = rooms[roomName]; if (!room) return;
    const self = room.playerStates[socket.id]; if (!self) return;

    // ゲージ加算
    const add = blocks * combo * GAUGE_COMBO_MULTIPLIER;
    let newGauge = self.gauge + add;
    let overflow = 0;
    if (newGauge >= 100) { overflow = newGauge % 100; newGauge = overflow; }
    self.gauge = newGauge; self.version++;

    // アイテム抽選
    const got = drawItem(ITEM_PROBABILITY_TABLE, combo);
    if (got) self.inventory.push(got);

    // 自分へ最新state
    io.to(socket.id).emit('playerState', { inventory: self.inventory, gauge: self.gauge, version: self.version });

    // ゲージMAX攻撃
    if (overflow !== 0 || add >= 100) {
      // 射手にビーム演出、相手に攻撃
      io.to(socket.id).emit('beamFire');
      socket.broadcast.to(roomName).emit('receiveAttack');
    }
  });

  // 権威: アイテム使用（先頭を消費）
  socket.on('useItem', ({ target }) => {
    const roomName = socket.room; if (!roomName) return;
    const room = rooms[roomName]; if (!room) return;
    const self = room.playerStates[socket.id]; if (!self) return;
    if (!self.inventory || self.inventory.length === 0) return;

    const item = self.inventory.shift();
    // 自分に適用
    if (target === 'self') {
      // ゲージ系はサーバで更新
      if (item === '+S') self.gauge = Math.min(99, 99);
      if (item === '-S') self.gauge = 0;
      io.to(socket.id).emit('applyItemSelf', { itemName: item });
    } else {
      // 相手へ送る
      socket.broadcast.to(roomName).emit('receiveItem', { itemName: item });
    }
    self.version++;
    io.to(socket.id).emit('playerState', { inventory: self.inventory, gauge: self.gauge, version: self.version });
  });

  // 権威: インベントリ回転
  socket.on('rotateInventory', () => {
    const roomName = socket.room; if (!roomName) return;
    const room = rooms[roomName]; if (!room) return;
    const self = room.playerStates[socket.id]; if (!self) return;
    if (self.inventory.length > 1) {
      const last = self.inventory.pop();
      self.inventory.unshift(last);
      self.version++;
      io.to(socket.id).emit('playerState', { inventory: self.inventory, gauge: self.gauge, version: self.version });
    }
  });

  // 盤面データの中継（そのまま）
  socket.on('boardUpdate', (data) => {
    if (socket.room) socket.broadcast.to(socket.room).emit('opponentUpdate', data);
  });

  socket.on('leaveRoom', () => {
    const roomName = socket.room;
    if (!roomName || !rooms[roomName]) return;
    const room = rooms[roomName];
    room.members = room.members.filter(id => id !== socket.id);
    delete room.playerStates?.[socket.id];
    socket.leave(roomName);
    socket.room = null;
    io.to(roomName).emit('opponentDisconnect');
    if (room.host === socket.id) room.host = room.members[0] || null;
    if (room.members.length === 0) {
      delete rooms[roomName];
    } else {
      room.inGame = false;
      broadcastRoomReady(roomName);
    }
    io.emit('roomsChanged');
  });

  socket.on('gameOver', () => {
    const roomName = socket.room;
    if (!roomName || !rooms[roomName]) return;
    const room = rooms[roomName];
    const winnerId = room.members.find(id => id !== socket.id) || null;
    io.to(roomName).emit('gameOver', { winnerId, loserId: socket.id });
    room.inGame = false;
    broadcastRoomReady(roomName);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    if (socket.room) {
      const roomName = socket.room;
      const room = rooms[roomName];
      if (room) {
        socket.to(roomName).emit('opponentDisconnect');
        room.members = room.members.filter(id => id !== socket.id);
        delete room.playerStates?.[socket.id];
        if (room.host === socket.id) room.host = room.members[0] || null;
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