const { WebSocketServer } = require('ws');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROTOCOL = 'nexuschat.v1';

function tokenFromRequest(request) {
  const authorization = request.headers.authorization;
  if (authorization) {
    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    return match?.[1] || null;
  }

  const offeredProtocols = (request.headers['sec-websocket-protocol'] || '')
    .split(',')
    .map((value) => value.trim());
  return offeredProtocols.find((value) => value.startsWith('bearer.'))?.slice(7) || null;
}

function sendError(socket, code, detail) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({ type: 'ERROR', code, detail }));
  }
}

function createWebSocketGateway(server, { authService, channelService }) {
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
    handleProtocols(protocols) {
      return protocols.has(PROTOCOL) ? PROTOCOL : false;
    },
  });

  server.on('upgrade', async (request, socket, head) => {
    const requestPath = new URL(request.url, 'http://localhost').pathname;
    if (requestPath !== '/api/ws') {
      socket.destroy();
      return;
    }

    const token = tokenFromRequest(request);
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const user = await authService.authenticateToken(token);
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocket.userId = user.id || user.sub;
        webSocket.token = token;
        webSocket.channels = new Set();
        webSocketServer.emit('connection', webSocket, request);
      });
    } catch (_error) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
    }
  });

  webSocketServer.on('connection', (socket) => {
    socket.on('message', async (rawMessage) => {
      try {
        // Revalidate the token for every event so logout, expiry, and account removal
        // take effect on an already-open connection.
        const user = await authService.authenticateToken(socket.token);
        const userId = user.id || user.sub;
        if (userId !== socket.userId) {
          sendError(socket, 'UNAUTHORIZED', 'Authentication is required.');
          socket.close(1008, 'Authentication required');
          return;
        }

        let event;
        try {
          event = JSON.parse(rawMessage.toString());
        } catch (_error) {
          sendError(socket, 'INVALID_EVENT', 'The event must be valid JSON.');
          return;
        }

        const channelId = event?.payload?.channelId;
        if (!event || !['JOIN_CHANNEL', 'LEAVE_CHANNEL'].includes(event.type)) {
          sendError(socket, 'UNSUPPORTED_EVENT', 'The event type is not supported.');
          return;
        }
        if (typeof channelId !== 'string' || !UUID_PATTERN.test(channelId)) {
          sendError(socket, 'INVALID_EVENT', 'A valid channelId is required.');
          return;
        }

        await channelService.assertCanAccessChannel(userId, channelId);
        if (event.type === 'JOIN_CHANNEL') socket.channels.add(channelId);
        else socket.channels.delete(channelId);

        socket.send(JSON.stringify({ type: 'ACK', event: event.type, channelId }));
      } catch (error) {
        const code = error.status === 401 ? 'UNAUTHORIZED' : error.status === 403
          ? 'INSUFFICIENT_PERMISSIONS'
          : 'RESOURCE_NOT_FOUND';
        const detail = code === 'INSUFFICIENT_PERMISSIONS'
          ? 'You do not have permission to access this resource.'
          : code === 'UNAUTHORIZED'
            ? 'Authentication is required.'
            : 'The requested resource could not be found.';
        sendError(socket, code, detail);
        if (code === 'UNAUTHORIZED') socket.close(1008, 'Authentication required');
      }
    });
  });

  return webSocketServer;
}

module.exports = { createWebSocketGateway, PROTOCOL, tokenFromRequest };
