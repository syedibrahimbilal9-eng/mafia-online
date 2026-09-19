// server.js
// Online Mafia game for exactly 8 players: 1 Mafia, 1 Detective, 1 Doctor, 5 Civilians.
// All game state lives in memory, keyed by a short room code. Good enough for a
// classroom demo; state disappears if the server restarts.

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const ROOM_SIZE = 8;
const ROLE_COUNTS = { mafia: 1, detective: 1, doctor: 1 };

// rooms[code] = {
//   code, hostId, phase: 'lobby'|'night'|'day'|'ended',
//   players: [{ id, name, role, alive }],
//   nightActions: { mafia: targetId|null, doctor: targetId|null, detective: targetId|null },
//   votes: { voterId: targetId },
//   round: 1
// }
const rooms = {};

function makeRoomCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (rooms[code]);
  return code;
}

function publicPlayers(room) {
  return room.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive }));
}

function sendRoomUpdate(room) {
  io.to(room.code).emit("roomUpdate", {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    players: publicPlayers(room),
    round: room.round,
  });
}

function alivePlayers(room) {
  return room.players.filter((p) => p.alive);
}

function findPlayer(room, id) {
  return room.players.find((p) => p.id === id);
}

function roleHolder(room, role) {
  return room.players.find((p) => p.role === role && p.alive);
}

function checkWinCondition(room) {
  const mafia = room.players.find((p) => p.role === "mafia");
  if (!mafia || !mafia.alive) {
    return "town";
  }
  const aliveTown = alivePlayers(room).filter((p) => p.role !== "mafia");
  if (aliveTown.length <= 1) {
    return "mafia";
  }
  return null;
}

function endGame(room, winner) {
  room.phase = "ended";
  io.to(room.code).emit("gameOver", {
    winner,
    roles: room.players.map((p) => ({ id: p.id, name: p.name, role: p.role, alive: p.alive })),
  });
  sendRoomUpdate(room);
}

function startNight(room) {
  room.phase = "night";
  room.nightActions = { mafia: null, doctor: null, detective: null };
  sendRoomUpdate(room);
  io.to(room.code).emit("phaseNight", { round: room.round });
}

function maybeResolveNight(room) {
  const needed = ["mafia", "doctor", "detective"].filter((role) => roleHolder(room, role));
  const done = needed.every((role) => room.nightActions[role] !== null || room.nightActions[role] === "SKIP");
  if (!done) return;

  const mafiaTarget = room.nightActions.mafia;
  const doctorTarget = room.nightActions.doctor;
  const detective = roleHolder(room, "detective");
  const detectiveTarget = room.nightActions.detective;

  // Resolve detective's investigation (private result)
  if (detective && detectiveTarget && detectiveTarget !== "SKIP") {
    const suspect = findPlayer(room, detectiveTarget);
    if (suspect) {
      io.to(detective.id).emit("investigationResult", {
        targetName: suspect.name,
        isMafia: suspect.role === "mafia",
      });
    }
  }

  // Resolve the kill
  let killedName = null;
  if (mafiaTarget && mafiaTarget !== "SKIP") {
    const saved = doctorTarget && doctorTarget === mafiaTarget;
    if (!saved) {
      const victim = findPlayer(room, mafiaTarget);
      if (victim && victim.alive) {
        victim.alive = false;
        killedName = victim.name;
      }
    }
  }

  room.phase = "day";
  room.votes = {};
  sendRoomUpdate(room);
  io.to(room.code).emit("phaseDay", { killedName, round: room.round });

  const winner = checkWinCondition(room);
  if (winner) {
    setTimeout(() => endGame(room, winner), 500);
  }
}

function maybeResolveVotes(room) {
  const alive = alivePlayers(room);
  const votesCast = Object.keys(room.votes).length;
  if (votesCast < alive.length) return;

  const tally = {};
  for (const targetId of Object.values(room.votes)) {
    if (targetId === "SKIP") continue;
    tally[targetId] = (tally[targetId] || 0) + 1;
  }

  let eliminatedId = null;
  let topVotes = 0;
  let tie = false;
  for (const [id, count] of Object.entries(tally)) {
    if (count > topVotes) {
      topVotes = count;
      eliminatedId = id;
      tie = false;
    } else if (count === topVotes) {
      tie = true;
    }
  }
  if (tie) eliminatedId = null;

  let eliminatedPlayer = null;
  if (eliminatedId) {
    eliminatedPlayer = findPlayer(room, eliminatedId);
    if (eliminatedPlayer) eliminatedPlayer.alive = false;
  }

  io.to(room.code).emit("voteResult", {
    eliminatedName: eliminatedPlayer ? eliminatedPlayer.name : null,
    eliminatedRole: eliminatedPlayer ? eliminatedPlayer.role : null,
    tie,
  });
  sendRoomUpdate(room);

  const winner = checkWinCondition(room);
  if (winner) {
    setTimeout(() => endGame(room, winner), 500);
  } else {
    room.round += 1;
    setTimeout(() => startNight(room), 1500);
  }
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const code = makeRoomCode();
    const room = {
      code,
      hostId: socket.id,
      phase: "lobby",
      players: [{ id: socket.id, name: name.trim().slice(0, 20) || "Player", role: null, alive: true }],
      nightActions: { mafia: null, doctor: null, detective: null },
      votes: {},
      round: 1,
    };
    rooms[code] = room;
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("roomCreated", { code });
    sendRoomUpdate(room);
  });

  socket.on("joinRoom", ({ code, name }) => {
    code = (code || "").trim().toUpperCase();
    const room = rooms[code];
    if (!room) return socket.emit("errorMsg", "Room not found.");
    if (room.phase !== "lobby") return socket.emit("errorMsg", "That game has already started.");
    if (room.players.length >= ROOM_SIZE) return socket.emit("errorMsg", "Room is full (8 players max).");

    room.players.push({ id: socket.id, name: name.trim().slice(0, 20) || "Player", role: null, alive: true });
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("roomJoined", { code });
    sendRoomUpdate(room);
  });

  socket.on("startGame", () => {
    const room = rooms[socket.data.roomCode];
    if (!room) return;
    if (room.hostId !== socket.id) return socket.emit("errorMsg", "Only the host can start the game.");
    if (room.players.length !== ROOM_SIZE) {
      return socket.emit("errorMsg", `Need exactly ${ROOM_SIZE} players to start (currently ${room.players.length}).`);
    }

    const roles = ["mafia", "doctor", "detective", "civilian", "civilian", "civilian", "civilian", "civilian"];
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    room.players.forEach((p, i) => {
      p.role = roles[i];
      p.alive = true;
      io.to(p.id).emit("roleAssigned", { role: p.role });
    });

    startNight(room);
  });

  socket.on("nightAction", ({ targetId }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.phase !== "night") return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.alive) return;
    if (!["mafia", "doctor", "detective"].includes(player.role)) return;

    room.nightActions[player.role] = targetId || "SKIP";
    socket.emit("nightActionAck");
    maybeResolveNight(room);
  });

  socket.on("chatMessage", ({ text }) => {
    const room = rooms[socket.data.roomCode];
    if (!room) return;
    const player = findPlayer(room, socket.id);
    if (!player) return;
    text = (text || "").toString().slice(0, 300);
    if (!text.trim()) return;
    io.to(room.code).emit("chatMessage", {
      name: player.name,
      text,
      alive: player.alive,
    });
  });

  socket.on("vote", ({ targetId }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.phase !== "day") return;
    const player = findPlayer(room, socket.id);
    if (!player || !player.alive) return;

    room.votes[socket.id] = targetId || "SKIP";
    io.to(room.code).emit("voteUpdate", {
      votesCast: Object.keys(room.votes).length,
      aliveCount: alivePlayers(room).length,
    });
    maybeResolveVotes(room);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const player = findPlayer(room, socket.id);
    if (player) {
      if (room.phase === "lobby") {
        room.players = room.players.filter((p) => p.id !== socket.id);
        if (room.players.length === 0) {
          delete rooms[code];
          return;
        }
        if (room.hostId === socket.id) room.hostId = room.players[0].id;
      } else {
        player.alive = false; // treat a disconnect mid-game as elimination
        const winner = checkWinCondition(room);
        if (winner) return endGame(room, winner);
      }
      sendRoomUpdate(room);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Mafia server running on port ${PORT}`));
