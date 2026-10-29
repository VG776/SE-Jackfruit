const crypto = require('crypto');
const { AppError } = require('../errors/AppError');

function base64UrlEncode(input) {
  return Buffer.from(input, typeof input === 'string' ? 'utf8' : undefined).toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function signToken(payload, secret, { expiresInSeconds = 900, jti } = {}) {
  if (!secret) {
    throw new Error('JWT secret is required to sign token');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const tokenJti = jti || crypto.randomUUID();

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const claims = {
    ...payload,
    jti: tokenJti,
    iat: nowSeconds,
    exp: nowSeconds + expiresInSeconds,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(claims));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64url');

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') {
    throw new AppError({
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication token is required',
    });
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AppError({
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Malformed authentication token',
    });
  }

  const [headerEncoded, payloadEncoded, signatureProvided] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(headerEncoded));
    payload = JSON.parse(base64UrlDecode(payloadEncoded));
  } catch {
    throw new AppError({
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Malformed authentication token',
    });
  }

  if (header.alg !== 'HS256') {
    throw new AppError({
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Unsupported token algorithm',
    });
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64url');

  const providedSigBuf = Buffer.from(signatureProvided);
  const expectedSigBuf = Buffer.from(expectedSignature);

  if (
    providedSigBuf.length !== expectedSigBuf.length ||
    !crypto.timingSafeEqual(providedSigBuf, expectedSigBuf)
  ) {
    throw new AppError({
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Invalid token signature',
    });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < nowSeconds) {
    throw new AppError({
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication token has expired',
    });
  }

  return payload;
}

module.exports = {
  signToken,
  verifyToken,
  base64UrlEncode,
  base64UrlDecode,
};
