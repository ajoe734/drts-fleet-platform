# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-platform-admin-web" \
      org.opencontainers.image.description="DRTS Phase1 Platform Admin Web"

ENV CI=1 \
    HUSKY=0 \
    PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:/node_modules/.bin:$PATH

RUN apk add --no-cache libc6-compat && \
    corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/platform-admin-web/package.json apps/platform-admin-web/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/platform-admin-web/ apps/platform-admin-web/
COPY scripts/control-plane-web-proxy.mjs scripts/
COPY tsconfig.base.json .

RUN pnpm --filter @drts/contracts build && \
    pnpm --filter @drts/platform-admin-web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3002

WORKDIR /app

# Standalone output is self-contained: traced node_modules + server.js
# outputFileTracingRoot=monorepo-root means server.js is at apps/platform-admin-web/server.js
COPY --from=build /workspace/apps/platform-admin-web/.next/standalone ./
COPY --from=build /workspace/apps/platform-admin-web/.next/static ./apps/platform-admin-web/.next/static
COPY --from=build /workspace/apps/platform-admin-web/public ./apps/platform-admin-web/public
COPY --from=build /workspace/scripts/control-plane-web-proxy.mjs ./scripts/control-plane-web-proxy.mjs

EXPOSE 3002
CMD ["node", "scripts/control-plane-web-proxy.mjs", "apps/platform-admin-web/server.js", "3102"]
