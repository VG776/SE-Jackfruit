
const WebSocket = require('ws');

const socket = new WebSocket(
  'ws://localhost:5000/?token=invalid-token'
);

socket.on('open', () => {
  console.log('WebSocket opened; checking invalid-token rejection...');
});

socket.on('close', (code, reason) => {
  if (
    code === 1008 &&
    reason.toString() === 'Invalid or expired token'
  ) {
    console.log('PASS: Invalid token rejected');
    console.log('Close code:', code);
    console.log('Reason:', reason.toString());
  } else {
    console.error('FAIL: Unexpected close', code, reason.toString());
    process.exitCode = 1;
  }
});

socket.on('error', (error) => {
  console.error('WebSocket error:', error.message);
  process.exitCode = 1;
});
