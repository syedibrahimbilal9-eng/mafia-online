const socket = io();

let myId = null;
let myName = "";
let myRole = null;
let currentPlayers = [];
let hostId = null;
let roomCode = null;
let hasSubmittedNightAction = false;
let hasVoted = false;

const ROLE_INFO = {
  mafia: { title: "Mafia", desc: "Each night, choose a player to eliminate. Blend in during the day — don't get caught." },
  doctor: { title: "Doctor", desc: "Each night, choose a player to protect. If the Mafia targets them, they survive." },
  detective: { title: "Detective", desc: "Each night, choose a player to investigate. You'll learn if they are the Mafia." },
  civilian: { title: "Civilian", desc: "You have no special powers. Watch, listen, and vote wisely during the day." },
};

function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
}

function setRoomBadge(code) {
  roomCode = code;
  document.getElementById("roomCodeLabel").textContent = code;
  document.getElementById("roomBadge").classList.remove("hidden");
}

// ---------- HOME SCREEN ----------
document.getElementById("btnCreate").addEventListener("click", () => {
  const name = document.getElementById("createName").value.trim();
  if (!name) return showHomeError("Enter your name first.");
  myName = name;
  socket.emit("createRoom", { name });
});

document.getElementById("btnJoin").addEventListener("click", () => {
  const code = document.getElementById("joinCode").value.trim().toUpperCase();
  const name = document.getElementById("joinName").value.trim();
  if (!code || !name) return showHomeError("Enter a room code and your name.");
  myName = name;
  socket.emit("joinRoom", { code, name });
});

function showHomeError(msg) {
  document.getElementById("homeError").textContent = msg;
}

socket.on("errorMsg", (msg) => {
  showHomeError(msg);
});

socket.on("roomCreated", ({ code }) => {
  myId = socket.id;
  setRoomBadge(code);
  show("screen-lobby");
});

socket.on("roomJoined", ({ code }) => {
  myId = socket.id;
  setRoomBadge(code);
  show("screen-lobby");
});

// ---------- LOBBY SCREEN ----------
document.getElementById("btnStart").addEventListener("click", () => {
  socket.emit("startGame");
});

socket.on("roomUpdate", (data) => {
  currentPlayers = data.players;
  hostId = data.hostId;
  document.getElementById("lobbyCode").textContent = data.code;

  const list = document.getElementById("playerList");
  list.innerHTML = "";
  data.players.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p.name + (p.id === hostId ? " (host)" : "");
    if (!p.alive) li.classList.add("dead");
    list.appendChild(li);
  });

  if (data.phase === "lobby") {
    document.getElementById("lobbyStatus").textContent =
      data.players.length === 8
        ? "All 8 players are here."
        : `Waiting for players… (${data.players.length}/8)`;
    const startBtn = document.getElementById("btnStart");
    if (myId === hostId && data.players.length === 8) {
      startBtn.classList.remove("hidden");
    } else {
      startBtn.classList.add("hidden");
    }
  }

  renderVoteList(data.players);
  renderNightTargets(data.players);
});

// ---------- ROLE REVEAL ----------
socket.on("roleAssigned", ({ role }) => {
  myRole = role;
  const info = ROLE_INFO[role];
  document.getElementById("roleName").textContent = info.title;
  document.getElementById("roleDesc").textContent = info.desc;
  show("screen-role");
  setTimeout(() => {
    if (document.getElementById("screen-role").classList.contains("active")) {
      show("screen-night");
    }
  }, 3500);
});

// ---------- NIGHT SCREEN ----------
socket.on("phaseNight", ({ round }) => {
  hasSubmittedNightAction = false;
  document.getElementById("nightRound").textContent = round;
  document.getElementById("nightWaiting").classList.add("hidden");
  show("screen-night");

  const instruction = document.getElementById("nightInstruction");
  const area = document.getElementById("nightActionArea");

  if (myRole === "mafia") {
    instruction.textContent = "Choose someone to eliminate.";
    area.classList.remove("hidden");
  } else if (myRole === "doctor") {
    instruction.textContent = "Choose someone to protect tonight.";
    area.classList.remove("hidden");
  } else if (myRole === "detective") {
    instruction.textContent = "Choose someone to investigate.";
    area.classList.remove("hidden");
  } else {
    instruction.textContent = "The town is asleep. Others are making their move.";
    area.classList.add("hidden");
    document.getElementById("nightWaiting").classList.remove("hidden");
  }

  renderNightTargets(currentPlayers);
});

function renderNightTargets(players) {
  const area = document.getElementById("nightActionArea");
  if (!["mafia", "doctor", "detective"].includes(myRole)) return;
  if (!document.getElementById("screen-night").classList.contains("active")) return;
  if (hasSubmittedNightAction) return;

  area.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "target-grid";

  players
    .filter((p) => p.alive)
    .forEach((p) => {
      if (myRole !== "doctor" && p.id === myId) return; // doctor may protect self
      const btn = document.createElement("button");
      btn.className = "target-btn";
      btn.textContent = p.name;
      btn.addEventListener("click", () => submitNightAction(p.id, btn));
      grid.appendChild(btn);
    });

  area.appendChild(grid);
}

function submitNightAction(targetId, btnEl) {
  if (hasSubmittedNightAction) return;
  document.querySelectorAll(".target-btn").forEach((b) => b.classList.remove("selected"));
  btnEl.classList.add("selected");
  hasSubmittedNightAction = true;
  socket.emit("nightAction", { targetId });
}

socket.on("nightActionAck", () => {
  document.getElementById("nightInstruction").textContent = "Choice locked in.";
  document.getElementById("nightWaiting").classList.remove("hidden");
});

socket.on("investigationResult", ({ targetName, isMafia }) => {
  setTimeout(() => {
    alert(`Investigation result: ${targetName} is ${isMafia ? "THE MAFIA." : "not the Mafia."}`);
  }, 400);
});

// ---------- DAY SCREEN ----------
socket.on("phaseDay", ({ killedName, round }) => {
  hasVoted = false;
  document.getElementById("dayRound").textContent = round;
  document.getElementById("dayNews").textContent = killedName
    ? `${killedName} was found dead this morning.`
    : "Everyone survived the night.";
  document.getElementById("chatLog").innerHTML = "";
  document.getElementById("voteStatus").textContent = "";
  show("screen-day");
  renderVoteList(currentPlayers);
});

document.getElementById("btnSend").addEventListener("click", sendChat);
document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});
function sendChat() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("chatMessage", { text });
  input.value = "";
}

socket.on("chatMessage", ({ name, text, alive }) => {
  const log = document.getElementById("chatLog");
  const line = document.createElement("div");
  line.className = "chat-line" + (alive ? "" : " dead-msg");
  line.innerHTML = `<span class="who">${escapeHtml(name)}${alive ? "" : " (dead)"}:</span>${escapeHtml(text)}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderVoteList(players) {
  const list = document.getElementById("voteList");
  if (!document.getElementById("screen-day").classList.contains("active")) return;
  list.innerHTML = "";
  const me = players.find((p) => p.id === myId);
  const iAmAlive = me ? me.alive : false;

  players
    .filter((p) => p.alive)
    .forEach((p) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.textContent = p.id === myId ? `${p.name} (you)` : p.name;
      if (!iAmAlive || hasVoted) btn.disabled = true;
      btn.addEventListener("click", () => castVote(p.id, btn));
      li.appendChild(btn);
      list.appendChild(li);
    });
}

function castVote(targetId, btnEl) {
  if (hasVoted) return;
  document.querySelectorAll(".vote-list button").forEach((b) => (b.disabled = true));
  btnEl.classList.add("selected");
  hasVoted = true;
  socket.emit("vote", { targetId });
}

socket.on("voteUpdate", ({ votesCast, aliveCount }) => {
  document.getElementById("voteStatus").textContent = `${votesCast}/${aliveCount} votes cast.`;
});

socket.on("voteResult", ({ eliminatedName, eliminatedRole, tie }) => {
  const news = document.getElementById("dayNews");
  if (tie) {
    news.textContent = "The vote was tied — no one was eliminated.";
  } else if (eliminatedName) {
    news.textContent = `${eliminatedName} was voted out. They were the ${ROLE_INFO[eliminatedRole].title}.`;
  }
});

// ---------- END SCREEN ----------
socket.on("gameOver", ({ winner, roles }) => {
  document.getElementById("endTitle").textContent =
    winner === "mafia" ? "The Mafia wins." : "The Town wins.";
  document.getElementById("endSub").textContent =
    winner === "mafia"
      ? "The city belongs to the shadows now."
      : "Justice caught up with the Mafia.";

  const list = document.getElementById("endRoles");
  list.innerHTML = "";
  roles.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = `${p.name} — ${ROLE_INFO[p.role].title}`;
    if (!p.alive) li.classList.add("dead");
    list.appendChild(li);
  });

  show("screen-end");
});

document.getElementById("btnReplay").addEventListener("click", () => {
  window.location.reload();
});
