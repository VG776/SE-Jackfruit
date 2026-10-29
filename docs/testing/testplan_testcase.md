
# NexusChat — Test Plan and Test Case Specification

---

## Document Control

| Item | Description |
|---|---|
| Document purpose | Define the testing approach, test environment, test cases, security validation and traceability for NexusChat. |
| Project type | Browser-based community and real-time messaging application |
| Frontend | React |
| Backend | Node.js LTS |
| Database | PostgreSQL |
| Real-time communication | WebSockets |
| Deployment | Docker, subject to the project configuration |
| Version control | Git and GitHub |
| Related documents | Software Requirements Specification (SRS), Architecture and Design Specification, Requirement Traceability Matrix (RTM), Field Layouts |
| Document status | Planned test cases; execution results will be added after testing |

## 1. Introduction

### 1.1 Purpose

This document describes how the team will test NexusChat and verify that it behaves according to the Software Requirements Specification (SRS). It provides a common plan for checking the application's main features, handling invalid input, enforcing permissions, protecting user data and meeting the agreed performance targets.

The document also defines how test results and defects should be recorded. It is intended to be used throughout development rather than only at the end of the project.

### 1.2 Scope

Testing covers the approved NexusChat MVP, including:

- User registration, login, logout and profile management.
- Community creation and membership management.
- Text channel creation and administration.
- Real-time channel messaging and one-to-one direct messaging.
- Message editing, deletion and reactions.
- Presence and typing indicators.
- Message search, unread counts and notifications.
- Moderation and audit records.
- Input validation, authentication, authorization and session handling.
- Performance, reliability, usability and deployment checks.

Voice and video calling, screen sharing, native mobile applications and end-to-end encryption are not included unless they are formally added to the approved project scope.

### 1.3 References

The following documents should be kept aligned with this Test Plan:

1. NexusChat Software Requirements Specification.
2. NexusChat Architecture and Design Specification.
3. NexusChat Requirement Traceability Matrix.
4. NexusChat Field Layouts and agreed validation rules.
5. Course instructions for the IEEE-style Test Plan and test-case deliverables.
6. The project repository's setup instructions and automated testing configuration.

### 1.4 Definitions and Abbreviations

| Term | Meaning |
|---|---|
| SRS | Software Requirements Specification |
| RTM | Requirement Traceability Matrix |
| API | Application Programming Interface |
| UI | User Interface |
| WebSocket | A communication protocol used for two-way, real-time communication between a client and server |
| p95 | The 95th-percentile measurement; 95% of recorded observations are at or below this value |
| CI | Continuous Integration |
| Test case | A documented scenario with preconditions, steps and expected results |
| Regression testing | Retesting existing functionality after a change or bug fix |
| MVP | Minimum Viable Product; the agreed first version of NexusChat |

## 2. Test Approach

### 2.1 Test Objectives

The main objectives of testing are to:

- Verify that the implemented features satisfy their corresponding SRS requirements.
- Confirm that valid user actions work as expected.
- Check that invalid input and unauthorized requests are handled safely.
- Ensure that private messages and community data are available only to authorized users.
- Verify that messages are saved and delivered correctly.
- Measure performance against the targets specified in the SRS.
- Identify defects early and retest them after fixes.
- Maintain traceability between requirements, test cases and results.

### 2.2 Test Levels

| Test Level | Description | Example |
|---|---|---|
| Unit testing | Tests individual functions or modules independently. | Checking input validation or a permission-checking function. |
| Integration testing | Tests whether connected components work together. | Verifying that a message is stored in PostgreSQL and delivered through WebSockets. |
| System testing | Tests complete user flows through the integrated application. | Registering, logging in, opening a community and sending a message. |
| Security validation | Checks whether authentication, authorization and other security controls work correctly. | Attempting an administrator-only operation as an ordinary member. |
| Performance testing | Measures response time and behavior under an agreed workload. | Measuring message acknowledgement latency with multiple clients. |
| Regression testing | Repeats relevant tests after a code change or defect fix. | Retesting channel permissions after modifying role-handling logic. |

### 2.3 Test Design and Execution

Test cases are derived from the SRS and the approved system design. Both normal and invalid usage scenarios are included.

Positive test cases check whether a feature works with valid input and appropriate permissions. Negative test cases check how the application responds to invalid data, missing authentication, insufficient permissions and unavailable resources.

Unit and integration tests should be run during feature development. System and security tests should be performed against an integrated test build. Performance checks should use a documented dataset and workload.

For every executed test, the tester should record the test case ID, build or commit, date, actual result, status and any related defect.

### 2.4 Test Data

Only synthetic test accounts and sample messages should be used. Real passwords, private conversations and personal information must not be used as test data.

The test setup should include:

- A guest who is not logged in.
- Two ordinary users who can access the same community.
- A community owner or administrator.
- A moderator, if the implementation supports a separate moderator role.
- A user who is not a member of the community being tested.
- Sample channel messages and direct messages.
- Valid, invalid, duplicate and missing field values.

Registration tests should use unique test email addresses unless a test specifically checks duplicate registration. Test data should be reset or clearly labelled between runs so that the results remain repeatable.

### 2.5 Entry and Exit Criteria

**Entry criteria**

Testing can begin when:

- A testable application build is available.
- Required dependencies and database migrations have been applied.
- The relevant features and SRS requirements are identified.
- Test accounts and required sample data are ready.
- The test environment is configured and accessible.

**Exit criteria**

A test cycle is ready for review when:

- Planned high-priority cases have been executed or have a documented reason for being blocked.
- Actual results and test statuses have been recorded.
- Failures have been reported and linked to defects.
- Fixed failures have been retested.
- Critical security findings have been resolved or have a formally approved exception.
- Performance results include the workload and environment used.
- The RTM has been updated to reflect the current test coverage.

A test cycle should not be described as successful merely because test cases have been written. The results must be based on actual execution.

### 2.6 Defect Reporting

When the actual result differs from the expected result, the tester should create a defect record.

Each defect should include:

- Defect ID and short title.
- Related test case and SRS requirement.
- Steps to reproduce the issue.
- Expected and actual results.
- Environment and build or commit.
- Severity and evidence, where available.
- Current status and retest result.

After a fix is merged, the failed case should be rerun. Related regression tests should also be performed when the change could affect other features.

## 3. Test Environment and Resources

### 3.1 Hardware and Software Environment

| Component | Planned Environment |
|---|---|
| Client device | Desktop or laptop used by the project team |
| Browser | A current browser supported by the team; record its name and version during testing |
| Frontend | React application |
| Backend | Node.js LTS application |
| Database | PostgreSQL test database |
| Real-time layer | WebSocket connection and event handlers |
| Deployment | Docker or Docker Compose, if configured in the repository |
| Version control | Git and GitHub |
| API testing | Postman or Bruno, depending on the tool selected by the team |
| Automated testing | The JavaScript test framework configured in the repository, such as Jest and Supertest |
| Code quality | SonarQube or the approved equivalent, if configured |
| CI | The pipeline actually configured in the repository |

The team must record the actual versions and configuration used during testing. Tools listed as planned resources should not be reported as used until they have been configured and run.

### 3.2 Test Environment Setup

Before testing, the team should:

1. Obtain the intended project branch or commit.
2. Install the documented dependencies.
3. Apply the database migrations to the test database.
4. Configure required environment variables without committing secrets.
5. Start the frontend, backend and database services.
6. Confirm that the application can connect to PostgreSQL.
7. Verify that the API and WebSocket endpoints are reachable.
8. Create the required synthetic test accounts and sample data.
9. Record the commit, browser version and environment details for the test run.

### 3.3 Roles and Responsibilities

| Role | Responsibility |
|---|---|
| All team members | Execute tests for their assigned features and record the results. |
| Feature owner | Investigate and fix defects in the assigned module. |
| Reviewer | Review code and tests associated with a change. |
| Test coordinator | Maintain the execution summary and coordinate updates to the RTM. |
| Entire team | Review unresolved defects and confirm whether the project is ready for final demonstration. |

The team should agree on the test coordinator before the final test cycle.

### 3.4 Assumptions and Constraints

The approved SRS is the source of truth for expected application behavior. If a test case conflicts with an approved requirement, the discrepancy must be discussed and resolved before the case is used for acceptance.

Performance results depend on the hardware, dataset, number of concurrent clients and network conditions. These details must be recorded alongside measurements.

Some test cases depend on features being implemented. If a feature is not available, its case should be marked **Blocked** or **Not Run**, with a reason, instead of being marked Pass.

## 4. Test Schedule and Deliverables

### 4.1 Planned Testing Activities

| Stage | Activities | Deliverable |
|---|---|---|
| During development | Write unit tests for validation, services and permissions. | Unit test results and reviewed changes. |
| Integration testing | Check API, database and WebSocket interactions. | Integration results and defect records. |
| System testing | Execute the main user journeys. | Completed functional test records. |
| Security validation | Run the Section 5.1 security checks in the controlled test environment. | Security results and records of findings. |
| Performance testing | Measure the agreed response-time targets. | Performance measurements and test conditions. |
| Regression testing | Retest fixed defects and affected functionality. | Retest results and updated defect records. |
| Final review | Review coverage, open defects and the RTM. | Final test summary and updated RTM. |

### 4.2 Schedule

The exact execution dates should follow the team's agreed sprint schedule. Test cases should be run as the corresponding features become available rather than waiting until the entire application is complete.

| Activity | Planned Timing | Status |
|---|---|---|
| Unit testing | During feature development | To be updated |
| Integration testing | When related modules are connected | To be updated |
| Functional system testing | After an integrated build is available | To be updated |
| Security validation | During integration and before final acceptance | To be updated |
| Performance testing | When the messaging and search flows are testable | To be updated |
| Final regression and review | Before final submission or demonstration | To be updated |

### 4.3 Test Deliverables

The expected deliverables are:

- This Test Plan and Test Case Specification.
- Automated unit and integration test results, where configured.
- Completed manual test execution records.
- Security validation results.
- Performance measurements with workload details.
- Defect records and retest results.
- An updated Requirement Traceability Matrix.
- A final test summary identifying passed, failed, blocked and unexecuted cases.

## 5. Test Cases

This section contains the planned test cases for NexusChat. The cases cover functional behavior, security controls and non-functional requirements. The expected results are based on the current SRS draft and must be checked against the final approved version.

All test cases initially have the status **Not Run**. The status should be updated only after the case has been executed.

### 5.1 Security Validation

Security testing must be performed only against the team's own development or test deployment, using test accounts and data. Do not run intrusive tests against third-party systems.

| Test Case ID | Objective | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|
| SEC-01 | **Access a protected API without authentication.** Check that protected resources cannot be accessed by a guest. | The application and a protected API endpoint are available. | 1. Do not log in. 2. Send a request to a protected endpoint. 3. Inspect the response. | The request is rejected using the application's documented authentication response. Protected data is not returned. | Pass |
| SEC-02 | **Attempt an administrator action as an ordinary member.** Confirm that the server enforces role permissions. | A community exists with an administrator and an ordinary member. | 1. Log in as the ordinary member. 2. Attempt an administrator-only channel operation through the API. 3. Check the channel state. | The operation is rejected, and the channel remains unchanged. | Not Run |
| SEC-03 | **Attempt to access a private community as a non-member.** Ensure that non-members cannot retrieve protected messages. | A private community or restricted channel contains test messages. | 1. Log in as a user who is not a member. 2. Attempt to retrieve channel history. 3. If applicable, attempt to join its WebSocket room. | Access is denied. Message contents and private events are not disclosed. | Not Run |
| SEC-04 | **Check password storage.** Verify that passwords are not stored in plaintext. | A test account can be registered, and the team can inspect its test database. | 1. Register a test account. 2. Inspect the stored user record. 3. Check whether the password field contains the plaintext password. | The password is stored using an appropriate password-hashing method. The password or its hash is not exposed in ordinary API responses. | Pass |
| SEC-05 | **Check safe rendering of user input.** Check that user-provided text cannot execute as a script. | An input field that displays saved text is available. | 1. Enter a harmless script-like test string into a profile or message field. 2. Save the input. 3. Open the relevant view and inspect the rendered content. | The input is handled safely and displayed as text where appropriate. No script executes. | Not Run |
| SEC-06 | **Check resistance to injection.** Verify that special input does not bypass authentication or alter query behavior. | A test login or search endpoint is available. | 1. Submit a controlled SQL-like test string in the relevant field. 2. Inspect the response and database state. 3. Confirm that no unauthorized access or unexpected database modification occurred. | The input is treated as data and does not bypass access controls or change the intended query structure. | Not Run |
| SEC-07 | **Check abuse controls on sensitive operations.** Verify that repeated sensitive requests are handled according to the configured controls. | The test environment has the agreed rate-limiting or equivalent protection configured. | 1. Send a controlled series of failed login attempts. 2. Observe the responses. 3. Check whether the configured limit or temporary rejection is applied. | The configured protection behaves as intended without exposing sensitive information. | Pass |
| SEC-08 | **Attempt an unauthorized WebSocket subscription.** Ensure that unauthorized clients cannot subscribe to protected events. | A protected channel and WebSocket endpoint are available. | 1. Connect without valid authentication, or use an account without channel permission. 2. Attempt to subscribe to the protected channel. 3. Observe the response and received events. | The connection or subscription is rejected as appropriate. Protected events are not delivered. | Not Run |
| SEC-09 | **Reuse a session after logout.** Verify that logout invalidates the relevant session or token according to the chosen authentication design. | A test user is logged in. | 1. Log out. 2. Attempt to use the previous session or token for a protected operation. 3. Observe the response. | The invalidated session cannot perform protected actions. | Pass |
| SEC-10 | **Check logs for sensitive information.** Ensure that logs do not expose secrets. | Test logging is enabled. | 1. Perform a test login and trigger a controlled validation error. 2. Inspect the resulting application logs. 3. Check for passwords, authentication tokens and other secrets. | Logs contain useful diagnostic information without exposing passwords, tokens or secrets. | Not Run |
| SEC-11 | **Attempt unauthorized message moderation.** Check that an ordinary user cannot perform a restricted moderation action. | A test message exists in a community with role-based permissions. | 1. Log in as an ordinary member. 2. Submit a moderation request against another user's message. 3. Check the message and relevant audit records. | The request is rejected. The message is not removed by the unauthorized action, and no false successful moderation event is recorded. | Not Run |
| SEC-12 | **Verify the moderation audit record.** Confirm that a permitted moderation action is recorded. | An authorized moderator and a test message are available. | 1. Perform a permitted moderation action. 2. Inspect the audit record. 3. Check the recorded actor, action, affected resource and timestamp. | The required details are recorded, and the audit record does not contain passwords or authentication tokens. | Not Run |

### 5.2 Functional Test Cases

| Test Case ID | Requirement | Objective | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|---|
| TC-F01 | FR-AUTH-01 | **Register a new user.** Verify that a user can create an account using valid details. | The user is not already registered. | 1. Open registration. 2. Enter valid, unique details. 3. Submit the form. | The account is created successfully, and the application displays the appropriate confirmation. | Pass |
| TC-F02 | FR-AUTH-01 | **Reject duplicate registration.** Check that duplicate account details are handled correctly. | The test email or username is already registered. | 1. Open registration. 2. Submit the form using the duplicate value. 3. Observe the response. | Registration is rejected with a clear message. No duplicate account is created. | Pass |
| TC-F03 | FR-AUTH-02 | **Reject invalid login credentials.** Verify that an incorrect password does not grant access. | A test account exists. | 1. Open the login page. 2. Enter the account identifier and an incorrect password. 3. Submit the form. | Authentication fails, no valid session is created, and the response does not reveal whether the account exists. | Pass |
| TC-F04 | FR-AUTH-03 | **Log out of an account.** Verify that the user cannot continue using an invalidated session. | A test user is logged in. | 1. Log out. 2. Attempt to access a protected page or perform a protected action. | The user is logged out and cannot perform protected actions using the invalidated session. | Pass |
| TC-F05 | FR-AUTH-04 | **Update a user profile.** Verify that permitted profile changes are saved. | A test user is authenticated. | 1. Open the profile settings. 2. Update a permitted profile field. 3. Save and reopen the profile. | The valid change is saved and appears when the profile is viewed again. | Not Run |
| TC-F06 | FR-COM-01 | **Create a community.** Verify that an authenticated user can create a community. | The user is authenticated. | 1. Open the community creation option. 2. Enter a valid community name and required details. 3. Submit the request. | The community is created and the creator receives the appropriate owner permissions. | Not Run |
| TC-F07 | FR-COM-01 | **Reject a duplicate community name for the same owner.** Check that the agreed name-uniqueness rule is enforced. | The owner already has a community with the selected name. | 1. Attempt to create another community using the same name. 2. Inspect the response and community list. | The request is rejected according to the agreed uniqueness rule, and no duplicate community is created. | Not Run |
| TC-F08 | FR-COM-02 | **Manage community membership.** Verify that an administrator can perform permitted invitation or membership operations. | A community administrator and an eligible invitee are available. | 1. Log in as the administrator. 2. Invite a user or update membership. 3. Inspect the invitation or membership state. | The permitted operation succeeds and the membership or invitation state is updated. | Not Run |
| TC-F09 | FR-COM-02 | **Reject unauthorized membership changes.** Check that an ordinary member cannot perform administrator-only membership operations. | An ordinary member belongs to a test community. | 1. Log in as the ordinary member. 2. Attempt an administrator-only invitation or membership change. 3. Inspect the community state. | The request is rejected, and the membership state remains unchanged. | Not Run |
| TC-F10 | FR-COM-03 | **Create, rename or delete a text channel.** Verify that authorized channel administration works. | An authorized community administrator is available. | 1. Create a test channel. 2. Rename it. 3. Test deletion using a designated test channel. | Permitted operations succeed, and the channel list reflects the changes. | Not Run |
| TC-F11 | FR-COM-04 | **Validate channel permissions.** Check that the server rejects operations that the user is not permitted to perform. | A community contains an administrator and an ordinary member. | 1. Log in as the ordinary member. 2. Attempt a protected channel operation. 3. Check the channel state. | The server rejects the operation, and the channel remains unchanged. | Not Run |
| TC-F12 | FR-MSG-01 | **Send a channel message.** Verify that a valid message can be submitted by an authorized user. | The user belongs to the target channel. | 1. Open the channel. 2. Enter a valid message. 3. Send it. | The message is accepted and saved. | Not Run |
| TC-F13 | FR-MSG-01 | **Reject an empty or invalid message.** Verify that message validation rules are applied. | The user can access a channel. | 1. Submit an empty message or a value that violates the agreed message-validation rules. 2. Inspect the response and message history. | The invalid message is rejected, and no invalid message record is created. | Not Run |
| TC-F14 | FR-MSG-02 | **Deliver a channel message in real time.** Verify that authorized connected users receive new messages without manually refreshing. | Two authorized clients are connected to the same channel. | 1. Send a message from the first client. 2. Observe the second client's channel. 3. Check that the message is available in history. | The accepted message is saved and delivered to authorized connected clients without requiring a manual refresh. | Not Run |
| TC-F15 | FR-MSG-02 | **Retrieve messages after reconnection.** Verify that saved message history remains available after a temporary disconnect. | The channel contains previously saved messages. | 1. Disconnect the client. 2. Reconnect. 3. Reopen the channel and retrieve its history. | The client can retrieve saved messages, subject to its permissions. | Not Run |
| TC-F16 | FR-MSG-03 | **Exchange one-to-one direct messages.** Verify that two users can exchange private messages. | Two eligible user accounts exist. | 1. Send a direct message from the first account. 2. Open the conversation from the second account. 3. Check the message content. | The recipient can access the message, and it is not disclosed to unrelated users. | Not Run |
| TC-F17 | FR-MSG-03 | **Prevent access to another user's direct messages.** Verify that direct conversations are restricted to their participants. | A direct conversation exists between two users. | 1. Log in as a third user. 2. Attempt to retrieve the conversation. 3. Inspect the response. | Access is denied, and no private message content is returned. | Not Run |
| TC-F18 | FR-MSG-04 | **Edit or delete a message.** Check that message changes follow the application's permission rules. | A test message exists. | 1. Edit or delete a message using the author account. 2. Verify the change. 3. Attempt an unauthorized edit or deletion using another ordinary account. | Permitted changes succeed, and unauthorized changes are rejected. | Not Run |
| TC-F19 | FR-MSG-05 | **Update presence and typing indicators.** Verify that appropriate real-time status indicators are shown. | Authorized users are connected to the relevant conversation. | 1. Start typing. 2. Stop typing. 3. Disconnect or reconnect one client. 4. Observe the indicators from the other client. | Appropriate typing and presence events are shown to authorized users according to the implemented rules. | Not Run |
| TC-F20 | FR-UX-01 | **Add and remove a reaction.** Verify that a user can react to a message according to the supported rules. | An accessible message exists. | 1. Add a supported reaction. 2. Check the reaction count or display. 3. Remove the reaction. | The reaction is updated correctly and is not duplicated for the same user unless the agreed rules allow it. | Not Run |
| TC-F21 | FR-UX-02 | **Search for an accessible message.** Verify that the search feature returns relevant messages. | The test dataset contains a known message. | 1. Open search. 2. Enter a distinctive word or phrase from the message. 3. Review the returned results. | Relevant results are returned with enough context to identify the message. | Not Run |
| TC-F22 | FR-UX-02 | **Prevent search results from revealing private messages.** Ensure that search respects the user's access permissions. | A private conversation or restricted channel contains a known matching message. | 1. Log in as a user who lacks access. 2. Search for the matching phrase. 3. Inspect the returned results and metadata. | The private message and its protected metadata are not returned. | Not Run |
| TC-F23 | FR-UX-03 | **Update unread counts and notifications.** Verify that unread indicators reflect message activity. | Two users can access the same conversation. | 1. Send a message while the recipient is not viewing the conversation. 2. Check the recipient's unread count or notification. 3. Open the conversation. | Unread counts or notifications update according to the agreed rules, and the unread state is updated when the conversation is read. | Not Run |
| TC-F24 | FR-MOD-01 | **Perform an authorized moderation action.** Verify that a moderator can perform permitted moderation tasks. | A moderator or administrator has permission to moderate a test message. | 1. Log in using the authorized account. 2. Remove the test message. 3. Inspect the result and audit record if applicable. | The action succeeds and the required audit event is recorded. | Not Run |
| TC-F25 | FR-MOD-02 | **Restrict or remove a member.** Verify that permitted member-moderation actions update access correctly. | An authorized moderator or administrator and a test member are available. | 1. Perform a permitted membership restriction or removal. 2. Inspect the membership state. 3. Check whether access changes as expected. | The member's state changes as specified, and access is updated according to the agreed rules. | Not Run |
| TC-F26 | FR-MOD-03 | **Record a security-relevant audit event.** Verify that required actions produce audit records. | Audit logging is enabled and an approved test action is available. | 1. Perform a security-relevant moderation action. 2. Inspect the audit record. 3. Verify the actor, action, affected resource and timestamp. | The record contains the required details without exposing secrets. | Not Run |

### 5.3 Non-Functional Test Cases

| Test Case ID | Requirement | Objective | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|---|
| TC-NF01 | SRS Section 6.1 — Performance | **Measure WebSocket message acknowledgement time.** Check the message acknowledgement latency target under the defined test load. | The integrated messaging flow works, and the test workload has been agreed. | 1. Record the test machine, dataset, network conditions and number of concurrent clients. 2. Send a series of messages under the defined load. 3. Record acknowledgement times and calculate p95. | The measured p95 acknowledgement time is no greater than 500 ms under the documented test conditions. | Not Run |
| TC-NF02 | SRS Section 6.1 — Performance | **Measure core UI/API response time.** Check the response time of common application operations. | Representative test data and a working integrated build are available. | 1. Select core operations, such as loading community information and opening a channel. 2. Measure their response times. 3. Repeat under normal test conditions. | The selected core operations complete within 2 seconds under normal test conditions. | Not Run |
| TC-NF03 | SRS Section 6.1 — Performance | **Measure search response time.** Check whether search meets its defined performance target. | The agreed evaluation dataset and representative queries are ready. | 1. Run the query set repeatedly. 2. Record each response time. 3. Review the results and measurements. | Search returns results within 2 seconds for the defined evaluation dataset and test conditions. | Not Run |
| TC-NF04 | SRS Section 6.4 — Reliability | **Check reliability during reconnection.** Verify that temporary connection loss does not corrupt saved messages. | A test user can access a channel containing saved messages. | 1. Disconnect the client temporarily. 2. Reconnect. 3. Retrieve the channel history. 4. Check for missing or duplicated messages. | Saved messages remain available to authorized users and are not silently corrupted or duplicated during recovery. | Not Run |
| TC-NF05 | Reliability and real-time messaging | **Check concurrent message submission.** Verify that simultaneous activity does not cause message loss or unintended duplication. | Two authorized clients are connected to the same channel. | 1. Send different messages from both clients at nearly the same time. 2. Inspect the saved message history. 3. Compare the submitted and stored messages. | Both messages are handled correctly without silent loss or unintended duplication. | Not Run |
| TC-NF06 | Security and software quality | **Check safe error handling.** Ensure that invalid requests do not expose internal details. | The test environment and relevant endpoints are available. | 1. Submit invalid input or a malformed request to a test endpoint. 2. Inspect the response. 3. Check whether sensitive internal details are exposed. | The application returns an appropriate error without exposing stack traces, secrets or sensitive internal configuration to the user. | Not Run |
| TC-NF07 | SRS Section 6.4 — Usability | **Evaluate common user tasks.** Check whether users can complete common tasks with understandable navigation and feedback. | A test account and working application are available. | 1. Ask a team member to log in. 2. Open a community and enter a channel. 3. Send a message. 4. Record confusion or navigation issues. | The user can complete the tasks with understandable navigation and feedback. Any usability issues are recorded for improvement. | Not Run |
| TC-NF08 | SRS Section 6.4 — Portability | **Check deployment portability.** Verify that the application can be started using the documented setup. | Required dependencies, environment variables and Docker configuration, if applicable, are available. | 1. Follow the repository's setup instructions. 2. Start the application using the documented process. 3. Verify communication between the frontend, backend and database. | The application starts using the documented process, and the main services communicate successfully. | Not Run |
| TC-NF09 | SRS Section 6.4 — Maintainability and Testability | **Check the automated test and quality workflow.** Verify that the configured automated checks can run and report results. | The repository has a configured automated test or CI workflow. | 1. Run the workflow using the project's documented process. 2. Review the output. 3. Confirm that failed checks are visible to the team. | The configured checks execute and report their actual results. Failed checks are visible to the team. | Not Run |

## 6. Traceability to the SRS

Traceability ensures that the important SRS requirements have corresponding test cases. The following is an initial mapping based on the current SRS draft. The final mapping must be checked against the approved SRS and the team's Requirement Traceability Matrix.

| SRS Requirement | Requirement Area | Related Test Cases |
|---|---|---|
| FR-AUTH-01 | Registration | TC-F01, TC-F02, SEC-04 |
| FR-AUTH-02 | Login and authentication | TC-F03, SEC-01 |
| FR-AUTH-03 | Logout and session invalidation | TC-F04, SEC-09 |
| FR-AUTH-04 | Profile management | TC-F05, SEC-05 |
| FR-COM-01 | Community creation and name validation | TC-F06, TC-F07 |
| FR-COM-02 | Invitations and membership | TC-F08, TC-F09, SEC-03 |
| FR-COM-03 | Text channel management | TC-F10, SEC-02 |
| FR-COM-04 | Server-side permission checks | TC-F11, SEC-02, SEC-03, SEC-08 |
| FR-MSG-01 | Channel message validation and sending | TC-F12, TC-F13 |
| FR-MSG-02 | Message persistence and real-time delivery | TC-F14, TC-F15, TC-NF01, TC-NF04, TC-NF05 |
| FR-MSG-03 | One-to-one direct messaging | TC-F16, TC-F17, SEC-03 |
| FR-MSG-04 | Message editing and deletion | TC-F18, SEC-11 |
| FR-MSG-05 | Presence and typing indicators | TC-F19 |
| FR-UX-01 | Reactions | TC-F20 |
| FR-UX-02 | Message search and access restrictions | TC-F21, TC-F22, TC-NF03 |
| FR-UX-03 | Unread counts and notifications | TC-F23 |
| FR-MOD-01 | Message moderation | TC-F24, SEC-11 |
| FR-MOD-02 | Member moderation | TC-F25, SEC-02 |
| FR-MOD-03 | Audit events | TC-F26, SEC-10, SEC-12 |
| NFR-Performance | Performance targets | TC-NF01, TC-NF02, TC-NF03 |
| NFR-Security | Authentication, authorization and secure handling | SEC-01 to SEC-12, TC-NF06 |
| NFR-Reliability | Reconnection and message handling | TC-NF04, TC-NF05 |
| NFR-Usability | Common task completion | TC-NF07 |
| NFR-Portability | Documented setup and deployment | TC-NF08 |
| NFR-Maintainability/Testability | Automated testing and quality checks | TC-NF09 |

**Traceability note:** The NFR labels in this table are grouping labels, not substitutes for requirement IDs in the SRS. If the approved SRS or RTM uses different NFR identifiers, update this table to match those identifiers exactly. Every requirement should be reviewed for coverage, and any requirement without a test case should be identified before final submission.

