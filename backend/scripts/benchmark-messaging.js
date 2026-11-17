const WebSocket = require('ws');

const url = process.env.WS_URL;
const token = process.env.WS_TOKEN;
const channelId = process.env.CHANNEL_ID;
const clients = Number(process.env.CLIENTS || 10);
const messagesPerClient = Number(process.env.MESSAGES_PER_CLIENT || 20);
const warmupMessages = Number(process.env.WARMUP_MESSAGES || 2);
const ackTimeoutMs = Number(process.env.ACK_TIMEOUT_MS || 10000);
const testEnvironment = process.env.TEST_ENVIRONMENT;
const protocol = 'nexuschat.v1';

if (!url || !token || !channelId || !testEnvironment || !Number.isInteger(clients) || clients < 1 ||
    !Number.isInteger(messagesPerClient) || messagesPerClient < 1 ||
    !Number.isInteger(warmupMessages) || warmupMessages < 0 ||
    !Number.isInteger(ackTimeoutMs) || ackTimeoutMs < 1) {
  throw new Error('Set WS_URL, WS_TOKEN, CHANNEL_ID, positive CLIENTS/MESSAGES_PER_CLIENT, and valid WARMUP_MESSAGES/ACK_TIMEOUT_MS values.');
}

function openClient() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, [protocol, `bearer.${token}`]);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function waitFor(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for acknowledgement after ${ackTimeoutMs} ms.`));
    }, ackTimeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      socket.off('error', onError);
    };
    const onMessage = (raw) => {
      const event = JSON.parse(raw.toString());
      if (predicate(event)) {
        cleanup();
        resolve(event);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    socket.on('message', onMessage);
    socket.once('error', onError);
  });
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function runClient(clientNumber) {
  const socket = await openClient();
  const joined = waitFor(socket, (event) => event.type === 'ACK' && event.event === 'JOIN_CHANNEL');
  socket.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId } }));
  await joined;
  const latencies = [];

  for (let index = -warmupMessages; index < messagesPerClient; index += 1) {
    const clientNonce = `bench-${clientNumber}-${index}-${Date.now()}`;
    const started = process.hrtime.bigint();
    const ack = waitFor(socket, (event) => event.type === 'ACK' &&
      event.event === 'SEND_MESSAGE' && event.payload.clientNonce === clientNonce);
    socket.send(JSON.stringify({
      type: 'SEND_MESSAGE',
      payload: { channelId, content: `US-09 benchmark ${clientNonce}`, clientNonce },
    }));
    const response = await ack;
    if (index >= 0) {
      if (response.payload.status !== 'DELIVERED') {
        throw new Error(`Unexpected message acknowledgement status: ${response.payload.status}`);
      }
      latencies.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
  }
  socket.close();
  return latencies;
}

async function main() {
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: clients }, (_, index) => runClient(index)));
  const latencies = results.flat().sort((a, b) => a - b);
  console.log(JSON.stringify({
    run: {
      startedAt: new Date().toISOString(),
      environment: testEnvironment,
      endpointOrigin: new URL(url).origin,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      ackTimeoutMs,
      warmupMessagesPerClient: warmupMessages,
    },
    clients,
    messagesPerClient,
    totalMessages: latencies.length,
    elapsedMs: Date.now() - started,
    p50AckMs: Number(percentile(latencies, 0.50).toFixed(2)),
    p95AckMs: Number(percentile(latencies, 0.95).toFixed(2)),
    srsP95TargetMs: 500,
    meetsSrsP95Target: percentile(latencies, 0.95) <= 500,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
