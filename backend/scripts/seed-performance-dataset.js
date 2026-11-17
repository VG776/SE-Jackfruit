const { createHash } = require('crypto');
const { createDatabasePool } = require('../src/config/database');

const channelId = process.env.CHANNEL_ID;
const senderId = process.env.BENCHMARK_USER_ID;
const testEnvironment = process.env.TEST_ENVIRONMENT;
const datasetMessages = Number(process.env.DATASET_MESSAGES || 10000);
const batchSize = 250;
const phrases = [
  'docker setup',
  'pipeline configuration',
  'PostgreSQL database',
  'credentials rotation',
  'testing build',
];

if (!channelId || !senderId || !testEnvironment || !Number.isInteger(datasetMessages) || datasetMessages < phrases.length) {
  throw new Error('Set TEST_ENVIRONMENT, CHANNEL_ID, BENCHMARK_USER_ID, and DATASET_MESSAGES (at least 5) for a dedicated test channel.');
}

function stableUuid(value) {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main() {
  const pool = createDatabasePool();
  const client = await pool.connect();
  let upserted = 0;
  const fixedEndTime = Date.now() - datasetMessages * 1000;

  try {
    await client.query('BEGIN');
    for (let start = 0; start < datasetMessages; start += batchSize) {
      const count = Math.min(batchSize, datasetMessages - start);
      const values = [];
      const params = [];
      for (let offset = 0; offset < count; offset += 1) {
        const index = start + offset;
        const phrase = phrases[index % phrases.length];
        const timestamp = new Date(fixedEndTime + index * 1000).toISOString();
        values.push(`($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, $${params.length + 5}, $${params.length + 6})`);
        params.push(
          stableUuid(`nfr-01:${channelId}:${index}`),
          channelId,
          senderId,
          `NFR-01 evaluation ${index}: ${phrase}`,
          timestamp,
          timestamp,
        );
      }
      const result = await client.query(
        `INSERT INTO messages (id, channel_id, sender_id, content, created_at, updated_at)
         VALUES ${values.join(', ')}
         ON CONFLICT (id) DO UPDATE
           SET content = EXCLUDED.content,
               deleted_at = NULL,
               created_at = EXCLUDED.created_at,
               updated_at = EXCLUDED.updated_at`,
        params,
      );
      upserted += result.rowCount;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(JSON.stringify({
    channelId,
    testEnvironment,
    recordsUpserted: upserted,
    datasetMessages,
    searchTerms: phrases,
    idempotent: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
