
const WebSocket = require("ws");

const socket = new WebSocket("ws://localhost:5000");

socket.on("open", () => {
  console.log("SUCCESS: WebSocket connected!");
});

socket.on("message", (data) => {
  console.log("Server response:", data.toString());
  socket.close();
});

socket.on("error", (error) => {
  console.error("WebSocket test failed:", error.message);
  process.exitCode = 1;
});
