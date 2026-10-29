
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env")
});

const WebSocket = require("ws");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  throw new Error("JWT_SECRET is not configured");
}

function makeToken(userId) {
  return jwt.sign(
    { sub: userId },
    SECRET,
    { algorithm: "HS256", expiresIn: "5m" }
  );
}

function connect(userId) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://localhost:5000/?token=${encodeURIComponent(makeToken(userId))}`
    );

    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("Timed out connecting to WebSocket"));
    }, 5000);

    socket.once("open", () => clearTimeout(timer));

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    socket.once("message", (data) => {
      let event;

      try {
        event = JSON.parse(data.toString());
      } catch {
        socket.close();
        reject(new Error("Invalid WebSocket response"));
        return;
      }

      if (event.type !== "connection.ready") {
        socket.close();
        reject(new Error("Expected connection.ready"));
        return;
      }

      resolve(socket);
    });
  });
}

function waitForEvent(socket, expectedType, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${expectedType}`));
    }, timeout);

    function cleanup() {
      clearTimeout(timer);
      socket.off("message", onMessage);
    }

    function onMessage(data) {
      let event;

      try {
        event = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (event.type === expectedType) {
        cleanup();
        resolve(event);
      }
    }

    socket.on("message", onMessage);
  });
}

async function main() {
  let socket;

  try {
    socket = await connect("test-charlie");

    const errorPromise = waitForEvent(socket, "error");

    socket.send(JSON.stringify({
      type: "channel.join",
      payload: { channelId: "general" }
    }));

    const event = await errorPromise;

    if (!event.payload.message.includes("not a member")) {
      throw new Error("Unexpected authorization response");
    }

    console.log("PASS: WebSocket non-member join rejected");
  } finally {
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }
  }
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
