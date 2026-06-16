# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-concierge-portal-web" \
      org.opencontainers.image.description="DRTS Phase 1 concierge portal web"

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
COPY apps/concierge-portal-web/package.json apps/concierge-portal-web/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/concierge-portal-web/ apps/concierge-portal-web/
COPY tsconfig.base.json .

RUN pnpm --filter @drts/ui-tokens build && \
    pnpm --filter @drts/concierge-portal-web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3006

WORKDIR /app

COPY --from=build /workspace/apps/concierge-portal-web/.next/standalone ./
COPY --from=build /workspace/apps/concierge-portal-web/.next/static ./apps/concierge-portal-web/.next/static

EXPOSE 3006
CMD ["node", "apps/concierge-portal-web/server.js"]
