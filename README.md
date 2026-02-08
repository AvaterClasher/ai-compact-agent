# Exo - Context-Compacting Coding Agent

A full-stack AI coding agent that automatically compacts conversation history when approaching LLM context limits, enabling indefinitely long coding sessions.

## Architecture

```
salvador/
├── apps/
│   ├── api/          # Hono + Bun REST/SSE API server
│   ├── web/          # Next.js web interface
│   └── cli/          # OpenTUI React terminal interface
├── packages/
│   └── shared/       # Shared types, Zod schemas, DB schema, API client
└── docker/
    └── sandbox.Dockerfile  # Sandboxed code execution container
```

### Key Components

- **Agent loop** with multi-step tool use (shell, read/write files, execute code)
- **Automatic context compaction** (prune + summarize) when approaching token limits
- **Sandboxed code execution** via Docker containers (512 MB memory, 1 CPU, no network)
- **SQLite persistence** with Drizzle ORM and WAL mode
- **Multi-model support** for Anthropic (Claude) and OpenAI (GPT, O-series)
- **OpenTelemetry tracing** with optional Axiom integration
- **OpenAPI spec** auto-generated from Zod schemas at `/api/doc`

## Prerequisites

- [Bun](https://bun.sh) >= 1.2.0
- [Docker](https://www.docker.com/) (for sandboxed tool execution)
- An Anthropic API key and/or OpenAI API key

## Quick Start

```bash
# Install dependencies
bun install

# Copy environment file and add your API keys
cp .env.example .env

# (Optional) Start Docker-managed SQLite volume
docker compose up -d

# Start all apps (API + Web + CLI)
bun run dev

# Or start individually
bun run dev:api   # API only (port 5001)
bun run dev:web   # Web only (port 3000)
bun run dev:cli   # CLI only
```

The sandbox Docker image (`exo-sandbox:latest`) is built automatically on first API startup. When `DOCKER_DB=true`, the SQLite database is stored in a Docker-managed volume at `./data`.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | One of these | - | Anthropic API key for Claude models |
| `OPENAI_API_KEY` | is required | - | OpenAI API key for GPT/O-series models |
| `DATABASE_PATH` | No | `./data/agent.db` | SQLite database file path |
| `PORT` | No | `5001` | API server port |
| `DOCKER_DB` | No | `true` | Persist SQLite in a Docker-managed volume (`docker compose up -d`) |
| `AXIOM_API_TOKEN` | No | - | Axiom token for distributed tracing (disabled if empty) |
| `AXIOM_DATASET` | No | `backend-traces` | Axiom dataset name |
| `AXIOM_OTLP_ENDPOINT` | No | `https://api.axiom.co/v1/traces` | OpenTelemetry endpoint |
| `OTEL_SERVICE_NAME` | No | `backend` | OpenTelemetry service name |

## API Reference

Interactive API documentation is available at `/api/reference` (Swagger UI) when the server is running. The raw OpenAPI 3.1 spec is served at `/api/doc`.

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a new session |
| `GET` | `/api/sessions/:id` | Get session details |
| `PATCH` | `/api/sessions/:id` | Update session (title, model, status) |
| `DELETE` | `/api/sessions/:id` | Delete session and cleanup sandbox |
| `POST` | `/api/sessions/:id/generate-title` | Auto-generate title from first message |
| `GET` | `/api/messages/:sessionId` | Get message history with parts |
| `POST` | `/api/stream/:sessionId` | Send message and stream response |
| `GET` | `/api/health` | Health check with sandbox status |
| `GET` | `/api/models` | List available models (filtered by configured API keys) |

### Supported Models

**Anthropic:** claude-opus-4-6, claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001

**OpenAI:** gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o3, o3-mini, o4-mini

Models are automatically filtered based on which API keys are configured. Default model is `claude-sonnet-4-5-20250929` if Anthropic key is set, otherwise `gpt-4.1-nano`.

## Development

```bash
bun install           # Install dependencies
bun run dev           # Start all services via Turborepo
bun run build         # Build all apps
bun run check-types   # TypeScript type checking
bun run test          # Run all tests
bun run test:api      # Run API tests only
bun run lint          # Lint with Biome
bun run lint:fix      # Auto-fix lint issues
bun run format        # Format with Biome
bun run db:generate   # Generate Drizzle migrations
bun run db:migrate    # Run database migrations
```

### Testing

Tests use Bun's built-in test runner with in-memory SQLite for isolation:

```bash
bun run test              # Run all tests
bun run test:api          # API tests only
bun test --watch          # Watch mode (from apps/api)
```

Test patterns:
- In-memory SQLite via `new Database(":memory:")` for test isolation
- Proxy pattern for mocking singleton DB imports in route tests
- Mock modules for Docker executor and AI SDK

### Pre-commit Hooks

Biome linting and formatting are enforced via Lefthook pre-commit hooks.

## Docker Architecture

### Sandbox Containers

Each agent session gets a dedicated Docker container for code execution:

- **Image:** `exo-sandbox:latest` (Alpine + Bun, built from `docker/sandbox.Dockerfile`)
- **Limits:** 512 MB memory, 1 CPU, no network access
- **Lifecycle:** Created lazily on first tool use, removed when session is deleted
- **Tools:** `shell`, `readFile`, `writeFile`, `executeCode` (JavaScript, TypeScript, Python, shell)

### SQLite Volume (Docker Compose)

When `DOCKER_DB=true` (default), `docker compose up -d` starts a lightweight volume service that manages the `./data` directory. The API runs on the host and writes to `./data/agent.db`. Docker provides volume lifecycle management (inspect, backup, prune).

## Compaction Strategy

The agent uses a two-phase compaction strategy to manage context windows:

1. **Prune:** Old tool-result message parts are marked as "pruned" (content replaced with a placeholder) once accumulated tokens exceed `PRUNE_MINIMUM` (20,000 tokens). The last 2 user turns are always protected.

2. **Summarize:** When projected token usage exceeds the model's context window (minus `OUTPUT_TOKEN_MAX`), the entire conversation is summarized by the LLM and replaced with a system message containing the summary.

Compaction is checked:
- **Pre-send:** Before the first `streamText` call each turn
- **Mid-turn:** After each agent step completes (for multi-step tool use)

## Assumptions and Design Decisions

- **SQLite over Postgres/Redis:** Chosen for zero-config deployment and single-binary simplicity. WAL mode enables concurrent read/write without a separate database server.

- **Token estimation heuristic:** Uses `Math.ceil(text.length / 4)` (4 characters per token) rather than a tokenizer library, trading accuracy for speed and zero dependencies.

- **Ephemeral sandbox containers:** Each session gets its own isolated container. Containers are not persisted across server restarts — they are recreated on demand.

- **Compaction uses the same LLM:** The summary is generated by the same model powering the session. This ensures consistent quality but consumes additional tokens.

- **Pre-send and mid-turn overflow detection:** Proactive compaction prevents the agent from ever hitting a hard context limit, even during long multi-step tool-use chains.

- **Host Docker access:** The API runs on the host and manages sandbox containers directly via the Docker CLI. No socket mounting is needed.

- **nanoid for ID generation:** Shorter and URL-safe compared to UUIDs, with sufficient collision resistance for this use case.

- **Schema-first migrations:** Uses `CREATE TABLE IF NOT EXISTS` on startup rather than versioned migration files. Suitable for single-instance SQLite deployments.

- **CORS enabled for all origins:** The API allows all origins for development convenience. Should be restricted in production deployments.

- **No authentication:** The API does not implement authentication or authorization. It is designed for local/trusted network use.

- **Monorepo with Turborepo:** Enables shared types and schemas between API, web, and CLI apps while maintaining independent build/test pipelines.
