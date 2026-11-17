const { createDatabasePool } = require('../src/config/database');
const { SearchRepository } = require('../src/repositories/searchRepository');
const { SearchService } = require('../src/services/searchService');

const queries = [
  'docker setup',
  'pipeline configuration',
  'PostgreSQL database',
  'credentials rotation',
  'testing build',
];
const userId = process.env.BENCHMARK_USER_ID;
const testEnvironment = process.env.TEST_ENVIRONMENT;
const iterations = Number(process.env.ITERATIONS || 10);
const warmupIterations = Number(process.env.WARMUP_ITERATIONS || 2);
const datasetMessages = Number(process.env.DATASET_MESSAGES || 0);

if (!userId || !testEnvironment || !Number.isInteger(iterations) || iterations < 1 ||
    !Number.isInteger(warmupIterations) || warmupIterations < 0 ||
    !Number.isInteger(datasetMessages) || datasetMessages < 1) {
  throw new Error('Set TEST_ENVIRONMENT, BENCHMARK_USER_ID, positive ITERATIONS and DATASET_MESSAGES, and valid WARMUP_ITERATIONS for a seeded accessible evaluation dataset.');
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function main() {
  const pool = createDatabasePool();
  const searchService = new SearchService(new SearchRepository(pool));
  const latencies = [];
  const perQuery = {};
  const startedAt = new Date().toISOString();

  try {
    for (const query of queries) {
      perQuery[query] = [];
      for (let iteration = -warmupIterations; iteration < iterations; iteration += 1) {
        const started = process.hrtime.bigint();
        const result = await searchService.searchMessages(userId, { q: query, limit: 20 });
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
        if (result.totalMatches < 1) {
          throw new Error(`Evaluation query returned no results: "${query}". Seed the documented evaluation dataset and verify the user can access it.`);
        }
        if (iteration >= 0) {
          latencies.push(elapsedMs);
          perQuery[query].push(elapsedMs);
        }
      }
    }
  } finally {
    await pool.end();
  }

  latencies.sort((a, b) => a - b);
  const p95 = percentile(latencies, 0.95);
  const queryResults = Object.entries(perQuery).map(([query, values]) => {
    const sorted = values.sort((a, b) => a - b);
    return {
      query,
      samples: sorted.length,
      p50Ms: Number(percentile(sorted, 0.50).toFixed(2)),
      p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
      maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
    };
  });

  console.log(JSON.stringify({
    run: {
      startedAt,
      testEnvironment,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      evaluationDatasetMessages: datasetMessages,
      iterationsPerQuery: iterations,
      warmupIterationsPerQuery: warmupIterations,
      queries,
    },
    samples: latencies.length,
    p50Ms: Number(percentile(latencies, 0.50).toFixed(2)),
    p95Ms: Number(p95.toFixed(2)),
    maxMs: Number(latencies[latencies.length - 1].toFixed(2)),
    srsTargetMs: 2000,
    meetsSrsTarget: p95 <= 2000,
    perQuery: queryResults,
  }, null, 2));
  if (p95 > 2000) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, percentile };
