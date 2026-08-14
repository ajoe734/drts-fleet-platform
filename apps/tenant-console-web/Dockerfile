# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-tenant-console-web" \
      org.opencontainers.image.description="DRTS Tenant Console Web (enterprise dispatch admin)"

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
COPY apps/tenant-console-web/package.json apps/tenant-console-web/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ARG DRTS_CANDIDATE_SHA
ENV DRTS_CANDIDATE_SHA=$DRTS_CANDIDATE_SHA
COPY apps/tenant-console-web/ apps/tenant-console-web/
COPY runtime/web/control-plane-web-proxy.mjs runtime/web/
COPY tsconfig.base.json .

RUN pnpm --filter @drts/contracts build && \
    pnpm --filter @drts/ui-tokens build && \
    pnpm --filter @drts/tenant-console-web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3004

WORKDIR /app

COPY --from=build /workspace/apps/tenant-console-web/.next/standalone ./
COPY --from=build /workspace/apps/tenant-console-web/.next/static ./apps/tenant-console-web/.next/static
COPY --from=build /workspace/runtime/web/control-plane-web-proxy.mjs ./runtime/web/control-plane-web-proxy.mjs

EXPOSE 3004
CMD ["node", "runtime/web/control-plane-web-proxy.mjs", "apps/tenant-console-web/server.js", "3104"]
