const { randomUUID } = require('crypto');
const { AppError } = require('../errors/AppError');

const SECRET_KEYS = /pass(word)?|token|secret|authorization|api[-_]?key/i;

function notFound() {
  return new AppError({
    status: 404,
    code: 'RESOURCE_NOT_FOUND',
    detail: 'The requested resource could not be found.',
  });
}

// FR-MOD-03: audit records must never contain secrets.
function sanitizeDetails(details = {}) {
  return Object.fromEntries(Object.entries(details).filter(([key]) => !SECRET_KEYS.test(key)));
}

function parseDetails(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return {};
  }
}

class AuditService {
  constructor(auditRepository, permissionRepository) {
    this.auditRepository = auditRepository;
    this.permissionRepository = permissionRepository;
  }

  async record({ communityId, actorId, action, targetType, targetId, details }) {
    return this.auditRepository.record({
      id: randomUUID(),
      communityId,
      actorId,
      action,
      targetType,
      targetId,
      details: sanitizeDetails(details),
    });
  }

  async list(userId, communityId, { page = 1, limit = 50 } = {}) {
    const role = await this.permissionRepository.roleInCommunity(userId, communityId);
    if (!role) throw notFound();
    if (role !== 'admin' && role !== 'moderator') {
      throw new AppError({
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        detail: 'You do not have permission to perform this operation.',
      });
    }

    const rows = await this.auditRepository.listByCommunity(communityId, {
      limit,
      offset: (page - 1) * limit,
    });

    return {
      communityId,
      page,
      limit,
      logs: rows.map((row) => ({
        id: row.id,
        actor: row.actor_id ? { id: row.actor_id, username: row.actor_username } : null,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        details: parseDetails(row.details),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      })),
    };
  }
}

module.exports = { AuditService, sanitizeDetails };
