class TokenRevocationStore {
  constructor() {
    this.revoked = new Map();
  }

  revoke(jti, expiresAtEpochSeconds) {
    if (!jti) return;
    const expiresAtMs = expiresAtEpochSeconds
      ? expiresAtEpochSeconds * 1000
      : Date.now() + 15 * 60 * 1000;
    this.revoked.set(jti, expiresAtMs);
    this.cleanup();
  }

  isRevoked(jti) {
    if (!jti || !this.revoked.has(jti)) {
      return false;
    }
    const expiresAtMs = this.revoked.get(jti);
    if (Date.now() > expiresAtMs) {
      this.revoked.delete(jti);
      return false;
    }
    return true;
  }

  cleanup() {
    const now = Date.now();
    for (const [jti, expiresAtMs] of this.revoked.entries()) {
      if (now > expiresAtMs) {
        this.revoked.delete(jti);
      }
    }
  }

  clear() {
    this.revoked.clear();
  }
}

module.exports = { TokenRevocationStore };
