# syntax=docker/dockerfile:1
#
# Build context for this Dockerfile is the REPO ROOT (see docker-compose.yml:
# `context: .`, `dockerfile: apps/web/Dockerfile`), not apps/web/ — same reasoning
# as apps/api/Dockerfile: this is an npm-workspaces monorepo and the web package
# depends on the workspace-local @learnai/shared package and the root lockfile.
#
# NOTE: this Dockerfile has not been executed in this development sandbox (no
# Docker available here) — it has been written and reviewed carefully against
# the actual package.json scripts/deps, but only exercised on paper.

# ---------------------------------------------------------------------------
# Stage 1: build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY apps/web apps/web
COPY packages/shared packages/shared

# Next.js inlines NEXT_PUBLIC_* variables into the client bundle at build time, so it
# must be supplied as a build arg (see docker-compose.yml `build.args`), not just a
# runtime env var.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build -w @learnai/shared
RUN npm run build -w @learnai/web

# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
# Kept as a plain `next start` runtime (rather than `output: 'standalone'`) so we don't
# have to modify next.config.ts, which belongs to the frontend agent's working set.
# This means the runtime image needs full node_modules, not just a pruned trace.
FROM node:20-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production

COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/web/.next ./apps/web/.next
COPY --from=build /workspace/apps/web/public ./apps/web/public
COPY --from=build /workspace/apps/web/package.json ./apps/web/package.json
COPY --from=build /workspace/apps/web/next.config.* ./apps/web/
COPY --from=build /workspace/packages/shared/dist ./packages/shared/dist
COPY --from=build /workspace/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /workspace/package.json ./package.json

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@learnai/web"]
