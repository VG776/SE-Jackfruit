
require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "NexusChat backend"
  });
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

wss.on("connection", (socket) => {
  console.log("A WebSocket client connected.");

  socket.send(JSON.stringify({
    type: "connection.ready",
    payload: {
      message: "Connected to NexusChat"
    }
  }));

  socket.on("message", (data) => {
    let event;

    try {
      event = JSON.parse(data.toString());
    } catch {
      socket.send(JSON.stringify({
        type: "error",
        payload: {
          message: "Invalid JSON message"
        }
      }));
      return;
    }

    console.log("Received event:", event.type);
  });

  socket.on("close", () => {
    console.log("A WebSocket client disconnected.");
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
});

const PORT = Number(process.env.PORT || process.env.API_PORT || 5000);

server.listen(PORT, () => {
  console.log(`NexusChat backend running on port ${PORT}`);
});
