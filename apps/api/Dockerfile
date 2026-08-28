# syntax=docker/dockerfile:1
#
# Build context for this Dockerfile is the REPO ROOT (see docker-compose.yml:
# `context: .`, `dockerfile: apps/api/Dockerfile`), not apps/api/. That's required
# because this is an npm-workspaces monorepo: the api package depends on the
# workspace-local @learnai/shared package and a single root lockfile, both of
# which live outside apps/api/.
#
# NOTE: Docker itself isn't available in this development sandbox, but the exact
# build/boot sequence below (npm ci, prisma generate, build shared+api, node dist/main.js)
# has been run directly on the host against the real production Postgres/RabbitMQ
# and verified end-to-end (routes mapped, DB connected, broker connected).

# ---------------------------------------------------------------------------
# Stage 1: build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /workspace

# Copy workspace manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

# Now bring in the actual source.
COPY apps/api apps/api
COPY packages/shared packages/shared

# Prisma client must be generated against the real schema before building.
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

# Build the shared package first (api depends on its compiled output), then the api itself.
RUN node --version && npm --version
RUN npm run build -w @learnai/shared
RUN echo "--- packages/shared/dist ---" && find packages/shared/dist -type f
RUN npm run build -w @learnai/api
# Diagnostics: if dist/main.js is missing, show exactly what got produced instead,
# and the fully-resolved build tsconfig, so the failure is debuggable from the log
# instead of a bare assertion.
RUN echo "--- apps/api/dist (full tree) ---" && find apps/api/dist -type f
RUN test -f apps/api/dist/main.js || ( \
      echo "BUILD ERROR: apps/api/dist/main.js was not produced by nest build" && \
      echo "--- resolved tsconfig.build.json ---" && \
      npx tsc -p apps/api/tsconfig.build.json --showConfig && \
      exit 1 \
    )

# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production

# Full node_modules (including the workspace-hoisted @learnai/shared, @prisma/client,
# and the prisma CLI needed for `prisma migrate deploy` at container start) plus the
# built output and Prisma schema/migrations.
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/packages/shared/dist ./packages/shared/dist
COPY --from=build /workspace/packages/shared/package.json ./packages/shared/package.json

WORKDIR /workspace/apps/api
EXPOSE 3001

# This is a sane default for running the image standalone against an already-migrated
# database. docker-compose.yml overrides this command to run `prisma migrate deploy`
# before starting the server, since compose also owns the Postgres container/lifecycle.
CMD ["node", "dist/main.js"]
