
require('dotenv').config({
  path: require('path').resolve(__dirname, '../../.env')
});

const jwt = require('jsonwebtoken');

const BASE_URL = 'http://localhost:5000';
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  throw new Error('JWT_SECRET is not configured');
}

function makeToken(userId) {
  return jwt.sign(
    { sub: userId },
    SECRET,
    { algorithm: 'HS256', expiresIn: '5m' }
  );
}

async function main() {
  // Test 1: Requests without authentication must be rejected.
  const anonymousResponse = await fetch(
    `${BASE_URL}/api/channels/general/messages`
  );

  if (anonymousResponse.status !== 401) {
    throw new Error(
      `Anonymous request: expected 401, got ${anonymousResponse.status}`
    );
  }

  console.log('PASS: Unauthenticated read rejected');

  // Test 2: A channel member should be allowed to read messages.
  const memberResponse = await fetch(
    `${BASE_URL}/api/channels/general/messages`,
    {
      headers: {
        Authorization: `Bearer ${makeToken('test-alice')}`
      }
    }
  );

  if (memberResponse.status !== 200) {
    throw new Error(
      `Member read: expected 200, got ${memberResponse.status}`
    );
  }

  console.log('PASS: Authorized channel member can read messages');

  // Test 3: A non-member must not read channel messages.
  const outsiderResponse = await fetch(
    `${BASE_URL}/api/channels/general/messages`,
    {
      headers: {
        Authorization: `Bearer ${makeToken('test-charlie')}`
      }
    }
  );

  if (outsiderResponse.status !== 404) {
    throw new Error(
      `Outsider read: expected 404, got ${outsiderResponse.status}`
    );
  }

  console.log('PASS: Non-member cannot read protected messages');

  // Test 4: A non-member must not send a message.
  const writeResponse = await fetch(
    `${BASE_URL}/api/channels/general/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${makeToken('test-charlie')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: 'Unauthorized test message'
      })
    }
  );

  if (writeResponse.status !== 404) {
    throw new Error(
      `Outsider write: expected 404, got ${writeResponse.status}`
    );
  }

  console.log('PASS: Non-member cannot send protected messages');
  console.log('All REST authorization tests passed.');
}

main().catch((error) => {
  console.error('FAIL:', error.message);
  process.exitCode = 1;
});
