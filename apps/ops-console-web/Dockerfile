# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-ops-console-web" \
      org.opencontainers.image.description="DRTS Phase1 Ops Console Web"

ENV CI=1 \
    HUSKY=0 \
    PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:/node_modules/.bin:$PATH

RUN apk add --no-cache libc6-compat && \
    corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/*/package.json packages/
COPY apps/ops-console-web/package.json apps/ops-console-web/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY packages ./packages
COPY apps/ops-console-web ./apps/ops-console-web
COPY tsconfig.base.json .

RUN pnpm --filter @drts/contracts build && \
    pnpm --filter @drts/ops-console-web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3003

WORKDIR /app

COPY --from=build /workspace/apps/ops-console-web/.next/standalone ./
COPY --from=build /workspace/apps/ops-console-web/.next/static ./apps/ops-console-web/.next/static
COPY --from=build /workspace/apps/ops-console-web/public ./apps/ops-console-web/public

EXPOSE 3003
CMD ["node", "apps/ops-console-web/server.js"]
