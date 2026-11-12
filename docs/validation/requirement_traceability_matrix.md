# Requirement Traceability Matrix Update — US-05

This incremental RTM records the implementation and verification added for US-05 (Manage invitations and membership).

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-COM-02 | Allow community administrators to invite users and manage community membership, rejecting unauthorized users. | `POST /api/communities/:communityId/invites`, `POST /api/invites/:code/join`, `GET /api/communities/:communityId/members`, `PATCH /api/communities/:communityId/members/:userId`, `DELETE /api/communities/:communityId/members/:userId`, `MembershipService`, `MembershipRepository`, `membershipSchemas.js`, and migration `006_create_community_invites.sql`. | `membership.integration.test.js`, `membershipService.test.js`, `TC-F08`, `TC-F09`, `SEC-02`, `SEC-03`. | Administrators and owners can generate cryptographic invite tokens with optional max-uses and expirations, list community members, promote/demote member roles, and remove members. Members joining with an invite code are automatically enrolled as `member`. |
| FR-COM-04 | Enforce server-side permissions for community invitation and membership operations. | `MembershipService.assertAdmin`, role verification against database `communities` and `community_members`. | `membership.integration.test.js`, `membershipService.test.js`, `TC-F09`, `SEC-02`. | Unauthenticated requests are rejected with 401. Non-members receive generic 404 identical to non-existent communities (preventing enumeration). Ordinary members attempting invite generation or membership changes receive 403. Community owner cannot be modified or removed (400). |

## US-05 Enforced Rules

- **Invite Generation:** `POST /api/communities/:communityId/invites` requires administrator or owner role. Supports optional integer `maxUses` (default: 1) and positive `expiresInHours`. Generates a 32-character hexadecimal cryptographically secure random token.
- **Invite Joining:** `POST /api/invites/:code/join` allows authenticated users to join the community. Expired tokens or tokens reaching `maxUses` return 404 `INVITE_EXPIRED`. Users already in the community (or the owner) receive 409 `ALREADY_MEMBER`.
- **Membership Listing:** `GET /api/communities/:communityId/members` allows any community member (owner, admin, moderator, member) to list members. Outsiders receive 404 `RESOURCE_NOT_FOUND`.
- **Role Updates & Member Removal:** `PATCH /api/communities/:communityId/members/:userId` and `DELETE /api/communities/:communityId/members/:userId` are restricted to administrators. Changing the role of or removing the community owner is rejected with 400 `CANNOT_MODIFY_OWNER`.

# Requirement Traceability Matrix Update — US-07

This incremental RTM records the implementation and verification added for US-07. The referenced
baseline workbook (`07_Requirement_Traceability_Matrix.xlsx`) is not present in this repository.

# Requirement Traceability Matrix Update — US-03

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-AUTH-04 | Let an authenticated user view and update permitted profile fields, rejecting invalid values and protecting account fields. | `GET /api/users/me`, `PUT /api/users/me`, `AuthService.updateProfile`, `UserRepository.updateProfile`, and `profileUpdateSchema`. | `profile.integration.test.js` covers profile retrieval, valid updates, invalid values, authentication, and read-only account fields. | Users may update only their own display name, HTTP(S) avatar URL, and presence status. Username, email, account ID, and credentials cannot be changed through this profile API. |

## US-03 field rules

- `displayName`: trimmed string from 1 to 50 characters.
- `avatarUrl`: HTTP or HTTPS URL, or `null` to clear it.
- `status`: one of `online`, `idle`, or `offline`.
- Profile updates use the authenticated token subject as the user ID; request bodies cannot select a different user.

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


# Requirement Traceability Matrix Update — US-09

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-MSG-02 | Persist channel messages, deliver them in real time only to authorized subscribers, and restore prior messages after reconnect. | `MessageService`, `MessageRepository`, `GET /api/channels/:channelId/messages`, WebSocket `MESSAGE_CREATED`, and migration `005_index_message_history.sql`. | `messageService.test.js`, `message.integration.test.js`, and `webSocketGateway.integration.test.js`; performance procedure in `backend/scripts/benchmark-messaging.js`. | Implemented for channel messages. The existing `DELIVERED` acknowledgement follows the database write and subscriber fan-out attempt; reconnect retrieves persisted history through cursor pagination. Performance benchmark requires an authenticated test deployment and is marked not run until executed. |
| FR-COM-04 | Enforce server-side permissions for channel history and live delivery. | `MessageService.getChannelHistory` and delivery-time membership checks in `webSocketGateway.js`. | History API tests for guests/non-members; WebSocket tests for unauthorized joins and revoked subscriptions. | Non-members receive the same generic 404 as a missing channel; stale subscriptions are dropped before fan-out. |
| SRS §6.1 | Keep WebSocket message acknowledgement p95 at or below 500 ms under the documented load. | `npm run benchmark:messaging` using the configured URL, authorized test token, channel, and concurrency. | Benchmark output records client count, message count, elapsed time, p50/p95, and target comparison. | Measurement not run in this change environment; no result is claimed. |

## US-09 verification boundary

- A successful WebSocket `ACK` means the message was persisted and the server completed its authorized subscriber fan-out attempt; it is not a per-client read receipt.
- Reconnecting clients must request channel history with the last returned `nextCursor` until `hasMore` is false.
- The performance command must be run against the intended deployment with the test environment details recorded alongside its JSON output.


# Requirement Traceability Matrix Update — NFR-02 & NFR-04

This incremental RTM records the implementation and verification added for NFR-02 and NFR-04 (Sprint 1 non-functional requirements).

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| SRS §6.3 / NFR-02 | Validate authentication, authorization, rate limiting, and sensitive data protections. | Bcrypt hashing, Express rate-limiter, Zod input validation, sanitization in `errorHandler.js`. | `security.validation.test.js`, `security_validation_report.md`, `SEC-01` through `SEC-08`. | Verified 100% compliance: salted bcrypt hash storage, 401 on missing/invalid JWT, 429 on abuse, and exclusion of secrets from errors/responses. |
| SRS §6.4 / NFR-04 | Verify maintainability, testability, and portability across environments. | Decoupled 4-tier architecture, dependency injection, in-memory `pg-mem` test fixtures, `.env.example`. | `maintainability_portability_report.md`, Jest unit/integration suites, ESLint. | Verified modular architecture, 100% automated test reproducibility, and clean lint execution without environmental dependencies. |
