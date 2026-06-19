/* ═══════════════════════════════════════════
   NightOwl Karaoke Game Night — host.js
═══════════════════════════════════════════ */

const socket = io();
const roomCode = new URLSearchParams(location.search).get("room") || makeRoomCode();
history.replaceState(null, "", `/?room=${roomCode}`);
document.getElementById("roomCodeDisplay").textContent = roomCode;

let ytPlayer = null;
let ytReady = false;
let currentState = null;
let gameModes = {};
let dismissTimer = null;

const DEFAULT_PLAYLIST = "PL1YIQKuD6ijT4-gFNqNmLDDtvCuxLt8AC";

const PLAYLIST_SONGS = [
  { label: "Christina Perri - A Thousand Years",         url: "https://www.youtube.com/watch?v=j1V33b2ZEIo", startTime: "" },
  { label: "Evanescence - My Immortal",                  url: "https://www.youtube.com/watch?v=Dv4s4KFptCE", startTime: "" },
  { label: "Lara Fabian - Broken Vow",                   url: "https://www.youtube.com/watch?v=AHxttSwL_Ws", startTime: "" },
  { label: "Maybe This Time - Sarah Geronimo",           url: "https://www.youtube.com/watch?v=eeQIFrjZGEQ", startTime: "" },
  { label: "Paramore - The Only Exception",              url: "https://www.youtube.com/watch?v=yCXcs2B8du0", startTime: "" },
  { label: "The Greatest Showman - A Million Dreams",    url: "https://www.youtube.com/watch?v=fcWSsUQlxhc", startTime: "" },
  { label: "Evanescence - Bring Me To Life",             url: "https://www.youtube.com/watch?v=8nS4ylMD5xw", startTime: "" },
  { label: "Katy Perry - The One That Got Away",         url: "https://www.youtube.com/watch?v=47HdJaVBN3U", startTime: "" },
  { label: "Shania Twain - You're Still the One",        url: "https://www.youtube.com/watch?v=4wXKaFmct8A", startTime: "" },
  { label: "Taylor Swift - Teardrops On My Guitar",      url: "https://www.youtube.com/watch?v=QsKyGaBouhE", startTime: "" },
  { label: "Bruno Mars - Risk It All",                   url: "https://www.youtube.com/watch?v=7Eq8P2oLD6E", startTime: "" },
  { label: "Justin Bieber - That Should Be Me",          url: "https://www.youtube.com/watch?v=q0EIZUstXwI", startTime: "" },
  { label: "Katharine McPhee - Terrified",               url: "https://www.youtube.com/watch?v=YQiCV3vLD0c", startTime: "" },
  { label: "Gloc-9 - Upuan",                             url: "https://www.youtube.com/watch?v=2Bz69v5SPss", startTime: "" },
  { label: "Olivia Rodrigo - drivers license",           url: "https://www.youtube.com/watch?v=C3y6jGCXiUA", startTime: "" },
];

/* ─── AVATAR HELPER ─── */
function makeDefaultAvatar(name, colorIndex) {
  const colors = ["#b44fff","#00d4ff","#ff3fa4","#00ff88","#ffd700","#ff6b35","#7c3aed","#06b6d4"];
  const c = colors[colorIndex % colors.length];
  const canvas = document.createElement("canvas");
  canvas.width = 80; canvas.height = 80;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(40, 40, 40, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText((name || "?").charAt(0).toUpperCase(), 40, 40);
  return canvas.toDataURL("image/png");
}

function avatarSrc(player, index = 0) {
  return player?.avatar || makeDefaultAvatar(player?.name || "?", index);
}

/* ─── ROOM CODE ─── */
function makeRoomCode() {
  return "OWL" + Math.floor(100 + Math.random() * 900);
}

/* ─── YOUTUBE PLAYER (direct iframe — works on all domains) ─── */
let ytIframe = null;

function loadVideoDirectly(videoId, startSeconds) {
  if (!videoId) return;
  const container = document.getElementById("ytPlayer");
  const start = Math.max(0, Math.floor(startSeconds || 0));
  container.innerHTML = `<iframe id="ytDirectIframe"
    src="https://www.youtube.com/embed/${videoId}?autoplay=1&start=${start}&rel=0&playsinline=1&enablejsapi=1"
    width="100%" height="100%" frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; autoplay"
    allowfullscreen></iframe>`;
  ytIframe = document.getElementById("ytDirectIframe");
  // Provide postMessage-based controls so existing play/pause buttons keep working
  ytPlayer = {
    playVideo:    () => ytIframe?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*'),
    pauseVideo:   () => ytIframe?.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*'),
    seekTo:       (t) => ytIframe?.contentWindow?.postMessage(`{"event":"command","func":"seekTo","args":[${t},true]}`, '*'),
    loadVideoById:({ videoId: v, startSeconds: s }) => loadVideoDirectly(v, s || 0),
    loadPlaylist: () => {},
  };
  ytReady = true;
}

/* Keep YouTube API as optional fallback for playlist mode */
window.onYouTubeIframeAPIReady = function () { ytReady = true; };

function ytPlay(startTime) {
  if (startTime > 0 && ytPlayer?.seekTo) ytPlayer.seekTo(startTime);
  ytPlayer?.playVideo?.();
}
function ytPause() { ytPlayer?.pauseVideo?.(); }

/* Parse "1:23" or "83" → seconds */
function parseTime(val) {
  if (!val || !String(val).trim()) return 0;
  const s = String(val).trim();
  if (s.includes(":")) {
    const parts = s.split(":").map(Number);
    if (parts.length === 2) return (parts[0] * 60) + (parts[1] || 0);
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + (parts[2] || 0);
  }
  return Math.max(0, parseFloat(s) || 0);
}

/* Format seconds → "M:SS" for display */
function formatTime(sec) {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function ytLoadPlaylist(id) {
  if (!id || !ytPlayer?.loadPlaylist) return;
  ytPlayer.loadPlaylist({ list: id, listType: "playlist" });
}

/* ─── SOCKET ─── */
socket.emit("host:create", { roomCode });

socket.on("gameModes", (modes) => {
  gameModes = modes;
  renderModeCards();
});

socket.on("room:state", (state) => {
  currentState = state;
  syncUI(state);
});

socket.on("timer:tick", ({ timer, timerType }) => {
  if (currentState) { currentState.timer = timer; currentState.timerType = timerType; }
  renderTimer(timer, timerType);
});

socket.on("youtube:control", ({ action, startTime }) => {
  if (action === "play")  ytPlay(startTime || 0);
  if (action === "pause") ytPause();
});

socket.on("youtube:update", ({ playlistId }) => {
  if (playlistId) ytLoadPlaylist(playlistId);
});

socket.on("player:joined", ({ name, avatar }) => {
  showToast(`🎤 ${name} joined the stage!`, avatar);
});

socket.on("game:start", ({ label }) => {
  showGameStartAnimation(label);
});

socket.on("setup:saved", () => {
  const msg = document.getElementById("setupSavedMsg");
  msg.style.display = "block";
  setTimeout(() => { msg.style.display = "none"; }, 2000);
});

/* ─── MAIN UI SYNC ─── */
function syncUI(state) {
  renderNavTabs(state);
  renderDashboard(state);
  renderSetup(state);
  renderLive(state);
  renderLeaderboardPanel(state);
  renderFullLeaderboard(state);
  updatePlayerCount(state);

  if (state.gamePhase === "judged_correct") showCorrectOverlay(state);
  if (state.gamePhase === "judged_wrong")   showWrongOverlay(state);
  if (state.gamePhase === "game_complete")  showWinnerOverlay(state);
}

/* ─── NAV TABS ─── */
const TABS = ["dashboard", "setup", "live", "leaderboard"];

function switchTab(tab) {
  TABS.forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle("active", t === tab);
    document.getElementById(`nav${cap(t)}`).classList.toggle("active", t === tab);
  });
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function renderNavTabs(state) {
  const setupBtn = document.getElementById("navSetup");
  const liveBtn  = document.getElementById("navLive");
  const lbBtn    = document.getElementById("navLeaderboard");

  setupBtn.disabled = !state.selectedGameMode;
  liveBtn.disabled  = !state.gameStarted;
  lbBtn.disabled    = !state.gameStarted;

  // Step hint
  const hint = document.getElementById("stepHintText");
  if (hint) {
    if (state.gamePhase === "game_complete") {
      hint.innerHTML = `🏆 Game over! Check the <strong style="color:var(--gold)">Leaderboard</strong> tab for final results.`;
    } else if (state.gameStarted) {
      hint.innerHTML = `🎤 Game is live! Use <strong style="color:var(--cyan)">Live Game</strong> tab to control turns.`;
    } else if (state.selectedGameMode) {
      const count = Object.keys(state.players || {}).length;
      hint.innerHTML = count
        ? `✅ Mode selected. ${count} player${count !== 1 ? "s" : ""} joined. Click <strong style="color:var(--green)">Start Game</strong> in Setup when ready!`
        : `✅ Mode selected! Now share the join link so players can join, then click <strong style="color:var(--green)">Start Game</strong> in Setup.`;
    } else {
      hint.innerHTML = `👉 Step 1: Click <strong style="color:var(--purple)">Select Game</strong> on a game mode card below to get started`;
    }
  }

  // Auto-switch tabs based on dashboardPhase
  const phase = state.dashboardPhase;
  if (phase === "setup" && !state.gameStarted) {
    // Only switch if user is on dashboard
    if (document.getElementById("tab-dashboard").classList.contains("active")) {
      switchTab("setup");
    }
  }
  if (phase === "live" && state.gameStarted) {
    if (!document.getElementById("tab-live").classList.contains("active") &&
        !document.getElementById("tab-leaderboard").classList.contains("active")) {
      switchTab("live");
    }
  }
}

/* ─── DASHBOARD ─── */
function renderModeCards() {
  const container = document.getElementById("modeCards");
  container.innerHTML = "";
  const modes = ["lyrics", "title", "artist"];
  modes.forEach(key => {
    const m = gameModes[key];
    if (!m) return;
    const card = document.createElement("div");
    card.className = "mode-card";
    card.innerHTML = `
      <span class="mode-icon">${m.icon}</span>
      <h3>${m.label}</h3>
      <p>${m.description}</p>
      <button class="mode-select-btn" data-mode="${key}">Select Game</button>
    `;
    const selectMode = () => socket.emit("host:selectGameMode", { roomCode, mode: key });
    card.addEventListener("click", selectMode);
    card.querySelector("button").addEventListener("click", (e) => { e.stopPropagation(); selectMode(); });
    container.appendChild(card);
  });
}

function renderDashboard(state) {
  // Highlight selected mode card
  document.querySelectorAll(".mode-card").forEach(card => {
    const btn = card.querySelector("button");
    const mode = btn?.dataset.mode;
    const isSelected = mode === state.selectedGameMode;
    card.classList.toggle("selected", isSelected);
    const badge = card.querySelector(".selected-badge");
    if (isSelected && !badge) {
      const b = document.createElement("span"); b.className = "selected-badge"; b.textContent = "✓ Selected";
      card.appendChild(b);
    } else if (!isSelected && badge) { badge.remove(); }
  });

  renderPlayersGrid("dashPlayers", state);

  const count = Object.keys(state.players || {}).length;
  document.getElementById("dashPlayerCount").textContent = `${count} joined`;
}

/* ─── SETUP ─── */
let songListInit = false;
function renderSetup(state) {
  if (state.selectedGameMode && gameModes[state.selectedGameMode]) {
    document.getElementById("setupModeLabel").textContent = gameModes[state.selectedGameMode].label;
  }
  renderPlayersGrid("setupPlayers", state);
  document.getElementById("startGameBtn").disabled =
    Object.keys(state.players || {}).length === 0 || !state.selectedGameMode;

  // Init song rows from state on first load
  if (!songListInit) {
    songListInit = true;
    const rounds = state.totalRounds || 5;
    if (state.songs?.length) {
      syncSongListFromState(state);
    } else {
      // Pre-fill from playlist songs, trimmed to round count
      songRows = PLAYLIST_SONGS.slice(0, rounds).map(s => ({ ...s }));
      while (songRows.length < rounds) songRows.push({ label: "", url: "", startTime: "" });
      buildSongRows(document.getElementById("songList"));
    }
    // Keep rows in sync when rounds slider changes
    document.getElementById("roundsRange").addEventListener("input", () => {
      const n = parseInt(document.getElementById("roundsRange").value);
      renderSongList(n);
    });
  }
}

/* ─── LIVE GAME ─── */
const PHASE_TEXT = {
  lobby:         "Waiting to start…",
  game_started:  "Ready — Start Turn when ready",
  listening:     "🎵 Listening…",
  paused_ready:  "⏸ Song Paused — Continue Blurred",
  blurred_continue: "🙈 Listen Carefully…",
  challenge:     "⚡ Challenge Time!",
  time_up:       "⏰ Time's Up!",
  revealed:      "👁 Answer Revealed",
  judged_correct:"✅ Correct!",
  judged_wrong:  "❌ Wrong!",
  game_complete: "🏆 Game Complete!",
};
const PHASE_CLASS = {
  lobby: "ph-lobby", game_started: "ph-lobby",
  listening: "ph-listening",
  paused_ready: "ph-paused_ready",
  blurred_continue: "ph-blurred",
  challenge: "ph-challenge",
  time_up: "ph-time_up",
  revealed: "ph-revealed",
  judged_correct: "ph-correct",
  judged_wrong: "ph-wrong",
  game_complete: "ph-complete",
};

function renderLive(state) {
  const phase = state.gamePhase || "lobby";

  // Phase banner
  const banner = document.getElementById("phaseBanner");
  banner.textContent = PHASE_TEXT[phase] || phase;
  banner.className = "phase-banner " + (PHASE_CLASS[phase] || "ph-lobby");

  // Active player
  const players = state.players || {};
  const playerList = Object.values(players);
  const activePlayer = players[state.activePlayerId];
  const activeIdx = playerList.findIndex(p => p.id === state.activePlayerId);

  const avatarEl = document.getElementById("liveActiveAvatar");
  const nameEl   = document.getElementById("liveActiveName");
  if (activePlayer) {
    avatarEl.src = avatarSrc(activePlayer, activeIdx);
    avatarEl.alt = activePlayer.name;
    nameEl.textContent = activePlayer.name;
  } else {
    avatarEl.src = makeDefaultAvatar("?", 0);
    nameEl.textContent = "—";
  }

  // Round badge + current song label
  const songs = state.songs || [];
  const currSong = songs[(state.currentTurnIndex || 0)];
  const roundLabel = `Round ${state.currentRound || 1} / ${state.totalRounds || 5}`;
  document.getElementById("liveRoundBadge").textContent = roundLabel;
  const songLabel = document.getElementById("liveSongLabel");
  if (songLabel) songLabel.textContent = currSong?.label ? `🎵 ${currSong.label}` : "";

  // Next player
  const nextIdx = (state.currentTurnIndex || 0) + 1;
  if (state.turnOrder && nextIdx < state.turnOrder.length) {
    const nextId = state.turnOrder[nextIdx];
    const nextP  = players[nextId];
    document.getElementById("liveNextPlayer").textContent = nextP ? `Next: ${nextP.name}` : "";
  } else {
    document.getElementById("liveNextPlayer").textContent = nextIdx >= (state.turnOrder?.length || 0) ? "Last round!" : "";
  }

  // Turn strip
  renderTurnStrip(state);

  // Video blur overlay
  document.getElementById("videoBlurOverlay").classList.toggle("on", !!state.isBlurred);

  // Answer reveal
  const answerReveal = document.getElementById("answerReveal");
  answerReveal.textContent = state.currentAnswer || "";
  answerReveal.classList.toggle("show", !!state.isAnswerRevealed && !!state.currentAnswer);
  document.getElementById("hintReveal").textContent = state.currentHint ? `Hint: ${state.currentHint}` : "";

  // Answer field labels
  if (state.selectedAnswerLabel) {
    document.getElementById("answerFieldLabel").textContent = state.selectedAnswerLabel;
    document.getElementById("answerLabelText").textContent = state.selectedAnswerLabel;
  }

  // Sync input fields if not manually edited
  const ansIn   = document.getElementById("answerInput");
  const hintIn  = document.getElementById("hintInput");
  const noteIn  = document.getElementById("noteInput");
  const startIn = document.getElementById("startTimeInput");
  if (!ansIn.dataset.dirty)   ansIn.value   = state.currentAnswer || "";
  if (!hintIn.dataset.dirty)  hintIn.value  = state.currentHint || "";
  if (!noteIn.dataset.dirty)  noteIn.value  = state.currentRoundNote || "";
  if (!startIn.dataset.dirty) startIn.value = state.currentStartTime > 0 ? formatTime(state.currentStartTime) : "";

  // Button states
  const inGame = state.gameStarted && phase !== "game_complete";
  document.getElementById("startTurnBtn").disabled     = !inGame || ["listening","blurred_continue"].includes(phase);
  document.getElementById("continueBlurBtn").disabled  = phase !== "paused_ready";
  document.getElementById("openChallengeBtn").disabled = !["paused_ready","blurred_continue","listening"].includes(phase);
  document.getElementById("resetTurnBtn").disabled     = !inGame;
  document.getElementById("nextTurnBtn").disabled      = !["judged_correct","judged_wrong","time_up","revealed"].includes(phase);

  const canJudge = ["challenge","time_up","revealed"].includes(phase) && !state.hasScoredCurrentTurn;
  document.getElementById("correctBtn").disabled = !canJudge;
  document.getElementById("wrongBtn").disabled   = !["challenge","time_up","revealed"].includes(phase);

  // Timer visibility
  const showTimer = state.timer > 0 && state.timerType;
  document.getElementById("timerWrap").style.display = showTimer ? "block" : "none";
  renderTimer(state.timer, state.timerType);
}

function renderTurnStrip(state) {
  const strip = document.getElementById("turnStrip");
  strip.innerHTML = "";
  if (!state.turnOrder?.length) return;
  const players = state.players || {};

  state.turnOrder.forEach((pid, idx) => {
    const p = players[pid];
    if (!p) return;
    const isCurrent = idx === state.currentTurnIndex;
    const chip = document.createElement("div");
    chip.className = "turn-chip" + (isCurrent ? " current" : "");
    chip.innerHTML = `
      <img class="avatar" src="${avatarSrc(p, idx)}" alt="${p.name}" />
      <span class="turn-chip-name">${p.name.split(" ")[0]}</span>
    `;
    strip.appendChild(chip);
  });
}

/* ─── TIMER DISPLAY ─── */
function renderTimer(timer, timerType) {
  if (!timerType || timer === undefined) return;
  const labels = { listening: "Listening", blur: "Blurred Listen", answer: "Answer Time" };
  document.getElementById("timerLabel").textContent = labels[timerType] || "Timer";
  const el = document.getElementById("timerVal");
  el.textContent = timer;
  el.className = "timer-val" + (timer <= 5 && timerType === "answer" ? " urgent" : "");
  document.getElementById("timerWrap").style.display = "block";
}

/* ─── LEADERBOARD ─── */
function renderLeaderboardPanel(state) {
  const lb = buildLeaderboard(state);
  const ul = document.getElementById("liveLb");
  ul.innerHTML = "";
  lb.forEach((p, i) => renderLbRow(ul, p, i, state.activePlayerId));
}

function renderFullLeaderboard(state) {
  const lb = buildLeaderboard(state);
  const ul = document.getElementById("fullLb");
  ul.innerHTML = "";
  lb.forEach((p, i) => renderLbRow(ul, p, i, state.activePlayerId));

  if (state.gamePhase === "game_complete") {
    document.getElementById("lbPageTitle").textContent = "🏆 Final Leaderboard";
    document.getElementById("lbPageSub").textContent = "Game over — great game!";
  }
}

function buildLeaderboard(state) {
  return Object.values(state.players || {})
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

function renderLbRow(ul, player, index, activePlayerId) {
  const li = document.createElement("li");
  const isFirst  = index === 0;
  const isActive = player.id === activePlayerId;
  li.className = "lb-row" + (isFirst ? " rank-1" : "") + (isActive ? " active-player" : "");
  li.innerHTML = `
    ${isFirst ? '<span class="crown">👑</span>' : ""}
    <span class="lb-rank">${index + 1}</span>
    <img class="avatar" src="${avatarSrc(player, index)}" alt="${player.name}" style="width:32px;height:32px;" />
    <span class="lb-name">${player.name}</span>
    <span class="lb-score">${player.score || 0}</span>
  `;
  ul.appendChild(li);
}

/* ─── PLAYERS GRID (shared) ─── */
function renderPlayersGrid(containerId, state) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const players = Object.values(state.players || {});
  if (!players.length) {
    wrap.innerHTML = `<span class="status-text italic">No players yet — share the join link.</span>`;
    return;
  }
  wrap.innerHTML = "";
  players.forEach((p, i) => {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.innerHTML = `
      <img class="avatar" src="${avatarSrc(p, i)}" alt="${p.name}" />
      <span class="chip-name">${p.name}</span>
      <span class="chip-score">${p.score || 0} pts</span>
    `;
    wrap.appendChild(chip);
  });
}

function updatePlayerCount(state) {
  const count = Object.keys(state.players || {}).length;
  document.getElementById("playerCountText").textContent = `${count} player${count !== 1 ? "s" : ""}`;
}

/* ─── OVERLAYS ─── */
let overlayActive = false;

function showCorrectOverlay(state) {
  if (overlayActive) return;
  overlayActive = true;
  const player = (state.players || {})[state.activePlayerId];
  const idx = Object.keys(state.players || {}).indexOf(state.activePlayerId);
  document.getElementById("correctAvatar").src = avatarSrc(player, idx);
  document.getElementById("correctName").textContent = player?.name || "";
  document.getElementById("correctOverlay").classList.add("show");
  fireConfetti();
  clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => dismissOverlays(), 4000);
}

function showWrongOverlay(state) {
  if (overlayActive) return;
  overlayActive = true;
  const player = (state.players || {})[state.activePlayerId];
  const idx = Object.keys(state.players || {}).indexOf(state.activePlayerId);
  document.getElementById("wrongAvatar").src = avatarSrc(player, idx);
  document.getElementById("wrongName").textContent = player?.name || "";
  document.getElementById("wrongOverlay").classList.add("show");
  clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => dismissOverlays(), 3000);
}

function dismissOverlays() {
  overlayActive = false;
  document.getElementById("correctOverlay").classList.remove("show");
  document.getElementById("wrongOverlay").classList.remove("show");
}

function showWinnerOverlay(state) {
  const lb = buildLeaderboard(state);
  const winner = lb[0];
  if (!winner) return;
  const idx = 0;
  document.getElementById("winnerAvatar").src = avatarSrc(winner, idx);
  document.getElementById("winnerName").textContent = winner.name;
  document.getElementById("winnerScore").textContent = `${winner.score} points`;
  const finalLb = document.getElementById("finalLb");
  finalLb.innerHTML = "";
  lb.forEach((p, i) => renderLbRow(finalLb, p, i, null));
  document.getElementById("winnerOverlay").classList.add("show");
  fireConfetti();
  setTimeout(fireConfetti, 1200);
}

function showGameStartAnimation(label) {
  const overlay = document.getElementById("gameStartOverlay");
  document.getElementById("gameStartText").textContent = "LET'S SING!";
  document.getElementById("gameStartSub").textContent = label || "Game starting…";
  overlay.classList.add("show");
  fireConfetti();
  setTimeout(() => { overlay.classList.remove("show"); }, 2800);
}

/* ─── CONFETTI ─── */
function fireConfetti() {
  const canvas = document.getElementById("confettiCanvas");
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height * 0.5,
    r: 4 + Math.random() * 6,
    d: 2 + Math.random() * 4,
    color: ["#b44fff","#00d4ff","#ff3fa4","#ffd700","#00ff88","#ff6b35"][Math.floor(Math.random()*6)],
    tilt: Math.random() * 10 - 5,
    tiltAngle: 0,
    tiltInc: 0.07 * Math.random(),
    opacity: 1,
  }));
  let frame;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = p.opacity;
      ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
      ctx.stroke();
      p.y += p.d;
      p.tiltAngle += p.tiltInc;
      p.tilt = Math.sin(p.tiltAngle) * 12;
      p.opacity -= 0.008;
    });
    if (pieces.some(p => p.opacity > 0)) {
      frame = requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  cancelAnimationFrame(frame);
  draw();
}

/* ─── TOAST ─── */
function showToast(msg, avatar) {
  const wrap = document.getElementById("toastWrap");
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = avatar
    ? `<img class="avatar" src="${avatar}" style="width:28px;height:28px;" /><span>${msg}</span>`
    : `<span>${msg}</span>`;
  wrap.appendChild(t);
  setTimeout(() => {
    t.classList.add("fade-out");
    setTimeout(() => t.remove(), 350);
  }, 3200);
}

/* ─── FLOATING MUSIC NOTES ─── */
function spawnNotes() {
  const notes = ["🎵","🎶","🎤","🎸","🎹","🥁","🎼"];
  const container = document.getElementById("musicNotes");
  setInterval(() => {
    const el = document.createElement("span");
    el.className = "note";
    el.textContent = notes[Math.floor(Math.random() * notes.length)];
    el.style.left = Math.random() * 100 + "vw";
    el.style.animationDuration = (6 + Math.random() * 6) + "s";
    el.style.animationDelay = Math.random() * 2 + "s";
    el.style.fontSize = (16 + Math.random() * 20) + "px";
    container.appendChild(el);
    setTimeout(() => el.remove(), 10000);
  }, 2200);
}

/* ─── YOUTUBE EXTRACT ─── */
function extractPlaylistId(url) {
  try {
    const u = new URL(url.includes("://") ? url : "https://x.com?" + url);
    return u.searchParams.get("list") || "";
  } catch {
    if (/^[A-Za-z0-9_-]{10,}$/.test(url.trim())) return url.trim();
    return url.trim();
  }
}

function extractVideoId(input) {
  if (!input) return "";
  const s = input.trim();
  // embed code: src="https://www.youtube.com/embed/VIDEO_ID..."
  const embedMatch = s.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{8,})/);
  if (embedMatch) return embedMatch[1];
  try {
    const u = new URL(s.includes("://") ? s : "https://" + s);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    if (u.pathname.includes("/embed/")) return u.pathname.split("/embed/")[1].split("?")[0];
    return u.searchParams.get("v") || "";
  } catch { return ""; }
}

/* ─── SONG LIST (Setup) ─── */
let songRows = []; // [{ label, url, startTime }]

function renderSongList(count) {
  const container = document.getElementById("songList");
  while (songRows.length < count) {
    const next = PLAYLIST_SONGS[songRows.length] || { label: "", url: "", startTime: "" };
    songRows.push({ ...next });
  }
  if (songRows.length > count) songRows = songRows.slice(0, count);
  buildSongRows(container);
}

function buildSongRows(container) {
  container.innerHTML = "";
  songRows.forEach((song, i) => {
    const row = document.createElement("div");
    row.style.cssText = "display:grid;grid-template-columns:60px 1fr 2fr 90px auto;gap:8px;align-items:center;";
    row.innerHTML = `
      <span class="round-badge" style="text-align:center;">R${i + 1}</span>
      <input type="text" class="sl-label" placeholder="Song name" value="${escHtml(song.label)}" style="margin-bottom:0;" />
      <input type="text" class="sl-url" placeholder="Paste YouTube URL or embed code" value="${escHtml(song.url)}" style="margin-bottom:0;" />
      <input type="text" class="sl-time" placeholder="0:00" value="${escHtml(song.startTime)}" style="margin-bottom:0;font-variant-numeric:tabular-nums;" />
      <button class="btn btn-ghost btn-sm sl-remove" title="Remove">✕</button>
    `;
    row.querySelector(".sl-label").addEventListener("input", e => { songRows[i].label = e.target.value; });
    row.querySelector(".sl-url").addEventListener("input",  e => { songRows[i].url   = e.target.value; });
    row.querySelector(".sl-time").addEventListener("input", e => { songRows[i].startTime = e.target.value; });
    row.querySelector(".sl-time").addEventListener("blur",  e => {
      const sec = parseTime(e.target.value);
      if (sec > 0) { e.target.value = formatTime(sec); songRows[i].startTime = formatTime(sec); }
    });
    row.querySelector(".sl-remove").addEventListener("click", () => {
      songRows.splice(i, 1);
      buildSongRows(container);
    });
    container.appendChild(row);
  });
}

function addSongRow() {
  songRows.push({ label: "", url: "", startTime: "" });
  buildSongRows(document.getElementById("songList"));
}

function saveSongs() {
  const songs = songRows.map(s => ({
    label:     s.label.trim(),
    videoId:   extractVideoId(s.url),
    startTime: parseTime(s.startTime),
    rawUrl:    s.url.trim(),
  }));
  socket.emit("host:saveSongs", { roomCode, songs });
}

function escHtml(s) { return String(s || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;"); }

/* Sync song list from state (e.g. after reset/reload) */
function syncSongListFromState(state) {
  if (!state.songs?.length) return;
  songRows = state.songs.map(s => ({
    label:     s.label || "",
    url:       s.rawUrl || (s.videoId ? `https://www.youtube.com/watch?v=${s.videoId}` : ""),
    startTime: s.startTime > 0 ? formatTime(s.startTime) : "",
  }));
  buildSongRows(document.getElementById("songList"));
}

/* ─── EVENT LISTENERS ─── */

// Copy join link
document.getElementById("copyJoinBtn").addEventListener("click", async () => {
  const link = `${location.origin}/join.html?room=${roomCode}`;
  await navigator.clipboard.writeText(link).catch(() => {});
  const btn = document.getElementById("copyJoinBtn");
  const orig = btn.textContent;
  btn.textContent = "✓ Copied!";
  setTimeout(() => btn.textContent = orig, 1500);
});

// Nav tab buttons
document.querySelectorAll(".nav-btn[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!btn.disabled) switchTab(btn.dataset.tab);
  });
});

// Dashboard: mode cards handled dynamically in renderModeCards()

// Back to dashboard
document.getElementById("backToDashBtn").addEventListener("click", () => {
  switchTab("dashboard");
});

// Setup: range sliders
["rounds","listen","blur","answer"].forEach(key => {
  const range = document.getElementById(key + "Range");
  const val   = document.getElementById(key + "Val");
  if (!range || !val) return;
  const suffix = key === "rounds" ? "" : "s";
  range.addEventListener("input", () => {
    val.textContent = range.value + suffix;
  });
});

// Save setup
document.getElementById("saveSetupBtn").addEventListener("click", () => {
  const playlistRaw = document.getElementById("playlistInput").value.trim();
  socket.emit("host:saveSetup", {
    roomCode,
    totalRounds:       document.getElementById("roundsRange").value,
    listeningDuration: document.getElementById("listenRange").value,
    blurDuration:      document.getElementById("blurRange").value,
    answerDuration:    document.getElementById("answerRange").value,
    playlistId:        playlistRaw ? extractPlaylistId(playlistRaw) : "",
  });
});

// Song list buttons
document.getElementById("addSongBtn").addEventListener("click",  addSongRow);
document.getElementById("addSongBtn2").addEventListener("click", addSongRow);
document.getElementById("saveSongsBtn").addEventListener("click", saveSongs);
socket.on("songs:saved", () => {
  const msg = document.getElementById("songsSavedMsg");
  msg.style.display = "block";
  setTimeout(() => { msg.style.display = "none"; }, 2200);
  showToast("✓ Songs saved!");
});

// Load playlist (legacy — kept for reference)
document.getElementById("loadPlaylistBtn").addEventListener("click", () => {
  const raw = document.getElementById("playlistInput").value.trim();
  const pid = extractPlaylistId(raw) || raw;
  if (!pid) { showToast("⚠️ Paste a YouTube playlist URL or ID first."); return; }
  socket.emit("host:updatePlaylist", { roomCode, playlistId: pid });
  ytLoadPlaylist(pid);
  showSetupYtPreview(pid);
  showToast("🎵 Playlist loaded!");
});

function showSetupYtPreview(playlistId) {
  const wrap  = document.getElementById("setupYtPreview");
  const frame = document.getElementById("setupYtFrame");
  const msg   = document.getElementById("setupYtMsg");
  if (!playlistId) { wrap.style.display = "none"; return; }
  frame.src = `https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=0&rel=0&modestbranding=1`;
  wrap.style.display = "block";
  msg.textContent = `✓ Playlist loaded (ID: ${playlistId}) — this is what will play during the game.`;
}

// Start game
document.getElementById("startGameBtn").addEventListener("click", () => {
  socket.emit("host:startGame", { roomCode });
});

// Reset game
document.getElementById("resetGameBtn").addEventListener("click", () => {
  if (confirm("Reset game? All scores and progress will be cleared.")) {
    socket.emit("host:resetGame", { roomCode });
    switchTab("dashboard");
    dismissOverlays();
    document.getElementById("winnerOverlay").classList.remove("show");
  }
});

// Video controls
document.getElementById("vcPlay").addEventListener("click", () => {
  ytPlay();
  socket.emit("host:videoControl", { roomCode, action: "play" });
});
document.getElementById("vcPause").addEventListener("click", () => {
  ytPause();
  socket.emit("host:videoControl", { roomCode, action: "pause" });
});
document.getElementById("vcBlur").addEventListener("click", () => {
  socket.emit("host:setBlur", { roomCode, blurred: true });
});
document.getElementById("vcReveal").addEventListener("click", () => {
  socket.emit("host:setBlur", { roomCode, blurred: false });
});

// Save answer
document.getElementById("answerInput").addEventListener("input", function() { this.dataset.dirty = "1"; });
document.getElementById("hintInput").addEventListener("input", function() { this.dataset.dirty = "1"; });
document.getElementById("noteInput").addEventListener("input", function() { this.dataset.dirty = "1"; });
document.getElementById("startTimeInput").addEventListener("input", function() { this.dataset.dirty = "1"; });
document.getElementById("startTimeInput").addEventListener("blur", function() {
  const sec = parseTime(this.value);
  if (sec > 0) this.value = formatTime(sec); // normalise "90" → "1:30"
});

document.getElementById("saveAnswerBtn").addEventListener("click", () => {
  const answer    = document.getElementById("answerInput").value.trim();
  const hint      = document.getElementById("hintInput").value.trim();
  const note      = document.getElementById("noteInput").value.trim();
  const startTime = parseTime(document.getElementById("startTimeInput").value);
  delete document.getElementById("answerInput").dataset.dirty;
  delete document.getElementById("hintInput").dataset.dirty;
  delete document.getElementById("noteInput").dataset.dirty;
  delete document.getElementById("startTimeInput").dataset.dirty;
  socket.emit("host:updateTurnData", { roomCode, answer, hint, note, startTime });
  showToast("✓ Answer saved" + (startTime > 0 ? ` · Start at ${formatTime(startTime)}` : ""));
});

document.getElementById("revealAnswerBtn").addEventListener("click", () => {
  socket.emit("host:revealAnswer", { roomCode });
});

// Turn controls
document.getElementById("startTurnBtn").addEventListener("click", () => {
  const songs   = currentState?.songs || [];
  const idx     = currentState?.currentTurnIndex || 0;
  const song    = songs[idx] || null;
  const manualStartTime = parseTime(document.getElementById("startTimeInput").value);
  const startTime = song?.startTime ?? manualStartTime;

  if (song?.videoId) {
    loadVideoDirectly(song.videoId, startTime);
    if (song.label) showToast(`🎵 ${song.label}`);
  } else {
    ytPlay(startTime);
  }

  socket.emit("host:startTurn", { roomCode, startTime });
});
document.getElementById("continueBlurBtn").addEventListener("click", () => {
  socket.emit("host:continueBlurred", { roomCode });
});
document.getElementById("openChallengeBtn").addEventListener("click", () => {
  socket.emit("host:openChallenge", { roomCode });
});
document.getElementById("resetTurnBtn").addEventListener("click", () => {
  socket.emit("host:resetTurn", { roomCode });
});
document.getElementById("nextTurnBtn").addEventListener("click", () => {
  dismissOverlays();
  socket.emit("host:nextTurn", { roomCode });
  // Clear dirty flags on answer inputs
  delete document.getElementById("answerInput").dataset.dirty;
  delete document.getElementById("hintInput").dataset.dirty;
  delete document.getElementById("noteInput").dataset.dirty;
  delete document.getElementById("startTimeInput").dataset.dirty;
  document.getElementById("answerInput").value = "";
  document.getElementById("hintInput").value = "";
  document.getElementById("noteInput").value = "";
  document.getElementById("startTimeInput").value = "";
});

document.getElementById("endGameBtn").addEventListener("click", () => {
  if (confirm("End the game now?")) socket.emit("host:endGame", { roomCode });
});

// Judge
document.getElementById("correctBtn").addEventListener("click", () => {
  socket.emit("host:correct", { roomCode });
});
document.getElementById("wrongBtn").addEventListener("click", () => {
  socket.emit("host:wrong", { roomCode });
});

// Dismiss overlays
document.getElementById("dismissCorrect").addEventListener("click", dismissOverlays);
document.getElementById("dismissWrong").addEventListener("click", dismissOverlays);

// Winner overlay close
document.getElementById("winnerClose").addEventListener("click", () => {
  document.getElementById("winnerOverlay").classList.remove("show");
  switchTab("leaderboard");
});

// Leaderboard back
document.getElementById("goLiveBtn").addEventListener("click", () => {
  switchTab("live");
});

/* ─── INIT ─── */
spawnNotes();

// Sync range labels on load
["rounds","listen","blur","answer"].forEach(key => {
  const range = document.getElementById(key + "Range");
  const val   = document.getElementById(key + "Val");
  if (range && val) val.textContent = range.value + (key === "rounds" ? "" : "s");
});
