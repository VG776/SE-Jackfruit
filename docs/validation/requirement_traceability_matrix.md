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


# Requirement Traceability Matrix Update — US-10, US-11, US-12, NFR-02 & NFR-04

This incremental RTM records the implementation and verification added for US-10, US-11, US-12, NFR-02, and NFR-04.

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-MSG-03 | One-to-one direct messages accessible only to participants. Non-participants rejected. | `POST /api/direct-messages/conversations`, `POST & GET /api/direct-messages/conversations/:id/messages`, `DirectMessageService`, `DirectMessageRepository`, `005_create_direct_messages.sql`. | `directMessage.integration.test.js`, `directMessageService.test.js`, `TC-F16`, `TC-F17`, `SEC-03`. | Implemented with pair uniqueness constraint, self-conversation prevention, and strict 403 access control for non-participants. |
| FR-MSG-04 | Authors edit/delete their own messages; moderators/admins may delete. | `PATCH & DELETE /api/channels/:channelId/messages/:messageId`, `MessageService`, `MessageRepository.update`, `MessageRepository.softDelete`, `005_add_message_soft_delete.sql`. | `editDeleteMessage.integration.test.js`, `messageService.test.js`, `TC-F18`, `SEC-11`. | Implemented with author-only editing, role-based deletion for community moderators/admins, and soft-delete semantics with 404 on subsequent access. |
| FR-MSG-05 | Presence and typing events limited to authorized users, with connection-loss handling. | WebSocket gateway events: `SET_PRESENCE`, `TYPING_START`, `TYPING_STOP`, auto online/offline broadcasts, in-memory `presenceMap`. | `presence.integration.test.js`, `TC-F19`. | Implemented with automatic status broadcast on connect/disconnect, channel-scoped typing distribution without sender echo, and channel membership verification. |
| SRS §6.3 / NFR-02 | Validate authentication, authorization, rate limiting, and sensitive data protections. | Bcrypt hashing, Express rate-limiter, Zod input validation, sanitization in `errorHandler.js`. | `security.validation.test.js`, `security_validation_report.md`, `SEC-01` through `SEC-08`. | Verified 100% compliance: salted bcrypt hash storage, 401 on missing/invalid JWT, 429 on abuse, and exclusion of secrets from errors/responses. |
| SRS §6.4 / NFR-04 | Verify maintainability, testability, and portability across environments. | Decoupled 4-tier architecture, dependency injection, in-memory `pg-mem` test fixtures, `.env.example`. | `maintainability_portability_report.md`, Jest unit/integration suites, ESLint. | Verified modular architecture, 100% automated test reproducibility, and clean lint execution without environmental dependencies. |
