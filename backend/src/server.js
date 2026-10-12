
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env")
});

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { randomUUID } = require("crypto");
const { verifyToken } = require("./auth");
const url = require("url");

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

// Connected clients and their joined channels.
// Authentication and database persistence will be added next.
const clients = new Map();

function sendEvent(socket, type, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}


wss.on("connection", (socket, request) => {
  const requestUrl = new URL(request.url, "http://localhost");
  const token = requestUrl.searchParams.get("token");

  if (!token) {
    socket.close(1008, "Authentication required");
    return;
  }

  let user;

  try {
    user = verifyToken(token);
  } catch {
    socket.close(1008, "Invalid or expired token");
    return;
  }

  if (!user || typeof user.sub !== "string" || !user.sub) {
    socket.close(1008, "Invalid token payload");
    return;
  }

  clients.set(socket, { channels: new Set() });
  console.log("A WebSocket client connected.");

  sendEvent(socket, "connection.ready", {
    message: "Connected to NexusChat"
  });

  socket.on("message", (data) => {
    let event;

    try {
      event = JSON.parse(data.toString());
    } catch {
      sendEvent(socket, "error", {
        message: "Invalid JSON message"
      });
      return;
    }

    if (!event || typeof event.type !== "string" ||
        !event.payload || typeof event.payload !== "object" ||
        Array.isArray(event.payload)) {
      sendEvent(socket, "error", {
        message: "Invalid event format"
      });
      return;
    }

    const client = clients.get(socket);

    if (event.type === "channel.join") {
      const { channelId } = event.payload;

      if (typeof channelId !== "string" ||
          !/^[a-zA-Z0-9_-]{1,64}$/.test(channelId)) {
        sendEvent(socket, "error", {
          message: "Invalid channelId"
        });
        return;
      }

      client.channels.add(channelId);

      sendEvent(socket, "channel.joined", { channelId });
      return;
    }

    if (event.type === "message.send") {
      const { channelId, content } = event.payload;

      if (typeof channelId !== "string" ||
          !client.channels.has(channelId)) {
        sendEvent(socket, "error", {
          message: "Join this channel before sending messages"
        });
        return;
      }

      if (typeof content !== "string" ||
          content.trim().length === 0 ||
          content.length > 2000) {
        sendEvent(socket, "error", {
          message: "Message must contain 1–2000 characters"
        });
        return;
      }

      const message = {
        messageId: randomUUID(),
        channelId,
        content: content.trim(),
        createdAt: new Date().toISOString()
      };

      for (const [recipient, recipientData] of clients) {
        if (recipientData.channels.has(channelId)) {
          sendEvent(recipient, "message.created", message);
        }
      }

      return;
    }

    sendEvent(socket, "error", {
      message: `Unsupported event type: ${event.type}`
    });
  });

  socket.on("close", () => {
    clients.delete(socket);
    console.log("A WebSocket client disconnected.");
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
});

const PORT = Number(
  process.env.PORT || process.env.API_PORT || 5000
);

server.listen(PORT, () => {
  console.log(`NexusChat backend running on port ${PORT}`);
});
