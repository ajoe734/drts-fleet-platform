# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-fleet-partner-portal-web" \
      org.opencontainers.image.description="DRTS Phase1 Fleet Partner Portal Web"

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
COPY apps/fleet-partner-portal-web/package.json apps/fleet-partner-portal-web/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ARG DRTS_CANDIDATE_SHA
ENV DRTS_CANDIDATE_SHA=$DRTS_CANDIDATE_SHA
COPY apps/fleet-partner-portal-web/ apps/fleet-partner-portal-web/
COPY scripts/control-plane-web-proxy.mjs scripts/
COPY tsconfig.base.json .

RUN pnpm --filter @drts/contracts build && \
    pnpm --filter @drts/control-plane-auth build && \
    pnpm --filter @drts/ui-tokens build && \
    pnpm --filter @drts/fleet-partner-portal-web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3007

WORKDIR /app

COPY --from=build /workspace/apps/fleet-partner-portal-web/.next/standalone ./
COPY --from=build /workspace/apps/fleet-partner-portal-web/.next/static ./apps/fleet-partner-portal-web/.next/static
COPY --from=build /workspace/apps/fleet-partner-portal-web/public ./apps/fleet-partner-portal-web/public
COPY --from=build /workspace/scripts/control-plane-web-proxy.mjs ./scripts/control-plane-web-proxy.mjs

EXPOSE 3007
CMD ["node", "scripts/control-plane-web-proxy.mjs", "apps/fleet-partner-portal-web/server.js", "3107"]
