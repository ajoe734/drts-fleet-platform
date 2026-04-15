# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-tenant-portal-web" \
      org.opencontainers.image.description="DRTS Phase1 Tenant Portal Web"

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
COPY apps/tenant-portal-web/package.json apps/tenant-portal-web/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/tenant-portal-web/ apps/tenant-portal-web/
COPY tsconfig.base.json .

RUN pnpm --filter @drts/contracts build && \
    pnpm --filter @drts/tenant-portal-web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --from=build /workspace/apps/tenant-portal-web/.next/standalone ./
COPY --from=build /workspace/apps/tenant-portal-web/.next/static ./apps/tenant-portal-web/.next/static
COPY --from=build /workspace/apps/tenant-portal-web/public ./apps/tenant-portal-web/public

EXPOSE 3000
CMD ["node", "apps/tenant-portal-web/server.js"]
