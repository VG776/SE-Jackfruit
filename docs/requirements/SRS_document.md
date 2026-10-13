# SOFTWARE REQUIREMENTS SPECIFICATION

**NexusChat — Real-Time Community and Collaboration Platform**

Version 1.0

PES UNIVERSITY, BENGALURU

Department of Computer Science and Engineering

UE24CS341A — Software Engineering

Academic Year 2026

---

# Revision History

| **Version** | **Date**   | **Author**   | **Reason for Change**                                                   |
|-------------|------------|--------------|-------------------------------------------------------------------------|
| 1.0         | 2026-09-01 | Project Team | Initial project baseline; review and update as requirements are agreed. |

Document note: This is a working SRS draft. Replace the member placeholders and confirm requirement details with the approved project documents before final submission.

# 1. Introduction

## 1.1 Purpose

This document describes what NexusChat is expected to do and the conditions it must meet. It records the main functional requirements, quality expectations, interfaces, and security rules so that the team can build and test the application against a shared understanding.

## 1.2 Intended Audience and Reading Suggestions

The document is intended for the student development team, testers, project evaluator, project coordinator or product owner, and anyone who may maintain the application later. Readers looking for the product’s purpose should start with Sections 1 and 2. Developers should also use Sections 3 and 5, while testers should refer to the requirements alongside the validation plan and traceability matrix.

## 1.3 Product Scope

NexusChat is a browser-based platform where people can join communities, take part in text channels, and exchange direct messages. The application will support user profiles, online presence, typing indicators, message editing and deletion, reactions, unread counts, notifications, message search, and permission-based moderation. Community and channel actions will be controlled by roles and permissions.

The MVP focuses on text-based communication. Voice and video calls, screen sharing, native mobile applications, and end-to-end encryption are outside the currently approved scope unless the team and evaluator formally agree to change it.

## 1.4 References

- PES University, Department of Computer Science and Engineering, UE24CS341A Software Engineering Project Guidelines, 2026.
- NexusChat project synopsis, approved SRS, architecture and design specification, validation specification, test plan, field layouts, and requirement traceability matrix.

The team should check the project package for the current versions of these references and update this list if the approved document set changes.

# 2. Overall Description

## 2.1 Product Perspective

NexusChat is a web-based chat application that we are developing to make communication between members of a community easier. The idea is similar to applications such as Discord, where users can join communities, talk in different channels and send private messages to each other.

The application will have a frontend where users can interact with the features and a backend that handles requests, user accounts, messages and other operations. We plan to use React for the frontend, Node.js for the backend and PostgreSQL to store the application data.

Normal requests, such as logging in or creating a channel, will be handled through REST APIs. WebSockets will be used for features that need to update without making users refresh the page, such as new messages, typing indicators and online status.

We will use Docker to help run the application in a consistent environment and Jenkins to automate parts of the build and testing process. Since the project is being developed by a team, GitHub will be used to manage the code and review changes before they are merged.

## 2.2 Product Functions

NexusChat will bring the main features needed for communication within an online community into one application. Users will be able to create an account, log in, update their profile and join communities.

Within a community, members will be able to communicate through text channels. They will also be able to send direct messages to other users when they need to have a private conversation. Messages can be edited or deleted where permitted, and users will be able to react to messages.

The application will also show useful information such as whether a user is online, whether someone is typing and whether there are unread messages. A search feature will help users find messages without having to scroll through an entire conversation.

Community owners and moderators will have additional permissions to manage members, control access and handle inappropriate behaviour. Important moderation actions may also be recorded so that they can be reviewed later.

For the first version, we are focusing on text-based communication and community management. Voice and video calls, screen sharing, native mobile applications and end-to-end encryption are not included in the current scope unless the project requirements are changed and approved.

##  2.3 User Classes and Characteristics

| **User Class** | **Typical Needs** | **Expected Access** |
|---|---|---|
| Guest | Explore the application and understand its purpose before creating an account. | Access to registration and login screens. Guests must log in to use features that require an account. |
| Member | Join communities, communicate with other members, and keep track of conversations. | Access to profiles, communities, channels, text messages, direct messages, reactions, message search, and personal notifications. |
| Moderator | Help maintain a community, handle inappropriate content, and respond to rule violations. | Member features, along with moderation actions such as managing reported content or addressing member violations, depending on assigned permissions. |
| Community Admin | Manage a community and organise its structure according to the community's needs. | Permissions to manage community settings, memberships, channels, roles, and member permissions, subject to the application's rules. |
| System Maintainer | Keep the application running, troubleshoot technical issues, and manage deployment and maintenance activities. | Access to operational and deployment tools as required for the project. This role does not automatically provide access to users' private conversations. |

## 2.4 Operating Environment

NexusChat will run in a web browser, so users will not need to install a separate desktop application. It will be developed and tested using commonly used, up-to-date browsers.

The frontend will use React, while Node.js will handle backend operations. PostgreSQL will store the application's data, including user details, communities, channels, and messages. REST APIs will be used for standard client-server communication, and WebSockets will support real-time features.

Docker will be used to simplify the setup and execution of the application across development and testing environments. Jenkins will be used for continuous integration, including automated build and test steps.

The application will require a working network connection to communicate with the backend. Features such as live messaging, typing indicators, and online status will also depend on the WebSocket connection being available.

## 2.5 Design and Implementation Constraints

The development of NexusChat will follow the technology stack selected for the project. The frontend will use React, the backend will use Node.js, and PostgreSQL will be used for data storage. Any change to these technologies should be discussed and agreed upon by the team before implementation.

The application will follow a client-server approach, with the frontend responsible for displaying information and collecting user input, while the backend handles application logic, validation, and database operations.
Since NexusChat supports private messages and community-based communication, access control is an important part of its implementation. Users should not be able to access communities, channels, or conversations for which they do not have permission.

The project will be developed using Git and GitHub for version control and collaboration. Changes will be submitted through pull requests rather than committed directly to the protected main branch. Jenkins will support the automated build and testing process.

The team will follow an iterative development approach, implementing and testing features in manageable stages. The first version will focus on the agreed core features. Additional features outside the approved scope will not be added without discussion and approval.

## 2.6 Assumptions and Dependencies

The development and use of NexusChat depend on a few assumptions about the users, environment, and supporting technologies.
Users are expected to have access to a supported web browser and a reasonably stable internet connection. An internet connection is required to access the application, and real-time features depend on a working connection between the browser and the backend.

The backend and PostgreSQL database must be available for users to log in, retrieve information, and send messages. If the database or backend becomes unavailable, some or all application features may stop working until the issue is resolved.

WebSocket connectivity is required for features such as live messages, typing indicators, and online status. If a WebSocket connection is interrupted, these features may not update immediately.
The project also depends on the selected development tools and services being available and configured correctly. These include Node.js, PostgreSQL, Docker, GitHub, and Jenkins.

The team assumes that configuration details and sensitive values, such as database credentials and authentication secrets, will be managed appropriately rather than exposed in the source code.
Finally, the requirements and supporting documents must remain consistent as development progresses. If the team decides to introduce a major feature or change an existing requirement, the relevant documentation and tests will need to be updated.

# 3. External Interface Requirements

## 3.1 User Interfaces

The interface should make the main chat workflow easy to follow. At minimum, the browser application will include:

- Registration and login screens.
- A community navigation area and channel list.
- A message timeline and message composer.
- A direct-message view.
- A member list showing presence where permitted.
- Community and channel administration controls for authorized users.
- Search and notification views.
- Clear feedback for invalid input, failed requests, permission errors, and connection problems.

The layout should adapt to common desktop and laptop screen sizes. Any responsive behaviour beyond the agreed MVP should be confirmed during design and validation.

## 3.2 Software Interfaces

| **Interface**                | **Purpose**                                                              | **Expected Data / Notes**                                                                                                               |
|------------------------------|--------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| REST API                     | Account, profile, community, channel, search, and moderation operations. | JSON request and response bodies; errors should use a consistent format.                                                                |
| WebSocket API                | Real-time messages, presence, typing, and reaction events.               | Versioned JSON event envelope with event type, timestamp, and payload.                                                                  |
| PostgreSQL                   | Persistent application state.                                            | Users, communities, memberships, channels, messages, roles, reactions, notifications, and audit records as finalized in the data model. |
| Jenkins                      | Continuous integration and delivery workflow.                            | Build, test, and configured analysis or deployment stages.                                                                              |
| SonarQube or equivalent      | Code-quality and static-analysis feedback.                               | Quality and security findings where the selected tool supports them.                                                                    |
| Jest/Supertest or equivalent | Automated testing.                                                       | Unit and integration tests for relevant backend, API, and application flows.                                                            |

## 3.3 Communications Interfaces

The deployed application shall use HTTPS for browser-to-server request/response traffic and WSS for WebSocket traffic. WebSocket messages should follow a documented, versioned JSON event format. The server should validate incoming events and return an understandable error or reject an event when it is malformed or the sender is not authorized.

# 4. Analysis Models

This section describes the main interactions between users and NexusChat. The use-case model helps the team understand which features are available to each type of user and how the application should respond to normal and unauthorized actions.

## 4.1 Actors

The following actors interact with NexusChat:

| Actor | Description |
|---|---|
| Guest | A person who has not logged in and can access the registration and login screens. |
| Member | An authenticated user who can access permitted communities, participate in text conversations, send direct messages, and use other available communication features. |
| Moderator | A user who has permission to perform moderation actions within assigned communities. |
| Community Admin | A user responsible for managing community settings, membership, channels, and permissions within the limits of their role. |
| System Maintainer | A person responsible for application setup, deployment, monitoring, and technical maintenance. This role does not automatically grant access to private conversations. |

## 4.2 Main Use Cases

The main use cases identified for NexusChat are listed below.

| Use Case ID | Use Case | Primary Actor | Description |
|---|---|---|---|
| UC-01 | Register Account | Guest | Creates a new user account using valid registration details. |
| UC-02 | Log In | Guest | Authenticates a registered user using valid credentials. |
| UC-03 | Manage Profile | Member | Allows a user to view and update permitted profile information. |
| UC-04 | Create Community | Member | Allows an authenticated user to create a community with a valid name. |
| UC-05 | Manage Membership | Community Admin | Allows an authorized administrator to invite users and manage membership. |
| UC-06 | Manage Channels | Community Admin | Allows an authorized administrator to create, rename, and delete text channels. |
| UC-07 | Send Channel Message | Member | Allows a member to send a text message to a channel they can access. |
| UC-08 | Exchange Direct Messages | Member | Allows two eligible users to exchange private messages. |
| UC-09 | Edit or Delete Message | Member | Allows an author to edit or delete their own messages, subject to the agreed rules. |
| UC-10 | React to Message | Member | Allows a user to add or remove a reaction on an accessible message. |
| UC-11 | Search Messages | Member | Searches messages within communities and conversations the user is authorized to access. |
| UC-12 | View Notifications and Unread Counts | Member | Displays relevant new-message notifications and unread information. |
| UC-13 | Moderate Community Content | Moderator / Community Admin | Allows an authorized user to perform permitted moderation actions. |
| UC-14 | Record Audit Events | System | Records security-relevant moderation events for later review. |
| UC-15 | Maintain Application | System Maintainer | Supports deployment, troubleshooting, and technical maintenance. |

## 4.3 Use-Case Descriptions

### UC-01: Register Account

**Primary actor:** Guest

**Preconditions:** The guest can access the registration page and has not already registered using the same unique username or email address.

**Main flow:**
1. The guest opens the registration page.
2. The guest enters the required account details.
3. The system validates the submitted values.
4. The system checks that the username and email address are not already registered.
5. The system creates the account and provides confirmation.

**Alternative and error flows:**
- If a required field is missing or invalid, the system displays a validation message.
- If the username or email address is already registered, the system rejects the registration.
- If account creation fails, the system displays an appropriate error without creating an incomplete account.

**Postconditions:** A valid account is created, or the guest receives an error explaining why registration could not be completed.

### UC-02: Log In

**Primary actor:** Guest

**Preconditions:** The user has a registered account.

**Main flow:**
1. The user opens the login page.
2. The user enters their account credentials.
3. The system validates the credentials.
4. The system establishes an authenticated session.
5. The user gains access to the features permitted by their account.

**Alternative and error flows:**
- If the credentials are invalid, the system rejects the login.
- If the request is invalid, the system provides an appropriate error message without exposing sensitive authentication information.

**Postconditions:** The user is authenticated, or access is denied.

### UC-03: Manage Profile

**Primary actor:** Member

**Preconditions:** The user is authenticated.

**Main flow:**
1. The user opens their profile.
2. The system displays the permitted profile information.
3. The user edits the fields they are allowed to change.
4. The system validates the updated values.
5. The system saves the changes and displays the updated profile.

**Alternative and error flows:**
- If an updated value is invalid, the system rejects that change and displays a validation message.
- If saving fails, the system informs the user that the update was not completed.

**Postconditions:** The profile contains the accepted changes, or the existing information remains unchanged.

### UC-04: Create Community

**Primary actor:** Member

**Preconditions:** The user is authenticated.

**Main flow:**
1. The user selects the option to create a community.
2. The user enters a valid community name.
3. The system validates the name and checks the ownership-based uniqueness rule.
4. The system creates the community.
5. The creator receives the appropriate owner permissions.

**Alternative and error flows:**
- If the name is invalid or conflicts with another community owned by the same user, the system rejects the request.
- If the user is not authenticated, the system denies the operation.

**Postconditions:** The community is created with the appropriate ownership information, or no new community is created.

### UC-05: Manage Membership

**Primary actor:** Community Admin

**Preconditions:** The administrator is authenticated and has the required permissions for the community.

**Main flow:**
1. The administrator opens the community membership controls.
2. The administrator selects a permitted invitation or membership operation.
3. The system checks the administrator's permissions and validates the request.
4. The system applies the operation.
5. The system displays the updated invitation or membership status.

**Alternative and error flows:**
- If the administrator lacks the required permission, the system rejects the operation.
- If the target user or request is invalid, the system displays an appropriate error.

**Postconditions:** The membership or invitation state is updated only when the operation is valid and authorized.

### UC-06: Manage Channels

**Primary actor:** Community Admin

**Preconditions:** The administrator is authenticated and has permission to manage channels in the selected community.

**Main flow:**
1. The administrator opens the channel-management controls.
2. The administrator chooses to create, rename, or delete a channel.
3. The system validates the channel details and checks permissions.
4. The system performs the requested operation.
5. The system displays the updated channel list.

**Alternative and error flows:**
- If the request contains invalid details, the system rejects it.
- If the user lacks the required permission, the system does not change the channel.
- If the operation fails, the system displays an appropriate error.

**Postconditions:** The channel list reflects a successfully completed operation, or the original state remains unchanged.

### UC-07: Send Channel Message

**Primary actor:** Member

**Preconditions:** The user is authenticated and has permission to access the selected channel.

**Main flow:**
1. The user opens the channel.
2. The user enters a message.
3. The system validates the message and verifies access permissions.
4. The system stores the accepted message.
5. The system sends the corresponding real-time event to connected clients authorized to view the channel.

**Alternative and error flows:**
- If the message is empty or invalid, the system rejects it.
- If the user is not authorized to access the channel, the system rejects the request.
- If real-time delivery is interrupted, persisted messages remain available for retrieval when the user reconnects.

**Postconditions:** A valid message is stored and made available to authorized users.

### UC-08: Exchange Direct Messages

**Primary actor:** Member

**Preconditions:** The sender is authenticated and eligible to participate in the direct conversation.

**Main flow:**
1. The sender opens a direct conversation with another eligible user.
2. The sender enters and submits a message.
3. The system validates the request and verifies the sender's access.
4. The system stores the message.
5. The recipient can retrieve the message and receive the relevant real-time event when connected.

**Alternative and error flows:**
- If the sender is not eligible to access the conversation, the system rejects the request.
- If another user attempts to access the conversation without being a participant, the system denies access.

**Postconditions:** The message is available to the conversation participants and is not exposed to unrelated users.

### UC-09: Edit or Delete Message

**Primary actor:** Member

**Preconditions:** The user is authenticated and can access the message.

**Main flow:**
1. The user selects a message they are permitted to modify.
2. The user chooses to edit or delete it.
3. The system verifies message ownership or applicable moderation permission.
4. The system applies the requested change.
5. The updated or deleted state is reflected in the relevant conversation.

**Alternative and error flows:**
- If the user does not have permission, the system rejects the operation.
- If the message does not exist or cannot be modified, the system reports that the operation could not be completed.

**Postconditions:** The message is updated or removed from normal user-facing views as permitted by the application's rules.

### UC-10: React to Message

**Primary actor:** Member

**Preconditions:** The user is authenticated and can access the target message.

**Main flow:**
1. The user selects a message.
2. The user adds or removes a supported reaction.
3. The system validates the reaction and verifies access.
4. The system updates the reaction state.
5. The updated reaction information is displayed.

**Alternative and error flows:**
- If the message is inaccessible or the reaction value is invalid, the system rejects the change.

**Postconditions:** The reaction state reflects the accepted operation.

### UC-11: Search Messages

**Primary actor:** Member

**Preconditions:** The user is authenticated and has access to the application search feature.

**Main flow:**
1. The user enters a search term.
2. The system processes the query.
3. The system retrieves matching messages from locations the user is authorized to access.
4. The system displays the results.

**Alternative and error flows:**
- If the query is invalid, the system provides appropriate feedback.
- If no messages match, the system displays an empty-results message.
- Messages from inaccessible communities or conversations are excluded.

**Postconditions:** The user receives search results limited to authorized content.

### UC-12: View Notifications and Unread Counts

**Primary actor:** Member

**Preconditions:** The user is authenticated.

**Main flow:**
1. A relevant new message or notification event occurs.
2. The system updates the user's relevant notification or unread state.
3. The user views the notification or opens the relevant conversation.
4. The system updates the unread state according to the agreed read-tracking rules.

**Alternative and error flows:**
- If the connection is interrupted, the interface may not update immediately.
- The system should refresh or retrieve the relevant state when connectivity is restored, according to the implemented design.

**Postconditions:** The displayed notification and unread information reflects the current application state.

### UC-13: Moderate Community Content

**Primary actor:** Moderator or Community Admin

**Preconditions:** The user is authenticated and has the required moderation permission in the relevant community.

**Main flow:**
1. The moderator identifies the content or member requiring action.
2. The moderator selects a permitted moderation operation.
3. The system verifies the moderator's role and permissions.
4. The system validates the target and performs the action.
5. The system records the relevant security-sensitive moderation event.

**Alternative and error flows:**
- If the moderator lacks permission, the system rejects the operation.
- If the target is invalid, the system does not modify the affected resource.

**Postconditions:** The authorized moderation action is completed and recorded where required, or the original state remains unchanged.

### UC-14: Record Audit Events

**Primary actor:** System

**Preconditions:** A security-relevant moderation event occurs.

**Main flow:**
1. The system identifies the action that requires an audit record.
2. The system records the actor, action, affected resource, and timestamp.
3. The record is stored for later review according to the application's design.

**Alternative and error flows:**
- If recording fails, the failure should be handled and logged according to the approved error-handling design.
- Audit records must not contain passwords, authentication tokens, or other secrets.

**Postconditions:** The required audit event is available for review when successfully recorded.

### UC-15: Maintain Application

**Primary actor:** System Maintainer

**Preconditions:** The maintainer has access to the project's approved development or deployment environment.

**Main flow:**
1. The maintainer follows the documented setup or deployment procedure.
2. The maintainer checks application service health and relevant logs.
3. The maintainer investigates errors and applies approved fixes or configuration changes.
4. The maintainer runs the configured build and test checks.
5. The maintainer records relevant outcomes.

**Alternative and error flows:**
- If a service fails to start, the maintainer reviews the available logs and configuration.
- If automated checks fail, the failure is reviewed before the affected change is accepted.

**Postconditions:** The application is running or the identified maintenance issue is documented for further resolution.

### 4.4 Use-Case Diagram

The use-case diagram illustrates the interactions between different users and the NexusChat system. It identifies the main actors—Guest, Member, Community Admin, Moderator, and System Maintainer—and shows the functionalities available to each actor.

The diagram provides a high-level overview of the system's functional requirements and helps clarify the responsibilities of each user role.

![NexusChat Use-Case Diagram](docs/requirements/NexusChat UML Use Case Diagram.png)

**Figure 4.1:** Use-Case Diagram for NexusChat

# 5. System Features and Functional Requirements

The requirements below describe the expected behaviour of the MVP. “Shall” indicates a required behaviour. The team should keep the IDs stable so they can be referenced in test cases and the Requirement Traceability Matrix.

## 5.1 Identity and Profile

**FR-AUTH-01 \[High\]:** The system shall allow a guest to register using a unique username or email address and a password. If the username or email is already registered, the system shall reject the registration and explain which field needs attention without exposing another user’s private information.

**FR-AUTH-02 \[High\]:** The system shall authenticate a user only when the submitted credentials are valid. Invalid credentials shall not create an authenticated session, and the response shall not reveal whether a particular account exists.

**FR-AUTH-03 \[High\]:** The system shall allow an authenticated user to log out and shall invalidate the associated active session or token according to the chosen authentication design.

**FR-AUTH-04 \[Medium\]:** The system shall allow a user to view and update the profile fields permitted by the application. Invalid values shall be rejected with a clear validation message.

## 5.2 Community and Channel Management

NexusChat allows users to create communities and organise conversations into separate text channels. Community administrators will be responsible for managing their communities, while access to management features will depend on the permissions assigned to each user.

**FR-COM-01 [High]:** The system shall allow an authenticated member to create a community by providing a valid name. A user shall not be allowed to create another community with the same name under their ownership. If the name is invalid or conflicts with an existing community owned by the same user, the system shall reject the request and display a clear error message.

**FR-COM-02 [High]:** The system shall allow a community admin with the required permissions to invite users and manage community membership. Users without the required permissions shall not be allowed to send invitations or make unauthorized changes to membership. The system shall inform the user when an invitation or membership operation cannot be completed.

**FR-COM-03 [High]:** The system shall allow an authorized community admin to create, rename, and delete text channels within their community. The system shall validate the supplied channel details and check the user's permissions before carrying out these operations. If the details are invalid or the user lacks the required permission, the operation shall be rejected.

**FR-COM-04 [High]:** The system shall verify the requesting user's role and community or channel permissions on the server before performing any protected operation. If the user is not authorized, the system shall reject the request without making changes to the protected resource.

## 5.3 Real-Time Messaging and Direct Messages

**FR-MSG-01 \[High\]:** The system shall allow a member to send a text message to a channel that the member is permitted to access. Empty or invalid messages shall be rejected according to the agreed message-validation rules.

**FR-MSG-02 \[High\]:** When a valid channel message is accepted, the system shall store it and deliver a corresponding event through WebSockets to connected clients authorized to view that channel. A client that is disconnected shall be able to retrieve persisted messages when it reconnects and opens the channel.

**FR-MSG-03 \[High\]:** The system shall allow two eligible users to exchange one-to-one direct messages. Users who are not participants in a direct conversation shall not be able to retrieve its messages or receive its real-time events.

**FR-MSG-04 \[Medium\]:** The system shall allow a message author to edit or delete their own message, subject to the agreed rules. A moderator or admin may act on another user’s message only when the relevant permission allows it. Unauthorized changes shall be rejected.

**FR-MSG-05 \[Medium\]:** The system shall publish typing and presence events only to users authorized to see the relevant conversation or community. If a connection is lost, the system shall update presence according to the agreed timeout and reconnection rules.

## 5.4 Reactions, Search, and Notifications

**FR-UX-01 \[Medium\]:** The system shall allow a member to add or remove a reaction on a message they can access. The system shall reject reaction changes for inaccessible messages or invalid reaction values.

**FR-UX-02 \[Medium\]:** The system shall allow a member to search messages only within communities and conversations they are authorized to access. Search results shall not reveal message text or metadata from inaccessible locations.

**FR-UX-03 \[Medium\]:** The system shall maintain unread counts and notify users about relevant new messages. Reading a conversation shall update its unread state according to the agreed read-tracking rules.

## 5.5 Moderation and Audit

**FR-MOD-01 \[High\]:** A moderator or admin shall be able to remove a message only in a community where they have the required permission. The system shall reject unauthorized attempts and shall record the moderation action in the audit trail.

**FR-MOD-02 \[High\]:** A moderator or admin shall be able to restrict or remove a member only when their role permits that action. The system shall validate the target and permission before applying the change.

**FR-MOD-03 \[High\]:** The system shall record security-relevant moderation events, including the actor, action, affected resource, and timestamp. Audit records shall not contain passwords, authentication tokens, or other secrets.

# 6. Nonfunctional Requirements

## 6.1 Performance Requirementss

NexusChat should respond quickly during normal use so that users can communicate without unnecessary delays. Since the application supports real-time messaging, performance is particularly important when several users are active in different communities at the same time.

The following targets will be used to evaluate the application's performance:

- **Real-time messaging:** The target for WebSocket message acknowledgement shall be no more than 500 ms at the 95th percentile (p95) under the defined test load.
- **General operations:** Core UI/API operations, such as retrieving community information or loading a channel, should complete within 2 seconds under normal test conditions.
- **Message search:** Search results should be returned within 2 seconds for the evaluation dataset defined in the test plan.
- **Concurrent usage:** The application should support multiple users accessing communities, sending messages, and using other core features at the same time without unexpected failures under the agreed test load.
- **Consistent behaviour:** The application should continue to handle valid requests correctly during performance testing. If a request cannot be completed, the system should return an appropriate error rather than silently failing.

These targets will be checked during testing using a documented environment, dataset, and number of concurrent clients. The team will record the measurement method and test results in the test plan. If a target is not met, the team should investigate the cause and document the outcome before the final evaluation.

## 6.2 Safety Requirements

NexusChat is not a safety-critical system. However, actions that can remove a channel, change community access, or otherwise affect multiple users should require the appropriate permission and a confirmation step where the action is destructive. The system should explain when an action cannot be completed rather than silently failing.

## 6.3 Security Requirements

- Passwords shall be stored using an appropriate password-hashing method and shall never be stored in plaintext.
- Protected API endpoints and WebSocket events shall require authentication and authorization as appropriate.
- Permission checks shall be enforced on the server; hiding a button in the frontend is not sufficient.
- User input shall be validated, and message content shall be rendered safely to reduce injection and cross-site scripting risks.
- Rate limiting or equivalent abuse controls shall be applied to sensitive or easily abused operations.
- Security-relevant moderation events shall be recorded in the audit trail.
- Secrets and environment-specific configuration shall be supplied through environment or secret-management configuration, not committed to the repository.
- Logs and error messages shall not expose passwords, tokens, or other sensitive secrets.

## 6.4 Software Quality Attributes

NexusChat should be easy to maintain, test, and use as the project grows. The following quality attributes describe what the team should consider while developing and evaluating the application.

| **Attribute** | **Expected Approach / Target** |
|---|---|
| Maintainability | The frontend, backend APIs, WebSocket handling, and database operations should be organised into separate modules so that changes can be made without unnecessarily affecting other parts of the application. |
| Testability | The application should support unit and integration testing of important features, including authentication, community management, messaging, database operations, and WebSocket communication. |
| Reliability | The application should handle temporary connection failures gracefully. Messages that have already been saved should remain available when users reconnect, and retry operations should be handled carefully to avoid unintended duplicate messages. |
| Usability | Common tasks, such as joining a community, opening a channel, and sending a message, should be easy to understand. The interface should provide clear feedback when an action succeeds or fails. |
| Portability | The project should use Docker and documented configuration so that team members can set up and run the application consistently in the intended development and testing environments. |
| Security | Authentication, authorization, and input validation should be applied consistently. Critical security findings should be addressed before release, or any accepted exception should be documented and approved. |

These attributes will be considered during implementation and testing. The team should use code reviews, automated tests, and the agreed code-quality tools to check whether the application follows these expectations.

## 6.5 Business and Domain Rules

- Only members of a private community may access its private content.
- Only users with the required administrative permission may change community roles and protected channel permissions.
- Moderators may act only in communities where they have been granted the relevant permission.
- Users may edit or delete their own messages; actions on other users’ messages require an applicable moderation permission.
- Deleted messages shall no longer appear in normal user-facing views. Any retention or audit requirements for deleted content must follow the approved project rules.

# 7. Other Requirements

Apart from the functional and non-functional requirements described in the earlier sections, NexusChat must follow a few additional rules to keep its data consistent and make the application easier to maintain.

- **Data integrity:** The database shall use primary keys, foreign keys, and uniqueness constraints wherever required to prevent invalid or duplicate records and maintain relationships between users, communities, channels, and messages.

- **Date and time handling:** Dates and times shall be stored consistently, preferably in UTC, and displayed in a suitable local format when shown to users.

- **Application logging:** The application shall maintain logs that help the team identify errors and troubleshoot issues. Passwords, authentication tokens, and other sensitive information shall not be included in these logs.

- **Field validation:** Input fields, their data types, formats, and validation rules shall follow the approved Field Layouts spreadsheet. Any changes to these rules shall be reflected in the relevant documentation and implementation.

- **Requirement traceability:** Functional and non-functional requirements shall use consistent IDs across the SRS, design documents, and Requirement Traceability Matrix (RTM). The RTM shall be updated whenever a requirement is added, changed, or removed.

These requirements will help keep the application data reliable and ensure that the implementation, documentation, and tests remain consistent throughout development.

# Appendix A: Glossary

This glossary explains the technical terms used throughout the NexusChat Software Requirements Specification.

| **Term** | **Meaning in NexusChat** |
|---|---|
| Community / Server | A group space where users can join, communicate, and access channels based on their permissions. |
| Channel | A separate conversation space within a community, used to discuss a particular topic. |
| DM (Direct Message) | A private conversation between two users. |
| WebSocket | A communication method that allows the browser and server to exchange real-time updates without repeatedly creating new connections. |
| Presence | An indication of whether a user is online, idle, or offline. |
| Role | A named set of permissions that determines what a user can do within a community. |
| MVP (Minimum Viable Product) | The first agreed version of NexusChat that includes the core features required for the project. |
| RTM (Requirement Traceability Matrix) | A document that links requirements to their related design elements and test cases so the team can track implementation and verification. |
| CI/CD (Continuous Integration and Continuous Delivery/Deployment) | A development practice that automates parts of the build, testing, and delivery process. |
| REST API | An interface that allows the frontend and backend to exchange requests and responses for operations such as account management and channel creation. |
| PostgreSQL | The relational database used to store NexusChat data, including users, communities, channels, and messages. |
| Docker | A tool used to package and run the application in a consistent environment. |
| Jenkins | An automation tool used in the project to run configured build, testing, and delivery tasks. |


# Appendix B: Field Layouts

## B.1 Purpose

This appendix describes the data fields used in NexusChat. It specifies the field names, data types, lengths, descriptions, mandatory status, and applicable validation rules and constraints. These definitions help maintain consistency between the software requirements, database design, and application implementation.

## B.2 Field Layout Specification

Each field is defined using the following attributes:

- **Entity:** The data entity to which the field belongs, such as User, Community, Channel, or Message.
- **Field:** The name used to identify the field.
- **Length:** The maximum permitted length or size, where applicable.
- **Data Type:** The expected type or format of the field.
- **Description:** A brief explanation of the field's purpose.
- **Mandatory:** Indicates whether the field is required or optional.
- **Constraints:** Specifies applicable validation rules, permitted values, uniqueness requirements, and primary-key or foreign-key relationships.

## B.3 Entities Covered

The field layouts cover the principal data entities required by NexusChat:

1. **User:** Account details, username, email address, password hash, display name, and account status.
2. **Community:** Community identifier, owner, name, and description.
3. **Membership:** Relationships between users and communities, including assigned roles.
4. **Channel:** Channel identifier, associated community, name, and type.
5. **Message:** Message identifier, sender, content, associated channel, creation timestamp, and edit timestamp.
6. **Reaction:** User reactions associated with messages.
7. **Audit Event:** Records of relevant actions performed within the application.

Additional fields required by approved features, including direct messaging and notifications, shall be incorporated into the data model as necessary.

## B.4 Data Validation and Consistency

All required fields must be validated before data is stored. Field lengths, data types, permitted values, and other constraints must be enforced consistently across the frontend, backend, and database wherever applicable.

Primary-key and foreign-key relationships must preserve data integrity. Timestamps should follow the project's agreed UTC storage convention. Password hashes and other sensitive information must not be exposed through user-facing interfaces or application responses.

## B.5 Maintenance

Whenever an approved requirement or design decision changes the data fields, the corresponding requirements, database schema, implementation, and tests must be reviewed and updated. The field definitions must remain consistent throughout the project.

# Appendix C: Requirement Traceability Matrix

Use 07_Requirement_Traceability_Matrix.xlsx as the initial RTM. Each functional and nonfunctional requirement should be mapped to relevant design components and test cases. Update the matrix whenever a requirement is changed, added, deferred, or removed.

---

*Page footer in original document: NexusChat SRS — Working Draft*
