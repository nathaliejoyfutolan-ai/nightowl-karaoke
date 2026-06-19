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
let lastVideoId = null;

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

  const nameInput = document.getElementById("playerNameInput");
  const preview   = document.getElementById("avatarPreview");
  preview.src = generateDefaultAvatar("?", Math.floor(Math.random() * 10));

  nameInput.addEventListener("input", () => {
    if (!selectedAvatarDataUrl) {
      preview.src = generateDefaultAvatar(nameInput.value || "?", 0);
    }
  });

  document.getElementById("uploadBtn").addEventListener("click", () => {
    document.getElementById("uploadInput").click();
  });
  document.getElementById("uploadInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const resized = await resizeImage(file);
    if (resized) { selectedAvatarDataUrl = resized; document.getElementById("avatarPreview").src = resized; }
    e.target.value = "";
  });

  document.getElementById("cameraBtn").addEventListener("click", () => {
    document.getElementById("cameraInput").click();
  });
  document.getElementById("cameraInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const resized = await resizeImage(file);
    if (resized) { selectedAvatarDataUrl = resized; document.getElementById("avatarPreview").src = resized; }
    e.target.value = "";
  });

  document.getElementById("defaultAvatarBtn").addEventListener("click", () => {
    const grid = document.getElementById("defaultAvatars");
    grid.style.display = grid.style.display === "none" ? "flex" : "none";
  });

  document.getElementById("joinBtn").addEventListener("click", joinGame);

  spawnNotes();
})();

function joinGame() {
  const roomCode   = document.getElementById("roomCodeInput").value.trim().toUpperCase();
  const playerName = document.getElementById("playerNameInput").value.trim();

  if (!roomCode)   { alert("Please enter a room code."); return; }
  if (!playerName) { alert("Please enter your name."); return; }

  myRoomCode = roomCode;
  const avatar = selectedAvatarDataUrl || generateDefaultAvatar(playerName, Math.floor(Math.random() * 10));

  socket.emit("player:join", { roomCode, playerName, avatar });
  joined = true;

  // Hide join form, show game screen
  document.getElementById("joinWrap").style.display = "none";
  document.getElementById("bgScene").style.display = "none";
  document.getElementById("musicNotes").style.display = "none";

  const gs = document.getElementById("gameScreen");
  gs.style.display = "flex";

  document.getElementById("headerRoomCode").textContent = roomCode;
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
  const phase       = state.gamePhase || "lobby";
  const players     = state.players || {};
  const myPlayer    = players[myId];
  const isMyTurn    = state.activePlayerId === myId;
  const activePlayer = players[state.activePlayerId];
  const allPlayers  = Object.values(players);
  const activeIdx   = allPlayers.findIndex(p => p.id === state.activePlayerId);

  // Mode pill
  const modePill = document.getElementById("modePill");
  if (state.selectedGameMode && state.selectedGameLabel) {
    modePill.style.display = "inline-flex";
    document.getElementById("modeIcon").textContent = modeIcon(state.selectedGameMode);
    document.getElementById("modeLabelText").textContent = state.selectedGameLabel;
  } else {
    modePill.style.display = "none";
  }

  // Phase banner
  setPhaseBanner(phase, isMyTurn);

  // Sections
  const waitingMsg      = document.getElementById("waitingMsg");
  const myTurnSection   = document.getElementById("myTurnSection");
  const pActiveSection  = document.getElementById("pActiveSection");
  const timerBlock      = document.getElementById("timerBlock");
  const pHintSection    = document.getElementById("pHintSection");
  const pJudgementSection = document.getElementById("pJudgementSection");

  if (!state.gameStarted) {
    waitingMsg.style.display = "block";
    waitingMsg.innerHTML = state.selectedGameMode
      ? `<p style="font-weight:700;font-size:1rem;">🎮 <span style="color:var(--purple)">${state.selectedGameLabel}</span></p><p class="status-text" style="margin-top:6px;">${state.selectedInstructions || "Waiting for host to start…"}</p>`
      : `<p class="status-text">Waiting for host to choose a game mode…</p>`;
    myTurnSection.style.display  = "none";
    pActiveSection.style.display = "none";
    timerBlock.style.display     = "none";
    pHintSection.style.display   = "none";
    pJudgementSection.style.display = "none";
  } else {
    waitingMsg.style.display = "none";

    // My turn banner
    if (isMyTurn && ["challenge","time_up","listening","blurred_continue","paused_ready","game_started"].includes(phase)) {
      myTurnSection.style.display = "block";
      document.getElementById("challengeText").textContent = state.selectedChallengeText || "It's your turn!";
    } else {
      myTurnSection.style.display = "none";
    }

    // Active player card (show when it's not my turn and game is active)
    if (activePlayer && !isMyTurn && phase !== "game_complete") {
      pActiveSection.style.display = "block";
      document.getElementById("pActiveAvatar").src = avatarSrc(activePlayer, activeIdx);
      document.getElementById("pActiveName").textContent = activePlayer.name;
      document.getElementById("pRoundLabel").textContent = `Round ${state.currentRound || 1} / ${state.totalRounds || 5}`;
    } else {
      pActiveSection.style.display = "none";
    }

    // Timer
    if (phase === "challenge") {
      timerBlock.style.display = "block";
      renderAnswerTimer(state.timer || 20);
    } else if (phase === "time_up") {
      timerBlock.style.display = "block";
      document.getElementById("pTimerVal").textContent = "0";
      document.getElementById("pTimerVal").className = "p-timer-val urgent";
    } else {
      timerBlock.style.display = "none";
    }

    // Hint
    const hintEl = document.getElementById("pHintText");
    if (state.currentHint && ["challenge","time_up","revealed","judged_correct","judged_wrong"].includes(phase)) {
      pHintSection.style.display = "block";
      hintEl.textContent = `Hint: ${state.currentHint}`;
    } else {
      pHintSection.style.display = "none";
    }

    // Judgement
    const judgeEl = document.getElementById("pJudgement");
    if (phase === "judged_correct") {
      pJudgementSection.style.display = "block";
      judgeEl.className = "p-judgement show correct";
      judgeEl.textContent = isMyTurn ? "✅ CORRECT! +100" : `✅ ${activePlayer?.name || "Player"} got it!`;
    } else if (phase === "judged_wrong") {
      pJudgementSection.style.display = "block";
      judgeEl.className = "p-judgement show wrong";
      judgeEl.textContent = isMyTurn ? "❌ WRONG!" : `❌ ${activePlayer?.name || "Player"} missed it.`;
    } else if (phase === "time_up") {
      pJudgementSection.style.display = "block";
      judgeEl.className = "p-judgement show wrong";
      judgeEl.textContent = "⏰ Time's Up!";
    } else {
      pJudgementSection.style.display = "none";
      judgeEl.className = "p-judgement";
    }
  }

  // ─── Video ───
  syncVideo(state, phase);

  // My score & rank
  const myScore  = myPlayer?.score || 0;
  document.getElementById("myScore").textContent = myScore;
  const sorted = [...allPlayers].sort((a, b) => (b.score || 0) - (a.score || 0));
  const myRank = sorted.findIndex(p => p.id === myId) + 1;
  document.getElementById("myRank").textContent = myRank > 0 ? `#${myRank}` : "—";

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

function syncVideo(state, phase) {
  const songs = state.songs || [];
  const currentSong = songs[state.currentTurnIndex || 0];
  const videoId = currentSong?.videoId;

  const pVideoContainer = document.getElementById("pVideoContainer");
  const pVideoBlur      = document.getElementById("pVideoBlur");
  const pNoVideo        = document.getElementById("pNoVideo");

  const videoPhases = ["listening","blurred_continue","paused_ready","challenge","time_up","revealed","judged_correct","judged_wrong"];
  const showVideo = !!(videoId && state.gameStarted && videoPhases.includes(phase));

  if (showVideo) {
    pNoVideo.style.display = "none";
    pVideoContainer.style.display = "block";

    // Only reinject iframe if the video changed
    if (lastVideoId !== videoId) {
      lastVideoId = videoId;
      const start = Math.max(0, Math.floor(currentSong.startTime || 0));
      // Keep blur overlay inside container, inject iframe before it
      const blurEl = pVideoContainer.querySelector("#pVideoBlur");
      pVideoContainer.innerHTML = `<iframe data-vid="${videoId}"
        src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&start=${start}&rel=0&playsinline=1"
        style="position:absolute;inset:0;width:100%;height:100%;border:none;"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; autoplay"
        allowfullscreen></iframe>`;
      // Re-add blur overlay
      const blur = document.createElement("div");
      blur.id = "pVideoBlur";
      blur.innerHTML = `<span>🙈</span><span class="blur-sub">LISTEN CAREFULLY…</span>`;
      pVideoContainer.appendChild(blur);
    }

    const blurOverlay = document.getElementById("pVideoBlur");
    if (blurOverlay) blurOverlay.style.display = state.isBlurred ? "flex" : "none";
  } else {
    pNoVideo.style.display = "flex";
    pVideoContainer.style.display = "none";
    if (lastVideoId !== null) {
      lastVideoId = null;
      pVideoContainer.innerHTML = `<div id="pVideoBlur"><span>🙈</span><span class="blur-sub">LISTEN CAREFULLY…</span></div>`;
    }
  }
}

function setPhaseBanner(phase, isMyTurn) {
  const banner = document.getElementById("pPhaseBanner");
  if (!banner) return;
  const map = {
    lobby:            ["ph-lobby",    "Waiting for host…"],
    game_started:     ["ph-listening","Game Starting!"],
    listening:        ["ph-listening","🎵 Listen to the song…"],
    blurred_continue: ["ph-blurred",  "🙈 Video blurred — keep listening…"],
    paused_ready:     ["ph-challenge","Get ready to answer!"],
    challenge:        ["ph-challenge", isMyTurn ? "🎤 YOUR TURN — answer out loud!" : "⏱ Player is answering…"],
    time_up:          ["ph-wrong",    "⏰ Time's Up!"],
    revealed:         ["ph-listening","🔍 Revealing answer…"],
    judged_correct:   ["ph-correct",  "✅ Correct!"],
    judged_wrong:     ["ph-wrong",    "❌ Wrong!"],
    game_complete:    ["ph-complete", "🏆 Game Over!"],
  };
  const [cls, text] = map[phase] || ["ph-lobby", phase];
  banner.className = `player-phase-banner ${cls}`;
  banner.textContent = text;
}

function renderAnswerTimer(timer) {
  const el = document.getElementById("pTimerVal");
  if (!el) return;
  el.textContent = timer;
  el.className = "p-timer-val" + (timer <= 5 ? " urgent" : "");
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
