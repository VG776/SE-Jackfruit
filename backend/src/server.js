
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env")
});

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { randomUUID } = require("crypto");
const { verifyToken } = require("./auth");
const { pool } = require("./db");
const {
  requireAuth,
  requireChannelMember
} = require("./authorization");

const app = express();
app.use(express.json({ limit: "16kb" }));

// Public health endpoint.
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "NexusChat backend"
  });
});

// REST: Read messages only if the authenticated user is a channel member.
app.get(
  "/api/channels/:channelId/messages",
  requireAuth,
  requireChannelMember,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT message_id, channel_id, sender_id, content, created_at
         FROM messages
         WHERE channel_id = $1 AND deleted_at IS NULL
         ORDER BY created_at ASC
         LIMIT 100`,
        [req.params.channelId]
      );

      return res.json({
        messages: result.rows.map((row) => ({
          messageId: row.message_id,
          channelId: row.channel_id,
          senderId: row.sender_id,
          content: row.content,
          createdAt: row.created_at
        }))
      });
    } catch (error) {
      console.error("Message read failed:", error.message);

      return res.status(500).json({
        error: "Request could not be processed"
      });
    }
  }
);

// REST: Send messages only if the authenticated user is a channel member.
app.post(
  "/api/channels/:channelId/messages",
  requireAuth,
  requireChannelMember,
  async (req, res) => {
    const { content } = req.body;
    const channelId = req.params.channelId;

    if (
      typeof content !== "string" ||
      !content.trim() ||
      content.length > 2000
    ) {
      return res.status(400).json({
        error: "Message must contain 1–2000 characters"
      });
    }

    try {
      // Check membership again as part of the database write.
      const result = await pool.query(
        `INSERT INTO messages
           (message_id, channel_id, sender_id, content)
         SELECT $1, $2, $3, $4
         WHERE EXISTS (
           SELECT 1
           FROM channel_memberships
           WHERE channel_id = $2 AND user_id = $3
         )
         RETURNING message_id, channel_id, sender_id, content, created_at`,
        [
          randomUUID(),
          channelId,
          req.user.id,
          content.trim()
        ]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "Resource not found"
        });
      }

      const row = result.rows[0];

      return res.status(201).json({
        message: {
          messageId: row.message_id,
          channelId: row.channel_id,
          senderId: row.sender_id,
          content: row.content,
          createdAt: row.created_at
        }
      });
    } catch (error) {
      console.error("Message write failed:", error.message);

      return res.status(500).json({
        error: "Request could not be processed"
      });
    }
  }
);

// Create the server only after all REST routes are registered.
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Each connected socket is associated with its authenticated user.
const clients = new Map();

function sendEvent(socket, type, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}

async function isChannelMember(channelId, userId) {
  const result = await pool.query(
    `SELECT 1
     FROM channel_memberships
     WHERE channel_id = $1 AND user_id = $2
     LIMIT 1`,
    [channelId, userId]
  );

  return result.rowCount > 0;
}


async function getOrCreateConversation(userA, userB) {
  if (
    typeof userA !== "string" ||
    !userA.trim() ||
    typeof userB !== "string" ||
    !userB.trim() ||
    userA === userB
  ) {
    throw new Error("Invalid conversation participants");
  }

  const [user1, user2] = [userA, userB].sort();

  const result = await pool.query(
    `INSERT INTO dm_conversations
       (conversation_id, user1_id, user2_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user1_id, user2_id)
     DO UPDATE SET user1_id = EXCLUDED.user1_id
     RETURNING conversation_id, user1_id, user2_id`,
    [randomUUID(), user1, user2]
  );

  const conversation = result.rows[0];

  // Defense in depth: the returned conversation must contain
  // exactly the two requested participants.
  if (
    !conversation ||
    !(
      conversation.user1_id === user1 &&
      conversation.user2_id === user2
    )
  ) {
    throw new Error("Conversation authorization failed");
  }

  return conversation;
}

// Authenticate every WebSocket connection before accepting events.
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

  if (
    !user ||
    typeof user.sub !== "string" ||
    !user.sub.trim()
  ) {
    socket.close(1008, "Invalid token payload");
    return;
  }

  clients.set(socket, {
    userId: user.sub,
    channels: new Set()
  });

  console.log("An authenticated WebSocket client connected.");

  sendEvent(socket, "connection.ready", {
    message: "Connected to NexusChat"
  });

  socket.on("message", async (data) => {
    try {
      const event = JSON.parse(data.toString());

      if (
        !event ||
        typeof event.type !== "string" ||
        !event.payload ||
        typeof event.payload !== "object" ||
        Array.isArray(event.payload)
      ) {
        sendEvent(socket, "error", {
          message: "Invalid event format"
        });
        return;
      }

      const client = clients.get(socket);
      if (!client) return;

      // Join a channel only after verifying membership in the database.
      if (event.type === "channel.join") {
        const { channelId } = event.payload;

        if (
          typeof channelId !== "string" ||
          !/^[a-zA-Z0-9_-]{1,64}$/.test(channelId)
        ) {
          sendEvent(socket, "error", {
            message: "Invalid channelId"
          });
          return;
        }

        if (!(await isChannelMember(channelId, client.userId))) {
          sendEvent(socket, "error", {
            message: "You are not a member of this channel"
          });
          return;
        }

        client.channels.add(channelId);

        sendEvent(socket, "channel.joined", {
          channelId
        });

        return;
      }

      // Send channel messages only after membership and join checks.
      if (event.type === "message.send") {
        const { channelId, content } = event.payload;

        if (
          typeof channelId !== "string" ||
          !/^[a-zA-Z0-9_-]{1,64}$/.test(channelId) ||
          !client.channels.has(channelId)
        ) {
          sendEvent(socket, "error", {
            message: "Join this channel before sending messages"
          });
          return;
        }

        if (
          typeof content !== "string" ||
          !content.trim() ||
          content.length > 2000
        ) {
          sendEvent(socket, "error", {
            message: "Message must contain 1–2000 characters"
          });
          return;
        }

        // Recheck membership in case access was revoked after joining.
        if (!(await isChannelMember(channelId, client.userId))) {
          client.channels.delete(channelId);

          sendEvent(socket, "error", {
            message: "Resource not found"
          });
          return;
        }

        const result = await pool.query(
          `INSERT INTO messages
             (message_id, channel_id, sender_id, content)
           VALUES ($1, $2, $3, $4)
           RETURNING message_id, channel_id, sender_id, content, created_at`,
          [
            randomUUID(),
            channelId,
            client.userId,
            content.trim()
          ]
        );

        const row = result.rows[0];

        const message = {
          messageId: row.message_id,
          channelId: row.channel_id,
          senderId: row.sender_id,
          content: row.content,
          createdAt: row.created_at
        };

        // Deliver only to sockets that joined this channel.
        for (const [recipient, recipientData] of clients) {
          if (recipientData.channels.has(channelId)) {
            sendEvent(recipient, "message.created", message);
          }
        }

        return;
      }

      // Send direct messages. Recipient identity validation against the
      // application's user store must be added when that schema is confirmed.
      if (event.type === "dm.send") {
        const { recipientId, content } = event.payload;

        if (
          typeof recipientId !== "string" ||
          !recipientId.trim() ||
          recipientId.length > 255 ||
          recipientId !== recipientId.trim() ||
          recipientId === client.userId
        ) {
          sendEvent(socket, "error", {
            message: "Invalid DM recipient"
          });
          return;
        }

        if (
          typeof content !== "string" ||
          !content.trim() ||
          content.length > 2000
        ) {
          sendEvent(socket, "error", {
            message: "Message must contain 1–2000 characters"
          });
          return;
        }

        const conversation = await getOrCreateConversation(
          client.userId,
          recipientId
        );

        // Verify the returned conversation includes the authenticated sender
        // before storing or delivering the message.
        if (
          !conversation ||
          (
            conversation.user1_id !== client.userId &&
            conversation.user2_id !== client.userId
          ) ||
          (
            conversation.user1_id !== recipientId &&
            conversation.user2_id !== recipientId
          )
        ) {
          sendEvent(socket, "error", {
            message: "Request could not be processed"
          });
          return;
        }

        const result = await pool.query(
          `INSERT INTO direct_messages
             (message_id, conversation_id, sender_id, content)
           VALUES ($1, $2, $3, $4)
           RETURNING message_id, conversation_id, sender_id,
                     content, created_at`,
          [
            randomUUID(),
            conversation.conversation_id,
            client.userId,
            content.trim()
          ]
        );

        const row = result.rows[0];

        const dm = {
          messageId: row.message_id,
          conversationId: row.conversation_id,
          senderId: row.sender_id,
          recipientId,
          content: row.content,
          createdAt: row.created_at
        };

        // Deliver only to the two conversation participants.
        for (const [recipient, recipientData] of clients) {
          if (
            recipientData.userId === conversation.user1_id ||
            recipientData.userId === conversation.user2_id
          ) {
            sendEvent(recipient, "dm.created", dm);
          }
        }

        return;
      }

      sendEvent(socket, "error", {
        message: "Unsupported event type"
      });
    } catch (error) {
      console.error("WebSocket event failed:", error.message);

      sendEvent(socket, "error", {
        message: "Request could not be processed. Please try again."
      });
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
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
