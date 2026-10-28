# syntax=docker/dockerfile:1.7
#
# BUREAU-R13 regulatory agency read-only portal. A standalone public host
# (never behind IAP) that owns its own host-only agency session cookies.
# Deployment, domain mapping and OAuth redirect provisioning are IMPL-B.

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-agency-portal-web" \
      org.opencontainers.image.description="DRTS regulatory agency read-only portal"

ENV CI=1 \
    HUSKY=0 \
    PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:/node_modules/.bin:$PATH

RUN apk add --no-cache libc6-compat && \
    corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY patches/ patches/
COPY packages/ packages/
COPY apps/agency-portal-web/package.json apps/agency-portal-web/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ARG DRTS_CANDIDATE_SHA
ENV DRTS_CANDIDATE_SHA=$DRTS_CANDIDATE_SHA
COPY apps/agency-portal-web/ apps/agency-portal-web/
COPY tsconfig.base.json .

RUN pnpm --filter @drts/contracts build && \
    pnpm --filter @drts/ui-tokens build && \
    pnpm --filter @drts/ui-web build && \
    pnpm --filter @drts/agency-portal-web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3012

WORKDIR /app

COPY --from=build /workspace/apps/agency-portal-web/.next/standalone ./
COPY --from=build /workspace/apps/agency-portal-web/.next/static ./apps/agency-portal-web/.next/static
COPY --from=build /workspace/apps/agency-portal-web/public ./apps/agency-portal-web/public

EXPOSE 3012
CMD ["node", "apps/agency-portal-web/server.js"]
