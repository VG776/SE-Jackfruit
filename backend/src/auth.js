
const jwt = require('jsonwebtoken');

function verifyToken(token) {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret === 'your_jwt_secret_key_here') {
    throw new Error('JWT_SECRET is not configured securely');
  }

  return jwt.verify(token, secret, {
    algorithms: ['HS256']
  });
}

module.exports = { verifyToken };
