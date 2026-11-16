const { ModerationRepository } = require('../src/repositories/moderationRepository');

const INPUT = {
  messageId: 'm1',
  auditId: 'a1',
  communityId: 'c1',
  actorId: 'u1',
  details: { reason: 'spam' },
};

function build(queryImpl) {
  const client = { query: jest.fn(queryImpl), release: jest.fn() };
  const pool = { connect: jest.fn().mockResolvedValue(client) };
  return { repository: new ModerationRepository(pool), client };
}

const sqlOf = (client) => client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0]);

describe('ModerationRepository.removeMessageWithAudit', () => {
  test('commits the removal and the audit insert together', async () => {
    const { repository, client } = build(async (sql) =>
      sql.includes('UPDATE messages') ? { rows: [{ id: 'm1' }] } : { rows: [] },
    );

    const result = await repository.removeMessageWithAudit(INPUT);

    expect(result).toEqual({ id: 'm1' });
    expect(sqlOf(client)).toEqual(['BEGIN', 'UPDATE', 'INSERT', 'COMMIT']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('rolls back and writes no audit row when the message is already removed', async () => {
    const { repository, client } = build(async () => ({ rows: [] }));

    const result = await repository.removeMessageWithAudit(INPUT);

    expect(result).toBeNull();
    expect(sqlOf(client)).toEqual(['BEGIN', 'UPDATE', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('rolls back the removal when the audit insert fails', async () => {
    const failure = new Error('audit down');
    const { repository, client } = build(async (sql) => {
      if (sql.includes('INSERT INTO audit_logs')) throw failure;
      return sql.includes('UPDATE messages') ? { rows: [{ id: 'm1' }] } : { rows: [] };
    });

    await expect(repository.removeMessageWithAudit(INPUT)).rejects.toBe(failure);

    expect(sqlOf(client)).toEqual(['BEGIN', 'UPDATE', 'INSERT', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
