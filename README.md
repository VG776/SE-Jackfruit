# NexusChat

NexusChat is a modern, scalable real-time chat application.

## Project Structure

```text
nexuschat/
│
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
│
├── docs/
│   ├── requirements/
│   ├── architecture/
│   ├── design/
│   ├── testing/
│   ├── validation/
│   └── reports/
│
├── backend/
│   ├── src/
│   └── tests/
│
├── frontend/
│   ├── src/
│   └── tests/
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── docker/
│
├── scripts/
│
├── .env.example
├── .gitignore
├── CONTRIBUTING.md
├── README.md
└── docker-compose.yml
```

## Getting Started

### Sprint 1 browser demo

Run these commands from a clone of this repository:

```sh
cd backend
npm ci
npm run demo
```

Open the URL printed by the server (normally `http://127.0.0.1:5000/?demo=1`). Click **Sign in as owner**. Open the same URL in a separate private window and click **Sign in as member**. Both accounts start in Project Jackfruit.

For the recording, use `#general` in both windows and send a message after both show **Live**. Reload the member window to show message history. In the owner window, create a channel using **+**, then rename or delete it through **Channel settings**. The member window shows channel administration controls disabled. The login screen also supports registration, and each window has its own sign-out button.

The demo runs the real HTTP and WebSocket server with preloaded data in memory. Its data resets when the process restarts. Stop it with Ctrl+C. If port 5000 is busy, set `DEMO_PORT` to another local port before starting it.

### Run with PostgreSQL

With PostgreSQL available, set the database and JWT settings in the root `.env` (see `.env.example`), start the database, then run `npm ci`, `npm run migrate`, and `npm start` from `backend`. Express serves the browser UI, API and WebSocket on the same port. Use the server URL without the demo query parameter.

GitHub stores the source. To share a public URL, deploy the Node server to a host that supports WebSockets and configure its PostgreSQL database. A static GitHub Pages deployment cannot run this server.

### Prerequisites

- Node.js (v18+)
- Docker & Docker Compose
- Git

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/nexuschat.git
   cd nexuschat
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

3. **Start services with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

## Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:
- [Requirements](docs/requirements/)
- [Architecture](docs/architecture/)
- [Design](docs/design/)
- [Testing](docs/testing/)
- [Validation](docs/validation/)
- [Reports](docs/reports/)

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution guidelines.

## License

This project is licensed under the MIT License.
