# Assignment 14 — Real-Time Multiplayer Live Quiz Battle (Socket.io)

A Kahoot/Quizizz-style real-time multiplayer trivia battle arena built with **Node.js**, **Express.js**, and **Socket.io**. Featuring an authoritative game server with synchronized countdown timers, millisecond speed-based dynamic scoring, anti-cheat validation, and instant live leaderboard broadcasts.

---

## 🚀 Key Highlights & Learning Outcomes

1. **Asymmetric Real-Time Roles**: Dedicated **Host Dashboard** (`/host.html`) and mobile-optimized **Player Gamepad** (`/player.html`).
2. **Server-Authoritative Clock Engine**: 15-second round timers and state transitions managed strictly on the server with zero client drift.
3. **Anti-Cheat Validation**: Late answer submissions (after the 15-second server cutoff) and duplicate submissions are automatically rejected.
4. **Millisecond Speed Scoring**: Correct answers earn up to 1000 points dynamically weighted by how fast the player submitted.
5. **Real-Time Leaderboard Broadcasts**: Live leaderboard calculation, rank sorting, and podium reveals after every question.
6. **Built-in Web Audio Synthesizer**: Native sound effects (ticks, correct chimes, incorrect buzzes, victory fanfare) using the browser Web Audio API with zero external audio dependencies.

---

## 🏗️ Architecture & Directory Structure

```text
assignment-14-quiz-socket/
├── public/
│   ├── index.html        # Landing portal (Host vs Player entry)
│   ├── host.html         # Host Dashboard (PIN display, lobby, question timer, podium)
│   ├── player.html       # Player Gamepad (PIN entry, 4-color answer grid, score HUD)
│   └── app.js            # Shared Socket.io client & Web Audio FX
├── data/
│   └── questions.json    # Question bank with tech trivia & explanations
├── sockets/
│   ├── gameEngine.js     # Authoritative timers, scoring algorithm, anti-cheat validation
│   └── lobbyHandler.js   # Room lifecycle, PIN generation, roster sync, disconnect logic
├── server.js             # Express & Socket.io server configuration
├── .env.example          # Environment variable template
├── .gitignore            # Git ignore rules
├── package.json          # Project metadata & npm dependencies
└── README.md             # Complete documentation
```

---

## 🧮 Server-Side Authoritative Scoring Algorithm

Scores are computed authoritatively on the server to ensure fairness:

$$\text{Score} = \begin{cases} 0, & \text{if incorrect} \\ 500 + \text{round}\left( \frac{\text{max}(0, 15000 - \text{timeTakenMs})}{15000} \times 500 \right), & \text{if correct} \end{cases}$$

- **Base Points**: 500 points for any correct answer.
- **Speed Bonus**: Up to 500 additional bonus points for instant responses.
- **Max Points per Question**: 1000 points.
- **Incorrect / Late**: 0 points.

---

## 📡 Socket.io Real-Time Protocol Specification

### 🎪 Lobby & Room Management

| Event | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `quiz:create` | Host → Server | `{ hostName, category }` | Initializes a new quiz room with a unique 4-digit PIN. |
| `quiz:created` | Server → Host | `{ pin, roomId, hostName, category, totalQuestions }` | Confirms room creation and sends the PIN to the host. |
| `quiz:join` | Player → Server | `{ pin, playerName }` | Player joins room lobby using the 4-digit PIN. |
| `quiz:joined` | Server → Player | `{ pin, playerName, hostName, category }` | Confirms successful lobby entry to the joining player. |
| `lobby:update` | Server → Room | `{ players: [{ name, score }] }` | Broadcasts live player roster as participants join. |
| `quiz:start` | Host → Server | `{ pin }` | Host triggers the start of the quiz. |

### ⏱️ Question Rounds & Gameplay

| Event | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `question:start` | Server → Room | `{ questionIndex, totalQuestions, question, options, timeLimitSeconds }` | Broadcasts question & options. **Correct answer & explanation are omitted to prevent cheating.** |
| `answer:submit` | Player → Server | `{ pin, selectedOption, timeTakenMs }` | Player submits chosen option (0-3) with response time. |
| `answer:received`| Server → Player | `{ status: "received", timeTakenMs }` | Acknowledges submission without leaking correctness. |
| `question:time_up`| Server → Room | `{ correctOption, explanation }` | Reveals correct answer and detailed explanation. |
| `leaderboard:update`| Server → Room | `{ leaderboard: [{ rank, name, score }] }` | Broadcasts sorted leaderboard rankings. |
| `quiz:ended` | Server → Room | `{ winner, finalRanks: [{ rank, name, score }] }` | Broadcasts final podium and full tournament rankings. |
| `quiz:error` | Server → Client | `{ message }` | Transmits error notifications (e.g., invalid PIN, disconnected host). |

---

## 🛡️ Edge Cases & Anti-Cheat Handled

1. **Late Submissions**: The server verifies `Date.now() - room.currentQuestionStartTime <= 15500ms`. Any submission sent after the 15-second timer is rejected.
2. **Duplicate Submissions**: A `Set` (`room.answeredThisRound`) tracks which socket IDs have answered. Multiple submissions in the same round are blocked.
3. **Information Security**: `correctOption` and `explanation` are never sent over the socket in `question:start`. They are only revealed in `question:time_up`.
4. **Host Disconnection**: If the host disconnects during the lobby or live game, players receive a notification (`quiz:error`), room timers are cleared, and memory is freed.
5. **Player Disconnection**: If a player leaves mid-game, they are removed from `room.players`, the leaderboard is re-sorted, and if all remaining players have submitted, the round wraps up cleanly.
6. **Snappy Early Reveal**: If all connected players have submitted their answers before the 15 seconds expire, the server automatically advances to answer reveal early.

---

## 🛠️ Local Installation & Development

### 1. Install Dependencies
```bash
cd Desktop/assignment-14-realtime-quiz-platform/Dharmit_Sathvara/assignment-14-quiz-socket
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

The application runs on `http://localhost:5000`.

---

## 🧪 Step-by-Step Testing & Verification Flow

To verify the multiplayer mechanics across 3 browser tabs:

1. **Host Tab**: Open `http://localhost:5000/host.html`. Enter your host name and click **"Generate Game PIN"**. Note the 4-digit PIN (e.g. `8421`).
2. **Player 1 Tab**: Open `http://localhost:5000/player.html` in an incognito or separate window. Enter the PIN and nickname **"Player 1"**. Click **Join Battle**.
3. **Player 2 Tab**: Open `http://localhost:5000/player.html` in another tab. Enter the PIN and nickname **"Player 2"**. Click **Join Battle**.
4. **Verify Lobby Sync**: On the Host tab, observe that both players appear instantly in the lobby grid and the **Start Game** button becomes enabled.
5. **Start Game**: Click **"Start Game"** from the Host tab.
6. **Speed Bonus Test**:
   - On **Player 1**, click the correct answer within **1-2 seconds**.
   - On **Player 2**, wait **9-10 seconds** before clicking the correct answer.
   - When the round ends, verify that **Player 1 has a significantly higher score** than Player 2 due to the speed multiplier!
7. **Anti-Cheat Test**:
   - On the next question, wait until the 15-second timer expires.
   - Verify that answers cannot be submitted after the buzzer.
8. **Final Podium**: Complete all questions to see the 1st, 2nd, and 3rd place podium animation and final score ranking.

---

## 🚀 Steps to Push on GitHub & Deploy on Render

### 📤 1. Push to GitHub
```bash
# Navigate to the workspace repository root
cd Desktop/assignment-14-realtime-quiz-platform

# Check git status
git status

# Stage all files
git add .

# Commit changes
git commit -m "feat: complete assignment 14 real-time live quiz battle with socket.io"

# Push to your GitHub repository
git push origin main
```

---

### 🌐 2. Deploy to Render (Web Service)

1. Go to [render.com](https://render.com/) and sign in with your GitHub account.
2. Click **New +** → **Web Service**.
3. Select the repository: `dharmitsathvara29-max/assignment-14-realtime-quiz-platform`.
4. Configure the Web Service settings:
   - **Name**: `realtime-quiz-battle` (or any custom name)
   - **Region**: Closest to your location (e.g., Singapore / Oregon / Frankfurt)
   - **Branch**: `main`
   - **Root Directory**: `Dharmit_Sathvara/assignment-14-quiz-socket`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Click **Create Web Service**.
6. Render will install dependencies, launch the server, and provide your public live URL (e.g. `https://realtime-quiz-battle.onrender.com`).
7. Open `https://<your-app>.onrender.com/host.html` on your computer and `https://<your-app>.onrender.com/player.html` on your mobile devices to play live!
