/* ═══════════════════════════════════════════
   NightOwl Karaoke Game Night — player.js
═══════════════════════════════════════════ */

const socket = io();
const params = new URLSearchParams(location.search);
const roomFromUrl = params.get("room") || "";

let myId = socket.id;
let myRoomCode = "";
let joined = false;
let currentState = null;
let selectedAvatarDataUrl = null;

/* ─── PRE-FILL ROOM CODE FROM URL ─── */
if (roomFromUrl) {
  document.getElementById("roomCodeInput").value = roomFromUrl.toUpperCase();
}

/* ─── AVATAR DEFAULTS ─── */
const DEFAULT_COLORS = ["#b44fff","#00d4ff","#ff3fa4","#00ff88","#ffd700","#ff6b35","#7c3aed","#06b6d4","#ec4899","#10b981"];
const DEFAULT_ICONS  = ["🎤","🎵","🎸","🎹","🥁","🎼","🦁","🐯","🦊","🐺"];

function generateDefaultAvatar(name, colorIdx) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const c = DEFAULT_COLORS[colorIdx % DEFAULT_COLORS.length];
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 110px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText((name || "?").charAt(0).toUpperCase(), 128, 128);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function generateIconAvatar(icon, colorIdx) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const c = DEFAULT_COLORS[colorIdx % DEFAULT_COLORS.length];
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();
  ctx.font = "120px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(icon, 128, 138);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function avatarSrc(player, index = 0) {
  if (!player) return generateDefaultAvatar("?", 0);
  return player.avatar || generateDefaultAvatar(player.name || "?", index);
}

/* ─── RESIZE IMAGE TO 256×256 ─── */
function resizeImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext("2d");
      const sx = (img.naturalWidth  - size) / 2;
      const sy = (img.naturalHeight - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/* ─── BUILD DEFAULT AVATAR GRID ─── */
function buildDefaultAvatarGrid() {
  const container = document.getElementById("defaultAvatars");
  container.innerHTML = "";
  DEFAULT_ICONS.forEach((icon, i) => {
    const src = generateIconAvatar(icon, i);
    const img = document.createElement("img");
    img.className = "default-avatar-opt";
    img.src = src;
    img.alt = icon;
    img.addEventListener("click", () => {
      document.querySelectorAll(".default-avatar-opt").forEach(el => el.classList.remove("sel"));
      img.classList.add("sel");
      selectedAvatarDataUrl = src;
      document.getElementById("avatarPreview").src = src;
    });
    container.appendChild(img);
  });
}

/* ─── INIT ─── */
(function init() {
  buildDefaultAvatarGrid();

  // Set initial avatar preview using first letter default
  const nameInput = document.getElementById("playerNameInput");
  const preview   = document.getElementById("avatarPreview");
  preview.src = generateDefaultAvatar("?", Math.floor(Math.random() * 10));

  nameInput.addEventListener("input", () => {
    if (!selectedAvatarDataUrl) {
      preview.src = generateDefaultAvatar(nameInput.value || "?", 0);
    }
  });

  // Upload photo
  document.getElementById("uploadBtn").addEventListener("click", () => {
    document.getElementById("uploadInput").click();
  });
  document.getElementById("uploadInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const resized = await resizeImage(file);
    if (resized) {
      selectedAvatarDataUrl = resized;
      document.getElementById("avatarPreview").src = resized;
    }
    e.target.value = "";
  });

  // Take photo
  document.getElementById("cameraBtn").addEventListener("click", () => {
    document.getElementById("cameraInput").click();
  });
  document.getElementById("cameraInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const resized = await resizeImage(file);
    if (resized) {
      selectedAvatarDataUrl = resized;
      document.getElementById("avatarPreview").src = resized;
    }
    e.target.value = "";
  });

  // Show default avatar grid
  document.getElementById("defaultAvatarBtn").addEventListener("click", () => {
    const grid = document.getElementById("defaultAvatars");
    grid.style.display = grid.style.display === "none" ? "flex" : "none";
  });

  // Join button
  document.getElementById("joinBtn").addEventListener("click", joinGame);

  // Floating notes
  spawnNotes();
})();

function joinGame() {
  const roomCode  = document.getElementById("roomCodeInput").value.trim().toUpperCase();
  const playerName = document.getElementById("playerNameInput").value.trim();

  if (!roomCode)    { alert("Please enter a room code."); return; }
  if (!playerName)  { alert("Please enter your name."); return; }

  myRoomCode = roomCode;

  // Use selected avatar or generate from name
  const avatar = selectedAvatarDataUrl || generateDefaultAvatar(playerName, Math.floor(Math.random() * 10));

  socket.emit("player:join", { roomCode, playerName, avatar });
  joined = true;

  // Switch to game pad
  document.getElementById("joinForm").style.display = "none";
  document.getElementById("gamePad").classList.add("visible");
}

/* ─── SOCKET EVENTS ─── */
socket.on("connect", () => { myId = socket.id; });

socket.on("room:state", (state) => {
  currentState = state;
  if (joined) renderGamePad(state);
});

socket.on("timer:tick", ({ timer, timerType }) => {
  if (currentState) { currentState.timer = timer; currentState.timerType = timerType; }
  if (joined && timerType === "answer") renderAnswerTimer(timer);
});

/* ─── RENDER GAME PAD ─── */
function renderGamePad(state) {
  const phase    = state.gamePhase || "lobby";
  const players  = state.players || {};
  const myPlayer = players[myId];
  const isMyTurn = state.activePlayerId === myId;
  const activePlayer = players[state.activePlayerId];
  const allPlayers = Object.values(players);
  const myIdx = allPlayers.findIndex(p => p.id === myId);
  const activeIdx = allPlayers.findIndex(p => p.id === state.activePlayerId);

  // Game mode pill
  const modePill = document.getElementById("modePill");
  if (state.selectedGameMode && state.selectedGameLabel) {
    modePill.style.display = "inline-flex";
    document.getElementById("modeIcon").textContent = modeIcon(state.selectedGameMode);
    document.getElementById("modeLabelText").textContent = state.selectedGameLabel;
  } else {
    modePill.style.display = "none";
  }

  // Waiting message
  const waitingMsg   = document.getElementById("waitingMsg");
  const myTurnBanner = document.getElementById("myTurnBanner");
  const timerBlock   = document.getElementById("timerBlock");
  const pActiveCard  = document.getElementById("pActiveCard");

  const gameActive = state.gameStarted && phase !== "game_complete";

  if (!state.gameStarted) {
    waitingMsg.style.display = "block";
    waitingMsg.innerHTML = state.selectedGameMode
      ? `<p style="font-weight:700;font-size:1rem;">🎮 Game selected: <span style="color:var(--purple)">${state.selectedGameLabel}</span></p><p class="status-text mt-8">${state.selectedInstructions || "Waiting for host to start…"}</p>`
      : `<p class="status-text">Waiting for host to choose a game mode…</p>`;
    myTurnBanner.style.display = "none";
    timerBlock.style.display   = "none";
    pActiveCard.style.display  = "none";
  } else {
    waitingMsg.style.display = "none";

    // My turn banner
    if (isMyTurn && ["challenge","time_up","listening","blurred_continue","paused_ready","game_started"].includes(phase)) {
      myTurnBanner.style.display = "block";
      document.getElementById("challengeText").textContent = state.selectedChallengeText || "It's your turn!";
    } else {
      myTurnBanner.style.display = "none";
    }

    // Answer timer (only show for active player during challenge)
    if (isMyTurn && state.timerType === "answer" && phase === "challenge") {
      timerBlock.style.display = "block";
      renderAnswerTimer(state.timer);
    } else if (!isMyTurn && phase === "challenge") {
      timerBlock.style.display = "block";
      renderAnswerTimer(state.timer);
    } else if (phase === "time_up") {
      timerBlock.style.display = "block";
      document.getElementById("pTimerVal").textContent = "0";
      document.getElementById("pTimerVal").className = "p-timer-val urgent";
      document.getElementById("timerHurry").style.display = "none";
    } else {
      timerBlock.style.display = "none";
    }

    // Active player card (show when it's not my turn)
    if (activePlayer && !isMyTurn) {
      pActiveCard.style.display = "flex";
      document.getElementById("pActiveAvatar").src = avatarSrc(activePlayer, activeIdx);
      document.getElementById("pActiveName").textContent = activePlayer.name;
      document.getElementById("pRoundLabel").textContent = `Round ${state.currentRound || 1} / ${state.totalRounds || 5}`;
    } else if (isMyTurn) {
      pActiveCard.style.display = "none";
    } else {
      pActiveCard.style.display = "none";
    }
  }

  // Hint
  const hintEl = document.getElementById("pHintText");
  if (state.currentHint && ["challenge","time_up","revealed","judged_correct","judged_wrong"].includes(phase)) {
    hintEl.style.display = "block";
    hintEl.textContent = `Hint: ${state.currentHint}`;
  } else {
    hintEl.style.display = "none";
  }

  // Judgement
  const judgeEl = document.getElementById("pJudgement");
  if (phase === "judged_correct") {
    judgeEl.className = "p-judgement show correct";
    judgeEl.textContent = isMyTurn ? "✅ CORRECT! +100" : `✅ ${activePlayer?.name || "Player"} got it!`;
  } else if (phase === "judged_wrong") {
    judgeEl.className = "p-judgement show wrong";
    judgeEl.textContent = isMyTurn ? "❌ WRONG!" : `❌ ${activePlayer?.name || "Player"} missed it.`;
  } else if (phase === "time_up") {
    judgeEl.className = "p-judgement show wrong";
    judgeEl.textContent = "⏰ Time's Up!";
  } else {
    judgeEl.className = "p-judgement";
  }

  // My score & rank
  const myScore = myPlayer?.score || 0;
  document.getElementById("myScore").textContent = myScore;
  const sorted = allPlayers.sort((a, b) => (b.score || 0) - (a.score || 0));
  const myRank = sorted.findIndex(p => p.id === myId) + 1;
  document.getElementById("myRank").textContent = myRank > 0 ? `#${myRank}` : "—";

  // Leaderboard
  renderMiniLb(sorted);

  // Game complete
  const completeEl = document.getElementById("pGameComplete");
  if (phase === "game_complete") {
    completeEl.style.display = "block";
    const winner = sorted[0];
    document.getElementById("pWinnerText").textContent = winner ? `Winner: ${winner.name} (${winner.score} pts)` : "";
  } else {
    completeEl.style.display = "none";
  }
}

function renderAnswerTimer(timer) {
  const el = document.getElementById("pTimerVal");
  const hurry = document.getElementById("timerHurry");
  el.textContent = timer;
  el.className = "p-timer-val" + (timer <= 5 ? " urgent" : "");
  hurry.style.display = timer <= 5 && timer > 0 ? "block" : "none";
}

function renderMiniLb(sorted) {
  const ul = document.getElementById("pLbList");
  ul.innerHTML = "";
  sorted.slice(0, 8).forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "lb-row" + (i === 0 ? " rank-1" : "") + (p.id === myId ? " active-player" : "");
    const allPlayers = Object.values(currentState?.players || {});
    const idx = allPlayers.findIndex(pl => pl.id === p.id);
    li.innerHTML = `
      ${i === 0 ? '<span class="crown">👑</span>' : ""}
      <span class="lb-rank">${i + 1}</span>
      <img class="avatar" src="${avatarSrc(p, idx)}" alt="${p.name}" style="width:28px;height:28px;" />
      <span class="lb-name">${p.name}${p.id === myId ? " (you)" : ""}</span>
      <span class="lb-score">${p.score || 0}</span>
    `;
    ul.appendChild(li);
  });
}

function modeIcon(mode) {
  return { lyrics: "🎤", title: "🎵", artist: "🌟" }[mode] || "🎮";
}

/* ─── FLOATING MUSIC NOTES ─── */
function spawnNotes() {
  const notes = ["🎵","🎶","🎤","🎸","🎹","🥁"];
  const container = document.getElementById("musicNotes");
  setInterval(() => {
    const el = document.createElement("span");
    el.className = "note";
    el.textContent = notes[Math.floor(Math.random() * notes.length)];
    el.style.left = Math.random() * 100 + "vw";
    el.style.animationDuration = (6 + Math.random() * 6) + "s";
    el.style.fontSize = (14 + Math.random() * 16) + "px";
    container.appendChild(el);
    setTimeout(() => el.remove(), 10000);
  }, 3000);
}
