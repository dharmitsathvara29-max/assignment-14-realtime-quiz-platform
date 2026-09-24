/**
 * Real-Time Multiplayer Live Quiz Server
 * Built with Express.js and Socket.io
 */

require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const { registerLobbyHandlers } = require("./sockets/lobbyHandler");
const { registerAnswerHandler } = require("./sockets/gameEngine");

const app = express();
const server = http.createServer(app);

// CORS configuration for cross-origin flexibility
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

// Serve static frontend assets from public directory
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Socket.io initialization with CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Register real-time event handlers on socket connection
io.on("connection", (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);

  registerLobbyHandlers(io, socket);
  registerAnswerHandler(io, socket);

  socket.on("disconnect", (reason) => {
    console.log(`[SOCKET] Client disconnected: ${socket.id} (${reason})`);
  });
});

// Root health check & API endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    timestamp: new Date().toISOString(),
    service: "Real-Time Quiz Battle Arena"
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 Quiz Battle Server running at http://localhost:${PORT}`);
  console.log(`🎪 Host Dashboard: http://localhost:${PORT}/host.html`);
  console.log(`🎮 Player Gamepad: http://localhost:${PORT}/player.html`);
  console.log(`===================================================`);
});
