# NexusChat — Maintainability, Testability & Portability Report (NFR-04)

**Document Control**
- **Document Version:** 1.0
- **Standard:** IEEE 1012 / UE24CS341A Software Engineering
- **Author:** viz2906
- **Status:** Approved
- **Issue Reference:** #36 (NFR-04 - Verify maintainability, testability and portability)
- **SRS References:** Section 6.4 (Software Quality Characteristics), Section 2.1 & 2.4

---

## 1. Objective

This report evaluates and verifies the software quality characteristics of NexusChat, focusing on:
1. **Maintainability:** Modularity of components, separation of concerns, clean interfaces, and low coupling.
2. **Testability:** Decoupled business logic, in-memory execution capabilities, automated test coverage, and repeatable CI workflows.
3. **Portability:** Containerization readiness, cross-environment compatibility, and externalization of configuration.

---

## 2. Component Modularity & Architecture

The application adheres strictly to a 4-tier layered architecture:

```
Routes / Endpoints
       │
       ▼
Controllers (HTTP translation & response mapping)
       │
       ▼
Services (Core business logic & domain rules)
       │
       ▼
Repositories (PostgreSQL data access & migrations)
```

### Key Architectural Strengths
- **Constructor Dependency Injection:** Services and controllers accept repositories and utility dependencies via their constructors, enabling unit testing without a live database or network layer.
- **DTO Transformation:** Database entity models are transformed into safe, structured Data Transfer Objects (DTOs) before reaching the presentation layer.
- **Isolated Validation:** Payload validation is centralized in dedicated Zod schemas, decoupled from HTTP routing logic.

---

## 3. Testability & Automation Verification

### Execution Environment
The test suite utilizes `pg-mem` to simulate a fully compliant PostgreSQL database in memory. This eliminates dependencies on external database instances, allowing test suites to execute reliably in any CI/CD environment.

| Test Tier | Test Suites | Test Cases | Execution Time | Result |
|---|---|---|---|---|
| Unit Testing | 5 suites | 45 tests | ~3.5s | **PASS** |
| Integration Testing | 7 suites | 110 tests | ~45s (parallel) | **PASS** |
| Static Analysis / Linting | ESLint | Full codebase | ~2.1s | **PASS (0 errors, 0 warnings)** |

### Documented Commands
- `npm test`: Runs the test suite in band via Jest.
- `npm run lint`: Performs static code quality and formatting checks.
- `npm run migrate`: Applies pending schema migrations.

---

## 4. Portability & Configuration Management

### Environment Externalization
All configuration variables are externalized via environment variables and loaded via `dotenv`:
- `DATABASE_URL`: PostgreSQL connection URI.
- `JWT_SECRET`: Secret key for cryptographic signing of JSON Web Tokens.
- `API_PORT`: Application server listening port (defaults to 5000).

A documented template is maintained in [`.env.example`](../../.env.example).

### Containerization (Docker)
- `docker-compose.yml` orchestrates PostgreSQL and application containers.
- Standard Node.js LTS (v18+) engine target ensures compatibility across Windows, macOS, and Linux platforms.

---

## 5. Known Portability Limitations & Recommendations

1. **Windows CPU Throttling on In-Band Bcrypt:** Running full test suites with bcrypt (12 rounds) sequentially in a single thread on Windows can cause tests to approach standard timeouts when under heavy system load. In Ubuntu Linux (CI environment), execution completes in less than 20% of the time.
2. **In-Memory Revocation Store:** The `TokenRevocationStore` operates in process memory. For horizontally scaled multi-container deployments, an external state store (e.g., Redis) should be introduced.

---

## 6. Conclusion

NexusChat satisfies the maintainability, testability, and portability criteria outlined in NFR-04 and SRS §6.4. The codebase exhibits high testability, robust modularity, and environment reproducibility.
