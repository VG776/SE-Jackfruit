const { WebSocketServer } = require('ws');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROTOCOL = 'nexuschat.v1';

// In-memory presence state: userId -> { status, updatedAt }
const presenceMap = new Map();
const VALID_PRESENCE = new Set(['online', 'idle', 'offline']);

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

function broadcastToAll(webSocketServer, message) {
  const payload = JSON.stringify(message);
  for (const client of webSocketServer.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

function broadcastToChannelMembers(webSocketServer, channelId, message, excludeSocket = null) {
  const payload = JSON.stringify(message);
  for (const client of webSocketServer.clients) {
    if (client !== excludeSocket && client.readyState === client.OPEN && client.channels?.has(channelId)) {
      client.send(payload);
    }
  }
}

function createWebSocketGateway(server, { authService, channelService, messageService }) {
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
    // Set presence to online on connect and broadcast to all
    presenceMap.set(socket.userId, { status: 'online', updatedAt: new Date().toISOString() });
    broadcastToAll(webSocketServer, {
      type: 'PRESENCE_UPDATE',
      payload: { userId: socket.userId, status: 'online', updatedAt: presenceMap.get(socket.userId).updatedAt },
    });

    socket.on('close', () => {
      presenceMap.set(socket.userId, { status: 'offline', updatedAt: new Date().toISOString() });
      broadcastToAll(webSocketServer, {
        type: 'PRESENCE_UPDATE',
        payload: { userId: socket.userId, status: 'offline', updatedAt: presenceMap.get(socket.userId).updatedAt },
      });
    });

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

        if (
          !event ||
          !['JOIN_CHANNEL', 'LEAVE_CHANNEL', 'SEND_MESSAGE', 'SET_PRESENCE', 'TYPING_START', 'TYPING_STOP'].includes(
            event.type,
          )
        ) {
          sendError(socket, 'UNSUPPORTED_EVENT', 'The event type is not supported.');
          return;
        }

        // Handle SET_PRESENCE first (no channelId needed)
        if (event.type === 'SET_PRESENCE') {
          const status = event?.payload?.status;
          if (!VALID_PRESENCE.has(status)) {
            sendError(socket, 'INVALID_EVENT', 'Presence status must be online, idle, or offline');
            return;
          }
          const updatedAt = new Date().toISOString();
          presenceMap.set(socket.userId, { status, updatedAt });
          broadcastToAll(webSocketServer, {
            type: 'PRESENCE_UPDATE',
            payload: { userId: socket.userId, status, updatedAt },
          });
          return;
        }

        // All other events need channelId
        const channelId = event?.payload?.channelId;
        if (typeof channelId !== 'string' || !UUID_PATTERN.test(channelId)) {
          sendError(socket, 'INVALID_EVENT', 'A valid channelId is required.');
          return;
        }

        if (event.type === 'JOIN_CHANNEL' || event.type === 'LEAVE_CHANNEL') {
          await channelService.assertCanAccessChannel(userId, channelId);
          if (event.type === 'JOIN_CHANNEL') socket.channels.add(channelId);
          else socket.channels.delete(channelId);

          socket.send(JSON.stringify({ type: 'ACK', event: event.type, channelId }));
          return;
        }

        if (event.type === 'SEND_MESSAGE') {
          if (!messageService) {
            sendError(socket, 'INTERNAL_SERVER_ERROR', 'Messaging service is not available.');
            return;
          }

          const content = event.payload?.content;
          const clientNonce = event.payload?.clientNonce;

          const savedMessage = await messageService.sendMessage(userId, channelId, {
            content,
            clientNonce,
          });

          socket.send(
            JSON.stringify({
              type: 'ACK',
              event: 'SEND_MESSAGE',
              payload: {
                clientNonce: clientNonce || null,
                messageId: savedMessage.id,
                channelId: savedMessage.channelId,
                status: 'DELIVERED',
                timestamp: savedMessage.createdAt,
              },
            }),
          );
          return;
        }

        if (event.type === 'TYPING_START' || event.type === 'TYPING_STOP') {
          if (!socket.channels.has(channelId)) {
            sendError(socket, 'NOT_IN_CHANNEL', 'You must join the channel before sending typing events.');
            return;
          }
          broadcastToChannelMembers(
            webSocketServer,
            channelId,
            {
              type: 'TYPING',
              payload: { userId: socket.userId, channelId, typing: event.type === 'TYPING_START' },
            },
            socket,
          );
          return;
        }
      } catch (error) {
        const code =
          error.status === 400
            ? 'INVALID_INPUT_PAYLOAD'
            : error.status === 401
              ? 'UNAUTHORIZED'
              : error.status === 403
                ? 'INSUFFICIENT_PERMISSIONS'
                : 'RESOURCE_NOT_FOUND';
        const detail =
          code === 'INVALID_INPUT_PAYLOAD'
            ? error.detail || 'Message content is invalid.'
            : code === 'INSUFFICIENT_PERMISSIONS'
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

module.exports = { createWebSocketGateway, PROTOCOL, tokenFromRequest, presenceMap };
