# syntax=docker/dockerfile:1.7
# One recipe for the three services. Build a service with:
#   docker build --target api    -t harvestslot-api .
#   docker build --target worker -t harvestslot-worker .
#   docker build --target web    -t harvestslot-web --build-arg API_INTERNAL_URL=http://api:4000 .
# The web image bakes API_INTERNAL_URL into its proxy rewrites at build time.

ARG NODE_VERSION=24.16.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
WORKDIR /repo

# Dependencies (cached separately from sources).
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY e2e/package.json e2e/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ARG API_INTERNAL_URL=http://api:4000
# prisma.config.ts reads DATABASE_URL; generation does not connect, so a placeholder is enough.
ENV API_INTERNAL_URL=${API_INTERNAL_URL} DATABASE_URL=postgresql://build:build@localhost:5432/build NEXT_OUTPUT=standalone
RUN pnpm db:generate \
 && pnpm build:packages \
 && pnpm --filter @harvestslot/api build \
 && pnpm --filter @harvestslot/worker build \
 && pnpm --filter @harvestslot/web build

# ── API and worker: compiled workspace with its dependencies (the Prisma CLI is kept for migrations) ──
FROM node:${NODE_VERSION}-bookworm-slim AS server
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=build --chown=node:node /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /repo/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=node:node /repo/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=node:node /repo/apps/worker/node_modules ./apps/worker/node_modules
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]

FROM server AS api
WORKDIR /repo/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]

FROM server AS worker
WORKDIR /repo/apps/worker
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]

# ── Web: Next.js standalone server ──
FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/offline').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
