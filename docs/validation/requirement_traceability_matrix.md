# Requirement Traceability Matrix Update — US-07

This incremental RTM records the implementation and verification added for US-07. The referenced
baseline workbook (`07_Requirement_Traceability_Matrix.xlsx`) is not present in this repository.

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-COM-04 | Verify authentication and community/channel permissions on the server before protected operations; reject unauthorized access without changing protected state. | REST authentication middleware; `requireAuthenticatedUser`; `ChannelService`; `ChannelPermissionRepository`; WebSocket gateway. | `channel.integration.test.js`; `webSocketGateway.integration.test.js`; `channelService.test.js`; `TC-F11`; `SEC-01` to `SEC-03`; `SEC-08`. | Implemented for current community creation, channel create/rename/delete, and WebSocket join/leave operations. Membership, messaging, and moderation routes are not implemented yet and have no protected operations to guard. |

## Enforced rules

- Authentication is verified before protected REST handlers run. The WebSocket handshake checks a
  token, and each event revalidates it so logout, expiry, and account removal affect open sockets.
- Community owners are treated as admins. Only owners/admins can create, rename, or delete channels;
  owners and community members can join or leave channels.
- Users outside a community get the same generic 404 for an existing and a missing channel ID.
  Members without the role required for channel management receive 403.
- No membership-management, message history, send-message, or moderation handler exists in the
  current backend. Each must apply resource authorization before adding protected data access.

## Verification record

Automated verification is recorded by the US-07 pull request CI checks. Local test and lint results
are summarized in the pull request description.


# Requirement Traceability Matrix Update — US-08

This incremental RTM records the implementation and verification added for US-08.

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-MSG-01 | Send text messages to accessible channels. Empty or invalid messages rejected. | REST endpoint POST /api/channels/:channelId/messages, WebSocket SEND_MESSAGE event, MessageService, MessageRepository, messageSchemas.js. | message.integration.test.js, webSocketGateway.integration.test.js, messageService.test.js, TC-F12, TC-F13. | Implemented for authorized community owners and members in text channels. Messages persist author (sender_id) and channel_id. Length constrained to 1–2000 chars. |
| FR-COM-04 | Enforce server-side permissions on message submission. | MessageService delegates to ChannelService.assertCanAccessChannel(userId, channelId). | message.integration.test.js, webSocketGateway.integration.test.js, messageService.test.js, TC-F11, SEC-03. | Non-members and non-existent channels return identical 404 to prevent resource disclosure. Unauthenticated requests rejected with 401. |

## Enforced rules

- Senders must be authenticated.
- The server verifies that the caller is the community owner or a member of the community containing the channel before any message write occurs.
- Payload content must be a non-empty string between 1 and 2000 characters.
- Non-members receive a generic 404 identical to non-existent channels, preventing channel enumeration.
- Saved messages atomically persist id, channel_id, sender_id, content, created_at, and updated_at.
- Both REST and WebSocket SEND_MESSAGE routes return structured responses / acks containing message ID, channel ID, timestamp, and optional clientNonce.
