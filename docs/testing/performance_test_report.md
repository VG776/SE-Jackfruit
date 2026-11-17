# NFR-01 Performance Test Report

## Scope and targets

This report covers the performance targets in SRS §6.1:

| Operation | Target |
|---|---:|
| WebSocket message acknowledgement | p95 ≤ 500 ms |
| Core authenticated API operations | p95 ≤ 2,000 ms |
| Message search on the evaluation dataset | p95 ≤ 2,000 ms |

## Repeatable environment and workload

Run these measurements against a dedicated test or staging deployment using the same deployment, database, region, and dataset for comparisons. Do not use production data. Before each run, record the commit, date and time, OS, CPU and memory, Node.js version, PostgreSQL version, deployment URL origin, and network location. Keep bearer tokens out of terminal logs and result files.

The seeded search evaluation dataset contains 10,000 channel messages in a channel accessible to the benchmark user. `backend/scripts/seed-performance-dataset.js` creates or refreshes deterministic records, split evenly across these five exact search phrases: `docker setup`, `pipeline configuration`, `PostgreSQL database`, `credentials rotation`, and `testing build`. The script is idempotent for a given channel and dataset size. Run it only against the dedicated test database and channel.

The authenticated API workload uses 5 concurrent clients, 2 warm-up iterations per client, then 10 measured iterations per client for each of: community list, channel list, channel history, and each of the five search phrases. This yields 50 measured samples for each core operation and 50 for each search phrase. Requests are issued sequentially by each client. The WebSocket workload uses 10 simultaneously connected clients, 2 unmeasured warm-up sends per client, then 20 measured message sends per client (200 measured acknowledgements total), with a 10-second acknowledgement timeout.

The scripts report per-operation p50, p95, maximum, sample count, runtime/platform, concurrency, workload, and target comparison. p95 uses the nearest-rank method: sorted sample at `ceil(N × 0.95)`. Repeat each benchmark three times under the same conditions and retain each JSON result. Any failed request, search phrase with no matches, or timeout invalidates that run; investigate before claiming a target is met.

### Commands

Set these variables in the shell without recording their secret values. `TEST_ENVIRONMENT` must identify the isolated environment (for example `staging` or `local-test`):

- `API_BASE_URL`, `API_TOKEN`, `COMMUNITY_ID`, `CHANNEL_ID`, `BENCHMARK_USER_ID`, `DATASET_MESSAGES=10000`, and `TEST_ENVIRONMENT` for API and dataset work.
- `WS_URL`, `WS_TOKEN`, `CHANNEL_ID`, `CLIENTS=10`, `MESSAGES_PER_CLIENT=20`, `WARMUP_MESSAGES=2`, `ACK_TIMEOUT_MS=10000`, and `TEST_ENVIRONMENT` for WebSocket work.

Run from `backend`:

```text
npm run benchmark:seed
npm run benchmark:api
npm run benchmark:search
npm run benchmark:messaging
```

`benchmark:api` exercises the deployed authenticated HTTP API, including search. `benchmark:search` measures the repository/service query path against the configured PostgreSQL database. Preserve the JSON output from each run with this report or as a CI artifact.

## Results for this change

**Status: Not measured.** The available environment had no reachable configured PostgreSQL host, and no authenticated API or WebSocket benchmark endpoint and token were configured. The benchmark workloads could not be started, so this report makes no claim that the SRS latency targets pass or fail. There are no valid latency samples, and no application bottleneck can be identified from this environment.

| Measurement | Samples | p50 | p95 | Maximum | Result |
|---|---:|---:|---:|---:|---|
| WebSocket acknowledgement | N/A | N/A | N/A | N/A | Not run; test endpoint and token unavailable |
| Community list API | N/A | N/A | N/A | N/A | Not run; test endpoint and token unavailable |
| Channel list API | N/A | N/A | N/A | N/A | Not run; test endpoint and token unavailable |
| Channel history API | N/A | N/A | N/A | N/A | Not run; test endpoint and token unavailable |
| Search API and PostgreSQL query | N/A | N/A | N/A | N/A | Not run; PostgreSQL host and seeded dataset unavailable |

The targets remain unevaluated until the commands above run successfully in the documented test environment. Do not treat functional integration tests or an in-memory database as measured deployment performance.
