const baseUrl = (process.env.API_BASE_URL || '').replace(/\/+$/, '');
const token = process.env.API_TOKEN;
const testEnvironment = process.env.TEST_ENVIRONMENT;
const communityId = process.env.COMMUNITY_ID;
const channelId = process.env.CHANNEL_ID;
const clients = Number(process.env.CLIENTS || 5);
const iterations = Number(process.env.ITERATIONS || 10);
const warmupIterations = Number(process.env.WARMUP_ITERATIONS || 2);
const datasetMessages = Number(process.env.DATASET_MESSAGES || 0);
const searchTerms = [
  'docker setup',
  'pipeline configuration',
  'PostgreSQL database',
  'credentials rotation',
  'testing build',
];

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

if (!baseUrl || !token || !testEnvironment || !communityId || !channelId ||
    !positiveInteger(clients) || !positiveInteger(iterations) ||
    !Number.isInteger(warmupIterations) || warmupIterations < 0 ||
    !positiveInteger(datasetMessages)) {
  throw new Error(
    'Set API_BASE_URL, API_TOKEN, TEST_ENVIRONMENT, COMMUNITY_ID, CHANNEL_ID, and valid CLIENTS, ITERATIONS, WARMUP_ITERATIONS, and DATASET_MESSAGES values.',
  );
}

const operations = [
  {
    name: 'listCommunities',
    target: '/api/communities',
  },
  {
    name: 'listChannels',
    target: `/api/communities/${encodeURIComponent(communityId)}/channels`,
  },
  {
    name: 'loadChannelHistory',
    target: `/api/channels/${encodeURIComponent(channelId)}/messages?limit=50`,
  },
  ...searchTerms.map((term) => ({
    name: `search:${term}`,
    target: `/api/search?q=${encodeURIComponent(term)}&limit=20`,
    requireMatches: true,
  })),
];

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function measure(operation) {
  const started = process.hrtime.bigint();
  const response = await fetch(`${baseUrl}${operation.target}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const body = await response.json();
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (operation.requireMatches && !(body?.data?.totalMatches > 0)) {
    throw new Error('Evaluation query returned no matching messages');
  }
  return elapsedMs;
}

async function main() {
  const startedAt = new Date().toISOString();
  const samples = new Map(operations.map((operation) => [operation.name, []]));
  const failures = [];
  const worker = async (clientNumber) => {
    for (let iteration = -warmupIterations; iteration < iterations; iteration += 1) {
      for (const operation of operations) {
        try {
          const elapsedMs = await measure(operation);
          if (iteration >= 0) samples.get(operation.name).push(elapsedMs);
        } catch (error) {
          failures.push({ client: clientNumber, operation: operation.name, error: error.message });
        }
      }
    }
  };

  const started = Date.now();
  await Promise.all(Array.from({ length: clients }, (_, index) => worker(index + 1)));
  const results = [...samples.entries()].map(([operation, values]) => {
    const sorted = values.sort((a, b) => a - b);
    if (!sorted.length) {
      return { operation, samples: 0, p50Ms: null, p95Ms: null, maxMs: null, meetsTwoSecondTarget: false };
    }
    const p95Ms = percentile(sorted, 0.95);
    return {
      operation,
      samples: sorted.length,
      p50Ms: Number(percentile(sorted, 0.50).toFixed(2)),
      p95Ms: Number(p95Ms.toFixed(2)),
      maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
      meetsTwoSecondTarget: p95Ms <= 2000,
    };
  });
  const coreOperations = results.filter(({ operation }) => !operation.startsWith('search:'));
  const searchOperations = results.filter(({ operation }) => operation.startsWith('search:'));
  const allTargetsMet = results.every((result) => result.meetsTwoSecondTarget) && failures.length === 0;

  console.log(JSON.stringify({
    run: {
      startedAt,
      testEnvironment,
      baseOrigin: new URL(baseUrl).origin,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      clients,
      iterationsPerOperationPerClient: iterations,
      warmupIterationsPerClient: warmupIterations,
      evaluationDatasetMessages: datasetMessages,
      searchTerms,
      elapsedMs: Date.now() - started,
    },
    targets: { coreApiAndSearchP95Ms: 2000 },
    coreOperations,
    searchOperations,
    failedRequests: failures.length,
    failureSamples: failures.slice(0, 20),
    allTargetsMet,
  }, null, 2));

  if (!allTargetsMet) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
