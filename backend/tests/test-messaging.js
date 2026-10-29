
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env")
});

const WebSocket = require("ws");
const jwt = require("jsonwebtoken");

const secret = process.env.JWT_SECRET;

if (!secret || secret === "your_jwt_secret_key_here") {
  throw new Error("Set a valid JWT_SECRET in the project .env file");
}

function connectClient(userId) {
  const token = jwt.sign(
    { sub: userId },
    secret,
    { algorithm: "HS256", expiresIn: "5m" }
  );

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://localhost:5000/?token=${encodeURIComponent(token)}`
    );

    socket.once("open", () => resolve(socket));
    socket.once("error", reject);

    socket.once("close", (code, reason) => {
      reject(new Error(
        `Connection rejected: ${code} ${reason.toString()}`
      ));
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
  const alice = await connectClient("test-alice");
  let bob;

  try {
    bob = await connectClient("test-bob");

    const aliceJoined = waitForEvent(alice, "channel.joined");
    const bobJoined = waitForEvent(bob, "channel.joined");

    alice.send(JSON.stringify({
      type: "channel.join",
      payload: { channelId: "general" }
    }));

    bob.send(JSON.stringify({
      type: "channel.join",
      payload: { channelId: "general" }
    }));

    await Promise.all([aliceJoined, bobJoined]);

    const receivedByBob = waitForEvent(bob, "message.created");

    alice.send(JSON.stringify({
      type: "message.send",
      payload: {
        channelId: "general",
        content: "Hello from authenticated Alice!"
      }
    }));

    const event = await receivedByBob;

    if (event.payload.content !== "Hello from authenticated Alice!") {
      throw new Error("Message content did not match");
    }

    console.log("PASS: Authenticated clients connected");
    console.log("PASS: Bob received Alice's message");
    console.log("Received:", event.payload.content);
  } finally {
    alice.close();
    if (bob) bob.close();
  }
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
