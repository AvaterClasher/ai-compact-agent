FROM oven/bun:1.2.0-alpine

WORKDIR /app

# Copy workspace config files
COPY package.json bun.lock turbo.json tsconfig.base.json ./

# Copy workspace package.json files for dependency resolution
COPY apps/api/package.json apps/api/tsconfig.json apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Copy sandbox Dockerfile so the manager can find it
COPY docker/sandbox.Dockerfile docker/

# Create data directory for SQLite
RUN mkdir -p /data

EXPOSE 5001

ENV DATABASE_PATH=/data/agent.db

CMD ["bun", "run", "apps/api/src/index.ts"]
