
const { verifyToken } = require('./auth');
const { pool } = require('./db');

// Verify the JWT and attach the authenticated user to the request.
function requireAuth(req, res, next) {
  const authorization = req.headers.authorization;

  if (
    typeof authorization !== 'string' ||
    !authorization.startsWith('Bearer ')
  ) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  try {
    const user = verifyToken(token);

    if (!user || typeof user.sub !== 'string' || !user.sub.trim()) {
      return res.status(401).json({
        error: 'Invalid authentication token'
      });
    }

    req.user = { id: user.sub };
    return next();
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired authentication token'
    });
  }
}

// Check membership using the authenticated user's ID.
// Never accept the user ID from request parameters for this check.
async function isChannelMember(channelId, userId) {
  const result = await pool.query(
    `SELECT 1
     FROM channel_memberships
     WHERE channel_id = $1 AND user_id = $2
     LIMIT 1`,
    [channelId, userId]
  );

  return result.rowCount > 0;
}

// Middleware for routes containing :channelId.
function requireChannelMember(req, res, next) {
  const { channelId } = req.params;

  if (
    typeof channelId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(channelId)
  ) {
    return res.status(400).json({
      error: 'Invalid channel identifier'
    });
  }

  isChannelMember(channelId, req.user.id)
    .then((allowed) => {
      if (!allowed) {
        return res.status(404).json({
          error: 'Resource not found'
        });
      }

      return next();
    })
    .catch((error) => {
      console.error('Channel authorization check failed:', error.message);

      return res.status(500).json({
        error: 'Request could not be processed'
      });
    });
}

module.exports = {
  requireAuth,
  isChannelMember,
  requireChannelMember
};
