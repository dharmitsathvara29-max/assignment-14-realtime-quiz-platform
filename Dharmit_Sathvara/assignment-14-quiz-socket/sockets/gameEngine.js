/**
 * Real-Time Quiz Game State & Execution Engine
 * Handles authoritative timers, scoring algorithm, answer validation, and leaderboard broadcasting.
 */

// In-memory store for active quiz rooms keyed by 4-digit PIN
const quizRooms = {};

/**
 * Generate a unique 4-digit numeric PIN
 * @returns {string} 4-digit PIN
 */
function generatePin() {
  let pin;
  let attempts = 0;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
    attempts++;
    if (attempts > 10000) break;
  } while (quizRooms[pin]);
  return pin;
}

/**
 * Retrieve room by PIN
 * @param {string} pin
 * @returns {object|null}
 */
function getRoom(pin) {
  return quizRooms[pin] || null;
}

/**
 * Server-Side Authoritative Scoring Algorithm
 * @param {boolean} isCorrect - whether submitted option is correct
 * @param {number} timeTakenMs - response time in milliseconds
 * @param {number} totalTimeLimitMs - total round limit (default 15000ms)
 * @returns {number} calculated score (0 to 1000)
 */
function calculateScore(isCorrect, timeTakenMs, totalTimeLimitMs = 15000) {
  if (!isCorrect) return 0;
  const timeRemaining = Math.max(0, totalTimeLimitMs - timeTakenMs);
  const speedBonus = Math.round((timeRemaining / totalTimeLimitMs) * 500); // Up to 500 bonus points
  const baseScore = 500;
  return baseScore + speedBonus; // Total max 1000 points per question
}

/**
 * Transition to and broadcast the next question or final rankings
 * @param {object} io - Socket.io Server instance
 * @param {object} room - Quiz room state object
 */
function startNextQuestion(io, room) {
  if (!room || room.status === "ended") return;

  // Clear existing timers
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
  if (room.transitionTimer) {
    clearTimeout(room.transitionTimer);
    room.transitionTimer = null;
  }

  room.currentQuestionIndex++;
  room.isRevealing = false;

  // Check if all questions completed
  if (room.currentQuestionIndex >= room.questions.length) {
    room.status = "ended";
    const finalRanks = Object.values(room.players)
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => ({
        rank: idx + 1,
        name: p.name,
        score: p.score
      }));

    const winner = finalRanks.length > 0 ? finalRanks[0] : null;

    io.to(room.roomId).emit("quiz:ended", {
      winner,
      finalRanks
    });
    return;
  }

  // Prepare current question
  const currentQ = room.questions[room.currentQuestionIndex];
  room.answeredThisRound = new Set();
  room.currentQuestionStartTime = Date.now();

  // Broadcast question:start to whole room (correctOption & explanation OMITTED to prevent cheating)
  io.to(room.roomId).emit("question:start", {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    question: currentQ.question,
    options: currentQ.options,
    timeLimitSeconds: 15
  });

  // Authoritative server-side countdown timer (15 seconds)
  room.timer = setTimeout(() => {
    endQuestionRound(io, room);
  }, 15000);
}

/**
 * Conclude current question round, reveal correct answer, broadcast leaderboard, and schedule next round
 * @param {object} io - Socket.io Server instance
 * @param {object} room - Quiz room state object
 */
function endQuestionRound(io, room) {
  if (!room || room.isRevealing || room.status !== "in_progress") return;

  room.isRevealing = true;

  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }

  const currentQ = room.questions[room.currentQuestionIndex];
  if (!currentQ) return;

  // Reveal correct answer and explanation to all participants
  io.to(room.roomId).emit("question:time_up", {
    correctOption: currentQ.correctOption,
    explanation: currentQ.explanation
  });

  // Calculate live rankings
  const leaderboard = Object.values(room.players)
    .sort((a, b) => b.score - a.score)
    .map((p, idx) => ({
      rank: idx + 1,
      name: p.name,
      score: p.score
    }));

  // Broadcast sorted leaderboard to everyone
  io.to(room.roomId).emit("leaderboard:update", { leaderboard });

  // 4.5s reveal window for players to view answer + rankings before next question
  room.transitionTimer = setTimeout(() => {
    startNextQuestion(io, room);
  }, 4500);
}

/**
 * Register answer submission socket handler with anti-cheat validation
 * @param {object} io - Socket.io Server instance
 * @param {object} socket - Connected socket instance
 */
function registerAnswerHandler(io, socket) {
  socket.on("answer:submit", (payload) => {
    const { pin, selectedOption, timeTakenMs } = payload || {};
    const room = getRoom(pin);

    // ANTI-CHEAT VALIDATIONS:
    // 1. Room must exist and be actively in progress
    if (!room || room.status !== "in_progress") {
      socket.emit("answer:error", { message: "Quiz is not currently accepting answers." });
      return;
    }

    // 2. Player must be registered in the room
    const player = room.players[socket.id];
    if (!player) {
      socket.emit("answer:error", { message: "Player not found in this room." });
      return;
    }

    // 3. Question round must not be in reveal phase
    if (room.isRevealing) {
      socket.emit("answer:error", { message: "Time is up for this round!" });
      return;
    }

    // 4. Server timestamp anti-cheat check: reject if past 15s + grace buffer
    const serverElapsed = Date.now() - room.currentQuestionStartTime;
    if (serverElapsed > 15500) {
      socket.emit("answer:error", { message: "Late submission rejected by server clock." });
      return;
    }

    // 5. Duplicate submission check: socket already answered this round
    if (room.answeredThisRound.has(socket.id)) {
      socket.emit("answer:error", { message: "You have already submitted an answer for this question." });
      return;
    }

    // Mark as answered for this round
    room.answeredThisRound.add(socket.id);

    // Calculate score using authoritative server timing & correctness
    const currentQ = room.questions[room.currentQuestionIndex];
    const isCorrect = Number(selectedOption) === currentQ.correctOption;
    
    // Effective time taken is bounded by server elapsed time
    const clientReported = typeof timeTakenMs === "number" ? timeTakenMs : serverElapsed;
    const effectiveTimeTaken = Math.min(Math.max(0, clientReported), serverElapsed, 15000);

    const roundScore = calculateScore(isCorrect, effectiveTimeTaken, 15000);
    player.score += roundScore;
    player.lastAnswer = {
      isCorrect,
      roundScore,
      selectedOption
    };

    // Acknowledge receipt to the player without leaking correctness until time_up
    socket.emit("answer:received", {
      status: "received",
      timeTakenMs: effectiveTimeTaken
    });

    // Notify host how many players have answered (live progress meter)
    io.to(room.hostSocketId).emit("round:player_answered", {
      answeredCount: room.answeredThisRound.size,
      totalPlayers: Object.keys(room.players).length
    });

    // If ALL active players have answered, conclude round early for snappy gameplay
    const totalPlayers = Object.keys(room.players).length;
    if (totalPlayers > 0 && room.answeredThisRound.size >= totalPlayers) {
      if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
      }
      setTimeout(() => {
        if (room.status === "in_progress" && !room.isRevealing) {
          endQuestionRound(io, room);
        }
      }, 350);
    }
  });
}

module.exports = {
  quizRooms,
  generatePin,
  getRoom,
  calculateScore,
  startNextQuestion,
  endQuestionRound,
  registerAnswerHandler
};
