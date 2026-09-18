# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-referral-embed-web" \
      org.opencontainers.image.description="DRTS Referral Embed Web"

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
COPY apps/referral-embed-web/package.json apps/referral-embed-web/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ARG DRTS_CANDIDATE_SHA
ENV DRTS_CANDIDATE_SHA=$DRTS_CANDIDATE_SHA
COPY apps/referral-embed-web/ apps/referral-embed-web/
COPY tsconfig.base.json .

RUN pnpm --filter @drts/ui-tokens build && \
    pnpm --filter @drts/referral-embed-web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3014

WORKDIR /app

COPY --from=build /workspace/apps/referral-embed-web/.next/standalone ./
COPY --from=build /workspace/apps/referral-embed-web/.next/static ./apps/referral-embed-web/.next/static

EXPOSE 3014
CMD ["node", "apps/referral-embed-web/server.js"]
