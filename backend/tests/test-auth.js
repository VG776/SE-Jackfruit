
const WebSocket = require("ws");

const socket = new WebSocket("ws://localhost:5000/");

let passed = false;

socket.on("open", () => {
  console.log("WebSocket opened; waiting for authentication rejection...");
});

socket.on("close", (code, reason) => {
  if (code === 1008 && reason.toString() === "Authentication required") {
    console.log("PASS: Unauthenticated connection rejected");
    console.log("Close code:", code);
    console.log("Reason:", reason.toString());
    passed = true;
  } else {
    console.error("FAIL: Unexpected close", code, reason.toString());
    process.exitCode = 1;
  }
});

socket.on("error", (error) => {
  console.error("WebSocket error:", error.message);
  process.exitCode = 1;
});

socket.on("unexpected-response", (_request, response) => {
  if (response.statusCode === 401 || response.statusCode === 403) {
    console.log("PASS: Unauthenticated handshake rejected");
    passed = true;
  } else {
    console.error("FAIL: Unexpected HTTP status", response.statusCode);
    process.exitCode = 1;
  }
});
