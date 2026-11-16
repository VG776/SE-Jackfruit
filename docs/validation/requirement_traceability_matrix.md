# Requirement Traceability Matrix Update — US-14

This incremental RTM records the implementation and verification added for US-14 (Search authorized messages).

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-UX-02 | Search messages only within communities and conversations the requesting user is authorized to access, with no leakage of inaccessible text or metadata. | `GET /api/search`, `SearchService`, `SearchRepository`, `searchSchemas.js`. | `search.integration.test.js`, `searchService.test.js`, `TC-F21`, `TC-F22`. | Implemented for accessible channel messages. Results include snippet with highlighted matching terms (`<b>...</b>`), rank, sender, channel, and community metadata. Soft-deleted messages and messages from communities the user has not joined are strictly excluded. |
| FR-COM-04 | Enforce server-side permissions for search queries. | `SearchRepository.searchMessages` SQL join with `communities` and `community_members`. | `search.integration.test.js`, `TC-F22`. | Unauthenticated requests are rejected with 401. Users without membership in the message's community receive zero results (totalMatches: 0) and cannot observe private conversation contents or metadata. |
| SRS §6.1 | Search response time target of no more than 2 seconds under the defined evaluation dataset. | In-memory and PostgreSQL indexing, pagination (`page`, `limit`), `backend/scripts/benchmark-search.js`. | `search.integration.test.js` (TC-NF03), `npm run benchmark:search`. | Verified: Automated test suite validates sub-second response times ($\le 2$ seconds SLA) over the documented evaluation dataset. |

## US-14 Enforced Rules

- **Query Validation:** `GET /api/search` requires a non-empty `q` string parameter (1 to 200 characters). Supports optional `channelId` (UUID), `communityId` (UUID), `page` (default: 1), and `limit` (default: 20, max: 100).
- **Authorization Scoping:** Search results are strictly limited to channels within communities owned by the caller or where the caller is an active member.
- **Content Highlighting:** Matched search terms are highlighted in the generated snippet using `<b>` tags while preserving original text case.
- **Exclusion of Soft-Deleted Records:** Messages with `deleted_at IS NOT NULL` are excluded from search results unconditionally.

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

# Requirement Traceability Matrix Update — US-10

This incremental RTM records the implementation and verification added for US-10 (Send and receive direct messages).

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-MSG-03 | One-to-one direct messages accessible only to participants. Self-messaging rejected. | `POST /api/direct-messages/conversations`, `POST /api/direct-messages/conversations/:conversationId/messages`, `GET /api/direct-messages/conversations/:conversationId/messages`, `DirectMessageService`, `DirectMessageRepository`, `directMessageSchemas.js`, migration `007_create_direct_messages.sql`. | `directMessageService.test.js`, `directMessage.integration.test.js`. | Senders and recipients must be distinct registered users. Direct conversations enforce canonical user ordering `(user_a_id < user_b_id)` with unique constraint. Messages are stored chronologically. |
| FR-COM-04 | Enforce server-side permissions on direct conversations. | `DirectMessageService.assertParticipant` validates caller is either `user_a_id` or `user_b_id`. | `directMessage.integration.test.js`, `directMessageService.test.js`. | Non-participants attempting to read or send messages receive 403 `INSUFFICIENT_PERMISSIONS`. Unauthenticated requests return 401 `AUTHENTICATION_REQUIRED`. Missing conversations return 404 `CONVERSATION_NOT_FOUND`. |



# Requirement Traceability Matrix Update — US-13

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-UX-01 | Allow a member to add or remove a reaction on a message they can access; reject changes for inaccessible messages or invalid reaction values. | `POST /api/messages/:messageId/reactions`, `DELETE /api/messages/:messageId/reactions/:emoji`, `GET /api/messages/:messageId/reactions`; `ReactionService`, `ReactionRepository`, `reactionSchemas.js`; migration `008_create_message_reactions.sql`. | `reaction.integration.test.js`, `reactionService.test.js`; `TC-F20`. | Implemented for channel messages. Reaction values are limited to a fixed supported set. A user's identical reaction is stored once (primary key `message_id, user_id, emoji`); repeating the add is an idempotent `200` with `added: false`. Removing a reaction the caller does not hold returns `404`. |
| FR-COM-04 | Enforce server-side permissions on reactions. | `ReactionService.assertCanAccessMessage` resolves the message's channel and calls `ChannelService.assertCanAccessChannel`. | Non-member, unauthenticated, missing and deleted-message cases in `reaction.integration.test.js`; `TC-F11`, `SEC-03`. | Non-members receive the same generic `MESSAGE_NOT_FOUND` 404 as a missing or deleted message. Unauthenticated requests receive `401`. |

## US-13 boundary

- Reactions apply to channel messages only; direct-message reactions are not part of this story.
- Reaction counts are returned by the add and list endpoints. Reactions are not yet embedded in message history responses or pushed as WebSocket events, so clients refresh through the list endpoint.


# Requirement Traceability Matrix Update — US-15

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-UX-03 | Persist per-channel read cursors, calculate unread counts from saved messages, and notify authorized connected users about new messages. | Migration `009_create_channel_read_states.sql`; `UnreadService` and `UnreadRepository`; authenticated `GET /api/unread-counts` and `POST /api/channels/:channelId/read`; WebSocket `NEW_MESSAGE_NOTIFICATION` and `UNREAD_COUNT_UPDATED`; frontend channel badges and in-app notice. | `unread.integration.test.js` verifies counts, cursor advancement, own-message exclusion, authentication and membership boundaries. `webSocketGateway.integration.test.js` verifies live notification to an authorized connected member outside the channel. | Implemented for channel messages. Counts are reconstructed from persisted non-deleted messages plus each user's last-read message cursor. Live notifications require an active connection; REST counts recover state after reconnect. No separate notification inbox is stored. |
| FR-COM-04 | Prevent unread counts, read-state updates, and live notifications from disclosing inaccessible channels. | Accessible-channel query scope; `UnreadService` permission check before cursor mutation; gateway rechecks access for each recipient before notification delivery. | Non-member history-state request returns generic 404 and does not write a cursor; WebSocket authorization integration coverage. | Unauthorized users receive no channel count entry and cannot update its read state. |

## US-15 verification boundary

- A read cursor represents the latest saved channel message when the mark-read request runs. Messages authored by the caller are not counted as unread.
- Opening a channel marks it read after history loads while the browser tab is visible. A message arriving in an active visible channel also advances the cursor.
- The notification mechanism is in-app WebSocket delivery. Offline users recover unread counts from the REST endpoint after reconnect; notifications are not retained as a separate inbox.


# Requirement Traceability Matrix Update — US-16

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-MOD-01 | A moderator or admin can remove a message only in a community where they hold permission; unauthorized attempts are rejected and the action is audited. | `POST /api/channels/:channelId/messages/:messageId/moderation` (`{ action: "REMOVE", reason? }`); `ModerationService`, `ModerationRepository`, `moderationSchemas.js`. The existing `DELETE .../messages/:messageId` now routes a moderator removing another user's message through the same audited path. | `moderation.integration.test.js`, `moderationRepository.test.js`; `TC-F24`, `SEC-11`. | Implemented. Members get `403`, non-members and unknown or already-removed messages get `404`, unauthenticated requests get `401`. Removal is a soft delete, so removed messages leave channel history. |
| FR-MOD-03 | Record actor, action, affected resource and timestamp for moderation events, without secrets. | Migration `010_create_audit_logs.sql`; the message removal and the `audit_logs` insert run in one transaction. | `moderation.integration.test.js` (audit row contents, no secrets); `moderationRepository.test.js` (commit and rollback); `TC-F26`. | Audit table and write path exist for message removal. Audit retrieval (`GET /api/communities/:id/audit-logs`) and other event types belong to US-18. |

## US-16 boundary

- Only message removal is covered; member moderation (kick or ban) is US-17.
- The rollback guarantee is verified against a mocked client, because `pg-mem` does not roll back transactions.


# Requirement Traceability Matrix Update — US-17

| Requirement ID | Requirement | Implementation | Verification | Status / boundary |
|---|---|---|---|---|
| FR-MOD-02 | Permit KICK or BAN only when the actor's role allows it; validate target and action; persist and enforce resulting membership or ban state. | `POST /api/communities/:communityId/members/:userId/moderation`; `MembershipService.moderateMember`; `MembershipRepository.banMember`; migration `010_create_community_bans.sql`; invite join checks persisted bans. Existing channel access and WebSocket fan-out checks enforce removed membership. | `membership.integration.test.js` covers moderator KICK, admin BAN, ban persistence and blocked rejoin, ordinary-member denial, moderator role hierarchy, owner protection, missing target and invalid action. | Implemented. KICK removes membership; BAN atomically removes membership and stores the reason. The existing admin-only DELETE endpoint remains available for compatibility. |
| FR-COM-04 | Enforce current server-side membership and role permissions for moderation and protected operations. | Authenticated route validation plus live membership checks in `MembershipService`, `ChannelService`, and WebSocket delivery. | `membership.integration.test.js`; existing message and WebSocket authorization suites. | Unauthorized actions leave membership unchanged; banned users cannot rejoin through community invites. |

## US-17 verification boundary

- Moderators may act on ordinary members. Admins may act on ordinary members and moderators. Only the owner may act on another admin; no actor may remove or ban the owner.
- BAN is community-specific and blocks rejoining through an invite. KICK removes current membership but does not prevent a later invite-based join.
- This change does not add a separate audit-log viewer or an unban endpoint; those remain outside this story's acceptance criteria.
