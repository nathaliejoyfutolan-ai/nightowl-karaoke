# 🦉 NightOwl Karaoke Game Night

A multiplayer browser-based karaoke game with three game modes, turn-based rounds, player avatars, YouTube playlist integration, and live leaderboard. Perfect for Zoom or Teams game nights.

---

## Quick Start (Local)

```bash
npm install
npm start
# Open http://localhost:3000
```

---

## Deploy on Render

1. Push this folder to a GitHub repo.
2. On [render.com](https://render.com), create a **Web Service**.
3. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Deploy. Share the Render URL with your players.

---

## How to Play

### Host Setup

1. Open the app URL in your browser (or Render URL).
2. A room code like `OWL123` is generated automatically.
3. Click **Copy Join Link** and share it with players.
4. On the **Dashboard**, choose a game mode:
   - 🎤 **Complete the Lyrics** — player sings/says the missing lyric
   - 🎵 **Guess the Title** — player names the song
   - 🌟 **Guess the Artist/Band** — player names the artist
5. Click **Select Game** to proceed to **Setup**.
6. In Setup, configure:
   - Number of rounds
   - Listening duration (how long the song plays before first pause)
   - Blurred continuation duration (song continues with video hidden)
   - Answer time limit (max 20 seconds)
   - Optional: paste a different YouTube playlist URL
7. Click **Start Game** when at least 1 player has joined.

### How Players Join

1. Open the join link on a phone or browser: `/join.html?room=OWL123`
2. Enter name and choose an avatar:
   - **Upload Photo** — picks from your photo library
   - **Take Photo** — opens camera (works on mobile)
   - **Use Default** — choose from colorful emoji avatars
3. Click **Join Game** and wait for the host to start.

### Turn-Based Game Flow

The app creates a turn order from all joined players. Every player gets one turn per cycle of rounds.

Each turn:

1. **Host** types the correct answer in the Answer field and clicks **Save Answer**.
2. **Host** clicks **▶ Start Turn** — song begins playing. Listening timer counts down.
3. After the listening timer ends, the song **auto-pauses**.
4. **Host** clicks **🙈 Continue Blurred** — song resumes with video hidden (audio only). Blur timer counts down.
5. After blur timer, song **auto-pauses** again. The 20-second answer countdown begins.
6. The active player has up to 20 seconds to answer out loud.
7. **Host** clicks **👁 Reveal Answer** to show the correct answer on screen.
8. **Host** clicks **✅ CORRECT +100** or **❌ WRONG**.
9. A large overlay appears for all players showing the result.
10. **Host** clicks **⏭ Next Turn** to advance.

### Scoring

- Correct answer = **+100 points**
- Wrong answer = **0 points**
- Leaderboard updates live after every correct answer.

### Final Leaderboard

After all rounds are completed, a winner celebration screen appears with:
- Winner avatar and name
- Final score
- Full ranked leaderboard

---

## Avatar Details

- Players can upload any photo — it's resized to 256×256 JPEG client-side before sending.
- Camera capture uses `accept="image/*" capture="user"` for mobile compatibility.
- If no photo is chosen, a colorful emoji avatar is assigned.
- Avatars appear on: host player list, turn order strip, leaderboard, Correct/Wrong overlays, winner screen.
- Avatars are stored in memory only — not saved to disk or a database. Restarting the server clears all data.

---

## Game Modes Reference

| Mode | What the player does | Answer Field Label |
|------|---------------------|--------------------|
| Complete the Lyrics | Sing or say the missing lyric | Missing Lyric Answer |
| Guess the Title | Name the song | Correct Song Title |
| Guess the Artist/Band | Name the artist or band | Correct Artist/Band |

All modes share the same engine — only labels and instructions change.

---

## Host Controls Reference

| Button | When to use |
|--------|------------|
| ▶ Start Turn | Begin the turn — plays YouTube song |
| 🙈 Continue Blurred | After first auto-pause — resumes song with video hidden |
| ⚡ Open Challenge | Skip blur timer, go straight to challenge |
| 👁 Reveal Answer | Show the correct answer on all screens |
| ✅ CORRECT +100 | Award 100 points to the active player |
| ❌ WRONG | Mark as wrong, no points |
| ⏭ Next Turn | Advance to the next player |
| ↺ Reset Turn | Reset this turn without scoring |
| ⏹ End Game | End the game immediately |
| ↺ Reset Game | Clear all progress, return to dashboard |
| 🙈 Blur Video | Manually hide the video |
| 👁 Reveal Video | Manually show the video |

---

## Troubleshooting

**Players can't join:**
- Make sure the server is running (`npm start`).
- On Render, check the service is active (not sleeping).
- Players need the correct room code. Use **Copy Join Link**.
- Check firewall — port 3000 must be open for local hosting.

**Camera/photo upload doesn't work on mobile:**
- Use HTTPS (required for camera access). Render provides HTTPS automatically.
- For local testing, use `localhost` (browsers allow camera on localhost).
- If the device blocks camera, use **Upload Photo** instead.

**YouTube playlist doesn't load:**
- YouTube may block autoplay without user interaction. Host must click **▶ Start Turn** to trigger playback.
- If playlist ID is wrong, paste the full playlist URL in the Setup tab.
- Default playlist: `PL1YIQKuD6ijT4-gFNqNmLDDtvCuxLt8AC`
- Some YouTube videos are restricted and can't be embedded. Use a karaoke/lyric playlist that allows embedding.

**Timers not syncing:**
- Timers are server-side — they sync to all clients automatically.
- If a player reconnects, they receive the latest state.

**Game mode can't be changed after game starts:**
- By design. Click **↺ Reset Game** to restart from the dashboard.

---

## Tech Stack

- Node.js + Express
- Socket.IO (real-time multiplayer)
- YouTube iframe API (host screen only)
- Vanilla HTML/CSS/JS
- No database, no login, no paid APIs
