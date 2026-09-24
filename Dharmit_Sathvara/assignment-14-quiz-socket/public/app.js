/**
 * Real-Time Quiz Battle Client
 * Shared Socket.io connection logic and reactive DOM event handling for Host and Player views.
 */

// Sound synthesis via Web Audio API (Zero external audio assets needed)
const SoundFX = (() => {
  let ctx = null;
  function getCtx() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === "suspended") {
      ctx.resume();
    }
    return ctx;
  }

  return {
    playClick() {
      try {
        const audio = getCtx();
        if (!audio) return;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, audio.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audio.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audio.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + 0.08);
      } catch (e) {}
    },
    playCorrect() {
      try {
        const audio = getCtx();
        if (!audio) return;
        const now = audio.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.2, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
          osc.connect(gain);
          gain.connect(audio.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.25);
        });
      } catch (e) {}
    },
    playIncorrect() {
      try {
        const audio = getCtx();
        if (!audio) return;
        const now = audio.currentTime;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      } catch (e) {}
    },
    playTick() {
      try {
        const audio = getCtx();
        if (!audio) return;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, audio.currentTime);
        gain.gain.setValueAtTime(0.05, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + 0.04);
      } catch (e) {}
    },
    playVictory() {
      try {
        const audio = getCtx();
        if (!audio) return;
        const now = audio.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, now + idx * 0.12);
          gain.gain.setValueAtTime(0.25, now + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);
          osc.connect(gain);
          gain.connect(audio.destination);
          osc.start(now + idx * 0.12);
          osc.stop(now + idx * 0.12 + 0.35);
        });
      } catch (e) {}
    }
  };
})();

// Establish single Socket.io connection
const socket = io();

// Shared App State
const state = {
  role: document.body.dataset.role || "unknown", // 'host' | 'player'
  pin: null,
  playerName: null,
  totalScore: 0,
  currentRank: 1,
  selectedOption: null,
  questionStartTime: null,
  hasAnswered: false,
  countdownInterval: null
};

// ==========================================
// 👑 HOST APPLICATION LOGIC
// ==========================================
function initHost() {
  const setupView = document.getElementById("host-setup-view");
  const lobbyView = document.getElementById("host-lobby-view");
  const gameView = document.getElementById("host-game-view");
  const finalView = document.getElementById("host-final-view");

  const createForm = document.getElementById("create-quiz-form");
  const hostNameInput = document.getElementById("host-name");
  const categoryInput = document.getElementById("quiz-category");

  const pinDisplay = document.getElementById("host-pin-display");
  const joinUrlText = document.getElementById("join-url-text");
  const categoryDisplay = document.getElementById("host-category-display");
  const playerCountDisplay = document.getElementById("player-count-display");
  const rosterGrid = document.getElementById("host-roster-grid");
  const btnStartQuiz = document.getElementById("btn-start-quiz");

  const qCounter = document.getElementById("host-q-counter");
  const timerCircle = document.getElementById("host-timer-circle");
  const qProgress = document.getElementById("host-q-progress");
  const questionText = document.getElementById("host-question-text");
  const explanationCard = document.getElementById("host-explanation-card");
  const explanationText = document.getElementById("host-explanation-text");
  const midLeaderboard = document.getElementById("host-mid-leaderboard");
  const leaderboardItems = document.getElementById("host-leaderboard-items");

  // Dynamic join URL
  if (joinUrlText) {
    joinUrlText.textContent = `${window.location.host}/player.html`;
  }

  function switchView(target) {
    [setupView, lobbyView, gameView, finalView].forEach(v => {
      if (v) v.classList.remove("active");
    });
    if (target) target.classList.add("active");
  }

  // 1. Submit Create Quiz
  createForm.addEventListener("submit", (e) => {
    e.preventDefault();
    SoundFX.playClick();
    socket.emit("quiz:create", {
      hostName: hostNameInput.value.trim(),
      category: categoryInput.value.trim()
    });
  });

  // 2. Room Created response
  socket.on("quiz:created", (payload) => {
    const { pin, category } = payload;
    state.pin = pin;
    pinDisplay.textContent = pin;
    categoryDisplay.textContent = `Category: ${category}`;
    switchView(lobbyView);
  });

  // 3. Lobby Update (players list)
  socket.on("lobby:update", (payload) => {
    const { players = [] } = payload;
    playerCountDisplay.textContent = `👥 ${players.length} Player${players.length === 1 ? '' : 's'} Joined`;

    if (players.length === 0) {
      rosterGrid.innerHTML = `<div class="lobby-empty-state">Waiting for players to enter PIN...</div>`;
      btnStartQuiz.disabled = true;
    } else {
      rosterGrid.innerHTML = players.map(p => `
        <div class="player-pill">
          <div class="avatar-circle">🎮</div>
          <span>${p.name}</span>
        </div>
      `).join("");
      btnStartQuiz.disabled = false;
    }
  });

  // 4. Start Quiz
  btnStartQuiz.addEventListener("click", () => {
    SoundFX.playClick();
    btnStartQuiz.disabled = true;
    socket.emit("quiz:start", { pin: state.pin });
  });

  // 5. Question Start
  socket.on("question:start", (payload) => {
    const { questionIndex, totalQuestions, question, options, timeLimitSeconds = 15 } = payload;
    switchView(gameView);

    // Reset visual reveal states
    explanationCard.classList.remove("active");
    midLeaderboard.style.display = "none";
    for (let i = 0; i < 4; i++) {
      const card = document.getElementById(`host-opt-${i}`);
      if (card) {
        card.classList.remove("correct-highlight", "dimmed");
        const optText = card.querySelector(".opt-text");
        if (optText) optText.textContent = options[i] || `Option ${i + 1}`;
      }
    }

    qCounter.textContent = `Question ${questionIndex + 1} / ${totalQuestions}`;
    questionText.textContent = question;

    // Start 15s visual countdown
    let remaining = timeLimitSeconds;
    timerCircle.textContent = remaining;
    timerCircle.classList.remove("warning");
    qProgress.style.width = "100%";

    if (state.countdownInterval) clearInterval(state.countdownInterval);

    const startTime = Date.now();
    const totalMs = timeLimitSeconds * 1000;

    state.countdownInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progressPercent = Math.max(0, ((totalMs - elapsed) / totalMs) * 100);
      qProgress.style.width = `${progressPercent}%`;

      const secondsLeft = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
      timerCircle.textContent = secondsLeft;

      if (secondsLeft <= 5 && !timerCircle.classList.contains("warning")) {
        timerCircle.classList.add("warning");
        SoundFX.playTick();
      }

      if (elapsed >= totalMs) {
        clearInterval(state.countdownInterval);
        state.countdownInterval = null;
      }
    }, 100);
  });

  // 6. Question Time Up & Answer Reveal
  socket.on("question:time_up", (payload) => {
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
    }
    timerCircle.textContent = "0";
    qProgress.style.width = "0%";

    const { correctOption, explanation } = payload;

    // Highlight correct card, dim others
    for (let i = 0; i < 4; i++) {
      const card = document.getElementById(`host-opt-${i}`);
      if (card) {
        if (i === correctOption) {
          card.classList.add("correct-highlight");
        } else {
          card.classList.add("dimmed");
        }
      }
    }

    // Show explanation
    if (explanation) {
      explanationText.textContent = explanation;
      explanationCard.classList.add("active");
    }

    SoundFX.playCorrect();
  });

  // 7. Live Leaderboard Update
  socket.on("leaderboard:update", (payload) => {
    const { leaderboard = [] } = payload;
    leaderboardItems.innerHTML = leaderboard.map(p => `
      <div class="leaderboard-item ${p.rank === 1 ? 'rank-1' : ''}">
        <div class="rank-num">#${p.rank}</div>
        <div class="player-name">${p.name}</div>
        <div class="player-score">${p.score.toLocaleString()} pts</div>
      </div>
    `).join("");

    midLeaderboard.style.display = "block";
  });

  // 8. Quiz Ended / Final Podium
  socket.on("quiz:ended", (payload) => {
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    switchView(finalView);
    SoundFX.playVictory();

    const { finalRanks = [] } = payload;

    // Podium population (Top 3)
    const podiumElements = [
      { col: document.getElementById("podium-1"), name: document.getElementById("podium-name-1"), score: document.getElementById("podium-score-1"), data: finalRanks[0] },
      { col: document.getElementById("podium-2"), name: document.getElementById("podium-name-2"), score: document.getElementById("podium-score-2"), data: finalRanks[1] },
      { col: document.getElementById("podium-3"), name: document.getElementById("podium-name-3"), score: document.getElementById("podium-score-3"), data: finalRanks[2] }
    ];

    podiumElements.forEach(item => {
      if (item.data && item.col) {
        item.col.style.visibility = "visible";
        item.name.textContent = item.data.name;
        item.score.textContent = `${item.data.score.toLocaleString()} pts`;
      } else if (item.col) {
        item.col.style.visibility = "hidden";
      }
    });

    // Full final ranks list
    const finalLeaderboardList = document.getElementById("host-final-leaderboard-items");
    if (finalLeaderboardList) {
      finalLeaderboardList.innerHTML = finalRanks.map(p => `
        <div class="leaderboard-item ${p.rank === 1 ? 'rank-1' : ''}">
          <div class="rank-num">#${p.rank}</div>
          <div class="player-name">${p.name}</div>
          <div class="player-score">${p.score.toLocaleString()} pts</div>
        </div>
      `).join("");
    }
  });

  // Error event
  socket.on("quiz:error", (err) => {
    alert(err.message || "An error occurred.");
  });
}

// ==========================================
// 🎮 PLAYER APPLICATION LOGIC
// ==========================================
function initPlayer() {
  const joinView = document.getElementById("player-join-view");
  const lobbyView = document.getElementById("player-lobby-view");
  const gameView = document.getElementById("player-game-view");
  const resultView = document.getElementById("player-result-view");
  const finalView = document.getElementById("player-final-view");

  const alertBox = document.getElementById("player-alert-box");
  const hud = document.getElementById("player-hud");
  const hudName = document.getElementById("hud-name");
  const hudScore = document.getElementById("hud-score");

  const joinForm = document.getElementById("player-join-form");
  const pinInput = document.getElementById("player-pin");
  const nicknameInput = document.getElementById("player-nickname");

  const welcomeName = document.getElementById("player-welcome-name");
  const pinPill = document.getElementById("player-room-pin-pill");

  const qIndexBadge = document.getElementById("player-q-index-badge");
  const timerDisplay = document.getElementById("player-timer-display");
  const progressFill = document.getElementById("player-progress-fill");
  const qText = document.getElementById("player-q-text");
  const answerGrid = document.getElementById("player-answer-grid");
  const submittedFeedback = document.getElementById("submitted-feedback");

  const resultIcon = document.getElementById("result-icon");
  const resultStatus = document.getElementById("result-status");
  const resultPoints = document.getElementById("result-points");
  const resultTotalScore = document.getElementById("result-total-score");
  const resultCurrentRank = document.getElementById("result-current-rank");

  const finalRankText = document.getElementById("final-rank-text");
  const finalScoreVal = document.getElementById("final-score-val");

  function showAlert(msg) {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.style.display = "block";
    setTimeout(() => { alertBox.style.display = "none"; }, 4000);
  }

  function switchView(target) {
    [joinView, lobbyView, gameView, resultView, finalView].forEach(v => {
      if (v) v.classList.remove("active");
    });
    if (target) target.classList.add("active");
  }

  // 1. Submit Join Form
  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    SoundFX.playClick();

    const pin = pinInput.value.trim();
    const playerName = nicknameInput.value.trim();

    if (!pin || !playerName) {
      showAlert("Please enter both PIN and Nickname.");
      return;
    }

    state.pin = pin;
    state.playerName = playerName;

    socket.emit("quiz:join", { pin, playerName });
  });

  // 2. Successful Join
  socket.on("quiz:joined", (payload) => {
    const { pin, playerName } = payload;
    state.playerName = playerName;
    state.pin = pin;

    welcomeName.textContent = `Welcome, ${playerName}!`;
    pinPill.textContent = `Room PIN: ${pin}`;

    hud.style.display = "flex";
    hudName.textContent = playerName;
    hudScore.textContent = `0 pts`;

    switchView(lobbyView);
  });

  // 3. Question Starts
  socket.on("question:start", (payload) => {
    const { questionIndex, totalQuestions, question, options, timeLimitSeconds = 15 } = payload;
    switchView(gameView);

    state.hasAnswered = false;
    state.selectedOption = null;
    state.questionStartTime = Date.now();

    qIndexBadge.textContent = `Question ${questionIndex + 1} / ${totalQuestions}`;
    qText.textContent = question;

    // Reset buttons
    submittedFeedback.style.display = "none";
    const buttons = answerGrid.querySelectorAll(".btn-answer");
    buttons.forEach((btn, idx) => {
      btn.disabled = false;
      btn.classList.remove("selected");
      const btnText = btn.querySelector(".btn-text");
      if (btnText) btnText.textContent = options[idx] || `Option ${idx + 1}`;
    });

    // Start 15s visual countdown
    let remaining = timeLimitSeconds;
    timerDisplay.textContent = remaining;
    timerDisplay.classList.remove("warning");
    progressFill.style.width = "100%";

    if (state.countdownInterval) clearInterval(state.countdownInterval);

    const startTime = Date.now();
    const totalMs = timeLimitSeconds * 1000;

    state.countdownInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progressPercent = Math.max(0, ((totalMs - elapsed) / totalMs) * 100);
      progressFill.style.width = `${progressPercent}%`;

      const secondsLeft = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
      timerDisplay.textContent = secondsLeft;

      if (secondsLeft <= 5 && !timerDisplay.classList.contains("warning")) {
        timerDisplay.classList.add("warning");
        SoundFX.playTick();
      }

      if (elapsed >= totalMs) {
        clearInterval(state.countdownInterval);
        state.countdownInterval = null;
      }
    }, 100);
  });

  // 4. Player clicks an answer option
  answerGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-answer");
    if (!btn || state.hasAnswered) return;

    SoundFX.playClick();
    state.hasAnswered = true;

    // Capture client response time
    const timeTakenMs = Date.now() - (state.questionStartTime || Date.now());
    const selectedOption = Number(btn.dataset.opt);
    state.selectedOption = selectedOption;

    // Lock buttons and indicate selection
    const buttons = answerGrid.querySelectorAll(".btn-answer");
    buttons.forEach(b => {
      b.disabled = true;
      if (b === btn) b.classList.add("selected");
    });

    submittedFeedback.style.display = "block";

    // Emit answer:submit with millisecond response timing
    socket.emit("answer:submit", {
      pin: state.pin,
      selectedOption,
      timeTakenMs
    });
  });

  // 5. Question Round Time Up & Answer Reveal
  socket.on("question:time_up", (payload) => {
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
    }

    const { correctOption } = payload;
    const isCorrect = (state.selectedOption !== null && state.selectedOption === correctOption);

    switchView(resultView);

    if (isCorrect) {
      SoundFX.playCorrect();
      resultIcon.textContent = "🎉";
      resultStatus.textContent = "Correct!";
      resultStatus.className = "result-status correct";
      resultPoints.textContent = `+Points Scored!`;
    } else {
      SoundFX.playIncorrect();
      resultIcon.textContent = "❌";
      resultStatus.textContent = state.selectedOption === null ? "Time's Up!" : "Incorrect!";
      resultStatus.className = "result-status incorrect";
      resultPoints.textContent = "+0 pts";
    }
  });

  // 6. Leaderboard Update
  socket.on("leaderboard:update", (payload) => {
    const { leaderboard = [] } = payload;
    const playerEntry = leaderboard.find(p => p.name === state.playerName);

    if (playerEntry) {
      state.totalScore = playerEntry.score;
      state.currentRank = playerEntry.rank;

      hudScore.textContent = `${playerEntry.score.toLocaleString()} pts`;
      resultTotalScore.textContent = playerEntry.score.toLocaleString();
      resultCurrentRank.textContent = `#${playerEntry.rank}`;
    }
  });

  // 7. Quiz Ended
  socket.on("quiz:ended", (payload) => {
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    switchView(finalView);
    SoundFX.playVictory();

    const { finalRanks = [] } = payload;
    const playerEntry = finalRanks.find(p => p.name === state.playerName);

    if (playerEntry) {
      finalRankText.textContent = `You placed #${playerEntry.rank} of ${finalRanks.length}!`;
      finalScoreVal.textContent = `${playerEntry.score.toLocaleString()} pts`;
    }
  });

  // Error handling
  socket.on("quiz:error", (err) => {
    showAlert(err.message || "An error occurred.");
  });

  socket.on("answer:error", (err) => {
    console.warn("Answer submission error:", err.message);
  });
}

// Auto-initialize based on data-role
document.addEventListener("DOMContentLoaded", () => {
  if (state.role === "host") {
    initHost();
  } else if (state.role === "player") {
    initPlayer();
  }
});
