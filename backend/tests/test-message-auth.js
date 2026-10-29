
require('dotenv').config({
  path: require('path').resolve(__dirname, '../../.env')
});

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET;

if (!secret || secret === 'your_jwt_secret_key_here') {
  throw new Error('JWT_SECRET is not configured');
}

const token = jwt.sign(
  { sub: 'test-outsider' },
  secret,
  { algorithm: 'HS256', expiresIn: '5m' }
);

const socket = new WebSocket(
  `ws://localhost:5000/?token=${encodeURIComponent(token)}`
);

let finished = false;

function finish(success, message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  console.log(`${success ? 'PASS' : 'FAIL'}: ${message}`);
  socket.close();
  if (!success) process.exitCode = 1;
}

const timer = setTimeout(() => {
  finish(false, 'Timed out waiting for authorization result');
}, 5000);

socket.on('open', () => {
  // Attempt to send without joining the channel.
  socket.send(JSON.stringify({
    type: 'message.send',
    payload: {
      channelId: 'general',
      content: 'Unauthorized test message'
    }
  }));
});

socket.on('message', (data) => {
  let event;

  try {
    event = JSON.parse(data.toString());
  } catch {
    return;
  }

  if (event.type === 'message.created') {
    finish(false, 'Unauthorized message was broadcast');
  }

  if (
    event.type === 'error' &&
    event.payload?.message ===
      'Join this channel before sending messages'
  ) {
    finish(true, 'Non-member message rejected before saving');
  }
});

socket.on('error', (error) => {
  finish(false, `WebSocket error: ${error.message}`);
});

socket.on('close', (code, reason) => {
  if (!finished) {
    finish(
      false,
      `Connection closed unexpectedly: ${code} ${reason.toString()}`
    );
  }
});
