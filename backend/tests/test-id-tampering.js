
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env")
});

const jwt = require("jsonwebtoken");

const BASE_URL = "http://localhost:5000";
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

async function main() {
  const token = makeToken("test-alice");

  // Alice is authorized for "general" in the test database.
  const allowed = await fetch(
    `${BASE_URL}/api/channels/general/messages`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (allowed.status !== 200) {
    throw new Error(
      `Expected access to general (200), got ${allowed.status}`
    );
  }

  console.log("PASS: Alice can access her authorized channel");

  // Try changing the channel ID to an unrelated identifier.
  const changedId = "restricted-room-test";

  const denied = await fetch(
    `${BASE_URL}/api/channels/${changedId}/messages`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (denied.status !== 404) {
    throw new Error(
      `Expected changed channel ID to be denied (404), got ${denied.status}`
    );
  }

  console.log("PASS: Changing the channel ID does not grant read access");

  const deniedWrite = await fetch(
    `${BASE_URL}/api/channels/${changedId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ content: "Unauthorized write test" })
    }
  );

  if (deniedWrite.status !== 404) {
    throw new Error(
      `Expected changed channel ID write to be denied (404), got ${deniedWrite.status}`
    );
  }

  console.log("PASS: Changing the channel ID does not grant write access");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
