require('dotenv').config({
  path: require('path').resolve(__dirname, '../../.env')
});

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET;

if (!secret || secret === 'your_jwt_secret_key_here') {
  throw new Error('JWT_SECRET is not configured');
}

function connectClient(userId) {
  const token = jwt.sign(
    { sub: userId },
    secret,
    { algorithm: 'HS256', expiresIn: '5m' }
  );

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://localhost:5000/?token=${encodeURIComponent(token)}`
    );

    const timer = setTimeout(() => {
      cleanup();
      socket.terminate();
      reject(new Error(`Timed out connecting ${userId}`));
    }, 5000);

    function cleanup() {
      clearTimeout(timer);
      socket.off('message', onMessage);
      socket.off('error', onError);
      socket.off('close', onClose);
    }

    function onMessage(data) {
      let event;

      try {
        event = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (event.type === 'connection.ready') {
        cleanup();
        resolve(socket);
      }
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onClose(code, reason) {
      cleanup();
      reject(
        new Error(
          `Connection closed before ready: ${code} ${reason.toString()}`
        )
      );
    }

    socket.on('message', onMessage);
    socket.once('error', onError);
    socket.once('close', onClose);
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
      socket.off('message', onMessage);
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

    socket.on('message', onMessage);
  });
}

async function main() {
  let alice;
  let bob;
  let charlie;

  try {
    // Wait for all clients to authenticate before sending the DM.
    [alice, bob, charlie] = await Promise.all([
      connectClient('test-alice'),
      connectClient('test-bob'),
      connectClient('test-charlie')
    ]);

    alice.on('message', (data) => {
      console.log('ALICE EVENT:', data.toString());
    });

    bob.on('message', (data) => {
      console.log('BOB EVENT:', data.toString());
    });

    const bobDm = waitForEvent(bob, 'dm.created');
    const charlieDm = waitForEvent(charlie, 'dm.created', 1500);

    alice.send(
      JSON.stringify({
        type: 'dm.send',
        payload: {
          recipientId: 'test-bob',
          content: 'Hello Bob, this is a private message!'
        }
      })
    );

    const event = await bobDm;

    if (
      event.payload.senderId !== 'test-alice' ||
      event.payload.recipientId !== 'test-bob' ||
      event.payload.content !== 'Hello Bob, this is a private message!'
    ) {
      throw new Error('DM payload did not match');
    }

    console.log("PASS: Bob received Alice's DM");
    console.log('PASS: DM payload is correct');

    let charlieReceivedDm = false;

    try {
      await charlieDm;
      charlieReceivedDm = true;
    } catch (error) {
      if (!error.message.startsWith('Timed out waiting for dm.created')) {
        throw error;
      }
    }

    if (charlieReceivedDm) {
      throw new Error("Unrelated user received Alice's DM");
    }

    console.log("PASS: Unrelated user did not receive Alice's DM");
  } finally {
    for (const socket of [alice, bob, charlie]) {
      if (
        socket &&
        socket.readyState !== WebSocket.CLOSED &&
        socket.readyState !== WebSocket.CLOSING
      ) {
        socket.close();
      }
    }
  }
}

main().catch((error) => {
  console.error('FAIL:', error.message);
  process.exitCode = 1;
});
