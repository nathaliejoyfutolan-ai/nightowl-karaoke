const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6 });
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, "public")));

const rooms = {};
const roomTimers = {};

const GAME_MODES = {
  lyrics: {
    label: "Complete the Lyrics",
    answerLabel: "Missing Lyric Answer",
    challengeText: "Complete the lyric!",
    instructions: "Sing or say the missing lyric before time runs out.",
    icon: "🎤",
    description: "Complete the missing lyrics before the timer runs out.",
  },
  title: {
    label: "Guess the Title",
    answerLabel: "Correct Song Title",
    challengeText: "Guess the song title!",
    instructions: "Say the song title before time runs out.",
    icon: "🎵",
    description: "Listen to the song and guess the correct title.",
  },
  artist: {
    label: "Guess the Artist/Band",
    answerLabel: "Correct Artist/Band",
    challengeText: "Guess the artist or band!",
    instructions: "Say the artist or band before time runs out.",
    icon: "🌟",
    description: "Guess who sang the song or name the band.",
  },
};

const DEFAULT_PLAYLIST = "PL1YIQKuD6ijT4-gFNqNmLDDtvCuxLt8AC";

function createRoom(roomCode) {
  return {
    roomCode,
    players: {},
    selectedGameMode: null,
    selectedGameLabel: "",
    selectedAnswerLabel: "",
    selectedChallengeText: "",
    selectedInstructions: "",
    dashboardPhase: "dashboard",
    gamePhase: "lobby",
    gameStarted: false,
    totalRounds: 5,
    listeningDuration: 15,
    blurDuration: 10,
    answerDuration: 20,
    playlistId: DEFAULT_PLAYLIST,
    videoId: "",
    songs: [],
    turnOrder: [],
    currentTurnIndex: 0,
    currentRound: 1,
    activePlayerId: null,
    isBlurred: false,
    isAnswerRevealed: false,
    currentAnswer: "",
    currentHint: "",
    currentRoundNote: "",
    currentStartTime: 0,
    lastJudgement: null,
    hasScoredCurrentTurn: false,
    timer: 0,
    timerType: null,
  };
}

function getRoom(roomCode) {
  if (!rooms[roomCode]) rooms[roomCode] = createRoom(roomCode);
  return rooms[roomCode];
}

function clearRoomTimer(roomCode) {
  if (roomTimers[roomCode]) {
    clearInterval(roomTimers[roomCode]);
    delete roomTimers[roomCode];
  }
}

function emitState(roomCode) {
  if (rooms[roomCode]) io.to(roomCode).emit("room:state", rooms[roomCode]);
}

function startTimer(roomCode, duration, timerType, onComplete) {
  clearRoomTimer(roomCode);
  const room = rooms[roomCode];
  if (!room) return;
  room.timer = duration;
  room.timerType = timerType;
  emitState(roomCode);

  roomTimers[roomCode] = setInterval(() => {
    const r = rooms[roomCode];
    if (!r) { clearRoomTimer(roomCode); return; }
    r.timer = Math.max(0, r.timer - 1);
    io.to(roomCode).emit("timer:tick", { timer: r.timer, timerType: r.timerType });
    if (r.timer <= 0) {
      clearRoomTimer(roomCode);
      onComplete();
    }
  }, 1000);
}

function getLeaderboard(room) {
  return Object.values(room.players)
    .map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score || 0 }))
    .sort((a, b) => b.score - a.score);
}

io.on("connection", (socket) => {

  socket.on("host:create", ({ roomCode }) => {
    const room = getRoom(roomCode);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.role = "host";
    socket.emit("room:state", room);
    socket.emit("gameModes", GAME_MODES);
  });

  socket.on("host:selectGameMode", ({ roomCode, mode }) => {
    const room = getRoom(roomCode);
    if (room.gameStarted) return;
    const md = GAME_MODES[mode];
    if (!md) return;
    room.selectedGameMode = mode;
    room.selectedGameLabel = md.label;
    room.selectedAnswerLabel = md.answerLabel;
    room.selectedChallengeText = md.challengeText;
    room.selectedInstructions = md.instructions;
    room.dashboardPhase = "setup";
    emitState(roomCode);
  });

  socket.on("host:saveSetup", ({ roomCode, totalRounds, listeningDuration, blurDuration, answerDuration, playlistId }) => {
    const room = getRoom(roomCode);
    if (room.gameStarted) return;
    room.totalRounds = Math.max(1, parseInt(totalRounds) || 5);
    room.listeningDuration = Math.max(5, parseInt(listeningDuration) || 15);
    room.blurDuration = Math.max(3, parseInt(blurDuration) || 10);
    room.answerDuration = Math.min(20, Math.max(5, parseInt(answerDuration) || 20));
    if (playlistId) {
      const pid = extractPlaylistId(playlistId);
      room.playlistId = pid || room.playlistId;
    }
    emitState(roomCode);
    socket.emit("setup:saved");
  });

  socket.on("host:startGame", ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room.selectedGameMode) return;
    const playerIds = Object.keys(room.players);
    if (!playerIds.length) return;

    room.turnOrder = [];
    for (let i = 0; i < room.totalRounds; i++) {
      room.turnOrder.push(playerIds[i % playerIds.length]);
    }
    Object.values(room.players).forEach(p => { p.score = 0; });
    room.currentTurnIndex = 0;
    room.currentRound = 1;
    room.activePlayerId = room.turnOrder[0];
    room.gamePhase = "game_started";
    room.dashboardPhase = "live";
    room.gameStarted = true;
    room.isBlurred = false;
    room.isAnswerRevealed = false;
    room.lastJudgement = null;
    room.hasScoredCurrentTurn = false;
    room.timer = 0;
    room.timerType = null;
    room.currentAnswer = "";
    room.currentHint = "";
    room.currentRoundNote = "";
    emitState(roomCode);
    io.to(roomCode).emit("game:start", { gameMode: room.selectedGameMode, label: room.selectedGameLabel });
  });

  socket.on("host:saveSongs", ({ roomCode, songs }) => {
    const room = getRoom(roomCode);
    if (room.gameStarted) return;
    room.songs = Array.isArray(songs) ? songs.slice(0, 30) : [];
    emitState(roomCode);
    socket.emit("songs:saved");
  });

  socket.on("host:updateTurnData", ({ roomCode, answer, hint, note, startTime }) => {
    const room = getRoom(roomCode);
    room.currentAnswer = answer || "";
    room.currentHint = hint || "";
    room.currentRoundNote = note || "";
    room.currentStartTime = (typeof startTime === "number" && startTime >= 0) ? startTime : 0;
    emitState(roomCode);
  });

  socket.on("host:startTurn", ({ roomCode, startTime }) => {
    const room = getRoom(roomCode);
    clearRoomTimer(roomCode);
    if (typeof startTime === "number" && startTime >= 0) room.currentStartTime = startTime;
    room.gamePhase = "listening";
    room.isBlurred = false;
    room.isAnswerRevealed = false;
    room.lastJudgement = null;
    room.hasScoredCurrentTurn = false;

    startTimer(roomCode, room.listeningDuration, "listening", () => {
      const r = rooms[roomCode];
      if (!r) return;
      r.gamePhase = "paused_ready";
      r.timer = 0;
      r.timerType = null;
      io.to(roomCode).emit("youtube:control", { action: "pause" });
      emitState(roomCode);
    });

    io.to(roomCode).emit("youtube:control", { action: "play", startTime: room.currentStartTime || 0 });
  });

  socket.on("host:continueBlurred", ({ roomCode }) => {
    const room = getRoom(roomCode);
    clearRoomTimer(roomCode);
    room.gamePhase = "blurred_continue";
    room.isBlurred = true;

    startTimer(roomCode, room.blurDuration, "blur", () => {
      const r = rooms[roomCode];
      if (!r) return;
      r.gamePhase = "challenge";
      io.to(roomCode).emit("youtube:control", { action: "pause" });

      startTimer(roomCode, r.answerDuration, "answer", () => {
        const r2 = rooms[roomCode];
        if (!r2) return;
        r2.gamePhase = "time_up";
        r2.timer = 0;
        emitState(roomCode);
      });
    });

    io.to(roomCode).emit("youtube:control", { action: "play" });
  });

  socket.on("host:openChallenge", ({ roomCode }) => {
    const room = getRoom(roomCode);
    clearRoomTimer(roomCode);
    room.gamePhase = "challenge";
    room.isBlurred = true;
    io.to(roomCode).emit("youtube:control", { action: "pause" });

    startTimer(roomCode, room.answerDuration, "answer", () => {
      const r = rooms[roomCode];
      if (!r) return;
      r.gamePhase = "time_up";
      r.timer = 0;
      emitState(roomCode);
    });
  });

  socket.on("host:revealAnswer", ({ roomCode }) => {
    const room = getRoom(roomCode);
    clearRoomTimer(roomCode);
    room.isAnswerRevealed = true;
    room.gamePhase = "revealed";
    emitState(roomCode);
  });

  socket.on("host:correct", ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (room.hasScoredCurrentTurn) return;
    const player = room.players[room.activePlayerId];
    if (player) player.score = (player.score || 0) + 100;
    room.hasScoredCurrentTurn = true;
    room.lastJudgement = "correct";
    room.gamePhase = "judged_correct";
    emitState(roomCode);
  });

  socket.on("host:wrong", ({ roomCode }) => {
    const room = getRoom(roomCode);
    room.lastJudgement = "wrong";
    room.gamePhase = "judged_wrong";
    emitState(roomCode);
  });

  socket.on("host:nextTurn", ({ roomCode }) => {
    const room = getRoom(roomCode);
    clearRoomTimer(roomCode);
    room.currentTurnIndex++;

    if (room.currentTurnIndex >= room.turnOrder.length) {
      room.gamePhase = "game_complete";
      room.dashboardPhase = "complete";
      room.activePlayerId = null;
      room.timer = 0;
      room.timerType = null;
      emitState(roomCode);
      return;
    }

    room.currentRound = room.currentTurnIndex + 1;
    room.activePlayerId = room.turnOrder[room.currentTurnIndex];
    room.gamePhase = "game_started";
    room.isBlurred = false;
    room.isAnswerRevealed = false;
    room.lastJudgement = null;
    room.hasScoredCurrentTurn = false;
    room.currentAnswer = "";
    room.currentHint = "";
    room.currentRoundNote = "";
    room.currentStartTime = 0;
    room.timer = 0;
    room.timerType = null;
    emitState(roomCode);
  });

  socket.on("host:resetTurn", ({ roomCode }) => {
    const room = getRoom(roomCode);
    clearRoomTimer(roomCode);
    room.gamePhase = "game_started";
    room.isBlurred = false;
    room.isAnswerRevealed = false;
    room.lastJudgement = null;
    room.hasScoredCurrentTurn = false;
    room.timer = 0;
    room.timerType = null;
    io.to(roomCode).emit("youtube:control", { action: "pause" });
    emitState(roomCode);
  });

  socket.on("host:setBlur", ({ roomCode, blurred }) => {
    const room = getRoom(roomCode);
    room.isBlurred = !!blurred;
    emitState(roomCode);
  });

  socket.on("host:videoControl", ({ roomCode, action }) => {
    io.to(roomCode).emit("youtube:control", { action });
  });

  socket.on("host:updatePlaylist", ({ roomCode, playlistId, videoId }) => {
    const room = getRoom(roomCode);
    if (playlistId) room.playlistId = extractPlaylistId(playlistId) || playlistId;
    if (videoId) room.videoId = videoId;
    emitState(roomCode);
    io.to(roomCode).emit("youtube:update", { playlistId: room.playlistId, videoId: room.videoId });
  });

  socket.on("host:resetGame", ({ roomCode }) => {
    clearRoomTimer(roomCode);
    const existing = rooms[roomCode];
    const newRoom = createRoom(roomCode);
    if (existing) {
      newRoom.players = existing.players;
      Object.values(newRoom.players).forEach(p => { p.score = 0; });
    }
    rooms[roomCode] = newRoom;
    emitState(roomCode);
  });

  socket.on("host:endGame", ({ roomCode }) => {
    const room = getRoom(roomCode);
    clearRoomTimer(roomCode);
    room.gamePhase = "game_complete";
    room.dashboardPhase = "complete";
    room.timer = 0;
    emitState(roomCode);
  });

  socket.on("host:adjustScore", ({ roomCode, playerId, delta }) => {
    const room = getRoom(roomCode);
    const player = room.players[playerId];
    if (!player) return;
    player.score = Math.max(0, (player.score || 0) + Number(delta || 0));
    emitState(roomCode);
  });

  socket.on("player:join", ({ roomCode, playerName, avatar }) => {
    const room = getRoom(roomCode);
    const cleanName = String(playerName || "Player").slice(0, 24);
    let playerAvatar = avatar || null;
    if (playerAvatar && playerAvatar.length > 250000) playerAvatar = null;

    room.players[socket.id] = {
      id: socket.id,
      name: cleanName,
      avatar: playerAvatar,
      score: 0,
    };

    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.role = "player";
    socket.data.playerName = cleanName;

    emitState(roomCode);
    io.to(roomCode).emit("player:joined", { name: cleanName, id: socket.id, avatar: playerAvatar });
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];
    if (room.players[socket.id]) {
      delete room.players[socket.id];
      emitState(roomCode);
    }
  });
});

function extractPlaylistId(input) {
  if (!input) return "";
  try {
    const u = new URL(input.includes("://") ? input : "https://x.com?" + input);
    return u.searchParams.get("list") || "";
  } catch {
    if (/^[A-Za-z0-9_-]{10,}$/.test(input.trim())) return input.trim();
    return "";
  }
}

server.listen(PORT, () => {
  console.log(`NightOwl Karaoke Game Night running on http://localhost:${PORT}`);
});
