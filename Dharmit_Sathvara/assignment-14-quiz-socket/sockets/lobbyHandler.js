/**
 * Real-Time Quiz Lobby & Room Management Handlers
 * Manages PIN-based room creation, player joining, game start, and graceful disconnects.
 */

const fs = require("fs");
const path = require("path");
const { quizRooms, generatePin, getRoom, startNextQuestion, endQuestionRound } = require("./gameEngine");

// Path to question bank
const questionsFilePath = path.join(__dirname, "..", "data", "questions.json");

/**
 * Fisher-Yates array shuffling
 * @param {Array} array 
 * @returns {Array} shuffled array copy
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Load questions from questions.json
 * @returns {Array}
 */
function loadQuestions() {
  try {
    const rawData = fs.readFileSync(questionsFilePath, "utf8");
    return JSON.parse(rawData);
  } catch (err) {
    console.error("Error reading questions.json:", err);
    return [];
  }
}

/**
 * Register lobby and connection handlers on a socket
 * @param {object} io - Socket.io Server instance
 * @param {object} socket - Connected socket instance
 */
function registerLobbyHandlers(io, socket) {
  // 1. Host creates a quiz room
  socket.on("quiz:create", (payload) => {
    try {
      const { hostName, category } = payload || {};
      const pin = generatePin();
      const roomId = `quiz_${pin}`;
      const allQuestions = loadQuestions();

      if (allQuestions.length === 0) {
        socket.emit("quiz:error", { message: "No trivia questions available on the server." });
        return;
      }

      // Shuffle questions for randomized game session
      const shuffledQuestions = shuffle(allQuestions);

      quizRooms[pin] = {
        pin,
        roomId,
        hostSocketId: socket.id,
        hostName: (hostName && hostName.trim()) || "Quiz Host",
        category: (category && category.trim()) || "Tech & Web Development",
        players: {}, // socketId -> { name, score, lastAnswer }
        questions: shuffledQuestions,
        currentQuestionIndex: -1,
        currentQuestionStartTime: null,
        answeredThisRound: new Set(),
        timer: null,
        transitionTimer: null,
        isRevealing: false,
        status: "lobby" // 'lobby' | 'in_progress' | 'ended'
      };

      socket.join(roomId);

      // Emit PIN and Room ID back to the host
      socket.emit("quiz:created", {
        pin,
        roomId,
        hostName: quizRooms[pin].hostName,
        category: quizRooms[pin].category,
        totalQuestions: shuffledQuestions.length
      });

      console.log(`[LOBBY] Room created with PIN ${pin} by ${quizRooms[pin].hostName}`);
    } catch (error) {
      console.error("[LOBBY] Error in quiz:create:", error);
      socket.emit("quiz:error", { message: "Failed to initialize quiz room." });
    }
  });

  // 2. Player joins lobby with 4-digit PIN
  socket.on("quiz:join", (payload) => {
    try {
      const { pin, playerName } = payload || {};
      const cleanPin = (pin || "").toString().trim();
      const cleanName = (playerName || "").trim();

      if (!cleanPin) {
        socket.emit("quiz:error", { message: "Please enter a valid 4-digit PIN." });
        return;
      }

      if (!cleanName) {
        socket.emit("quiz:error", { message: "Please provide a player nickname." });
        return;
      }

      const room = getRoom(cleanPin);

      if (!room) {
        socket.emit("quiz:error", { message: "Quiz room not found. Check the PIN and try again." });
        return;
      }

      if (room.status !== "lobby") {
        socket.emit("quiz:error", { message: "This quiz is already in progress or has ended." });
        return;
      }

      // Avoid duplicate player names in the room if possible
      const existingNames = Object.values(room.players).map(p => p.name.toLowerCase());
      let finalName = cleanName;
      if (existingNames.includes(cleanName.toLowerCase())) {
        finalName = `${cleanName} #${Math.floor(10 + Math.random() * 90)}`;
      }

      // Add player to room state
      room.players[socket.id] = {
        name: finalName,
        score: 0,
        lastAnswer: null
      };

      socket.join(room.roomId);

      // Acknowledge successful join to the player
      socket.emit("quiz:joined", {
        pin: cleanPin,
        playerName: finalName,
        hostName: room.hostName,
        category: room.category
      });

      // Broadcast updated lobby roster to everyone in the room
      io.to(room.roomId).emit("lobby:update", {
        players: Object.values(room.players).map(p => ({
          name: p.name,
          score: p.score
        }))
      });

      console.log(`[LOBBY] Player '${finalName}' joined room ${cleanPin}`);
    } catch (error) {
      console.error("[LOBBY] Error in quiz:join:", error);
      socket.emit("quiz:error", { message: "Error joining room." });
    }
  });

  // 3. Host starts the game
  socket.on("quiz:start", (payload) => {
    try {
      const { pin } = payload || {};
      const cleanPin = (pin || "").toString().trim();
      const room = getRoom(cleanPin);

      if (!room) {
        socket.emit("quiz:error", { message: "Room not found." });
        return;
      }

      // Only host socket can start the game
      if (socket.id !== room.hostSocketId) {
        socket.emit("quiz:error", { message: "Only the host can start the quiz." });
        return;
      }

      // Prevent starting if already running
      if (room.status !== "lobby") {
        socket.emit("quiz:error", { message: "Quiz has already started." });
        return;
      }

      // Ensure at least 1 player is connected
      const playerCount = Object.keys(room.players).length;
      if (playerCount === 0) {
        socket.emit("quiz:error", { message: "At least 1 player must join before starting the game." });
        return;
      }

      room.status = "in_progress";
      room.currentQuestionIndex = -1;

      console.log(`[GAME] Starting quiz in room ${cleanPin} with ${playerCount} players.`);

      // Launch question 1
      startNextQuestion(io, room);
    } catch (error) {
      console.error("[GAME] Error in quiz:start:", error);
      socket.emit("quiz:error", { message: "Failed to start quiz." });
    }
  });

  // 4. Socket Disconnect handling
  socket.on("disconnect", () => {
    // Find rooms where this socket was host or player
    for (const [pin, room] of Object.entries(quizRooms)) {
      // If host disconnected
      if (room.hostSocketId === socket.id) {
        console.log(`[LOBBY] Host disconnected from room ${pin}`);
        if (room.timer) clearTimeout(room.timer);
        if (room.transitionTimer) clearTimeout(room.transitionTimer);

        io.to(room.roomId).emit("quiz:error", {
          message: "The host has disconnected. Quiz session terminated."
        });

        delete quizRooms[pin];
        continue;
      }

      // If player disconnected
      if (room.players[socket.id]) {
        const playerName = room.players[socket.id].name;
        delete room.players[socket.id];
        room.answeredThisRound.delete(socket.id);

        console.log(`[LOBBY] Player '${playerName}' left room ${pin}`);

        if (room.status === "lobby") {
          io.to(room.roomId).emit("lobby:update", {
            players: Object.values(room.players).map(p => ({
              name: p.name,
              score: p.score
            }))
          });
        } else if (room.status === "in_progress") {
          const leaderboard = Object.values(room.players)
            .sort((a, b) => b.score - a.score)
            .map((p, idx) => ({
              rank: idx + 1,
              name: p.name,
              score: p.score
            }));

          io.to(room.roomId).emit("leaderboard:update", { leaderboard });

          // If remaining players have all answered, conclude round
          const remainingPlayers = Object.keys(room.players).length;
          if (remainingPlayers > 0 && room.answeredThisRound.size >= remainingPlayers) {
            if (room.timer) {
              clearTimeout(room.timer);
              room.timer = null;
            }
            if (!room.isRevealing) {
              endQuestionRound(io, room);
            }
          }
        }
      }
    }
  });
}

module.exports = {
  registerLobbyHandlers
};
