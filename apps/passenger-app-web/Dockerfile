# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-passenger-app-web"

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
COPY apps/passenger-app-web/package.json apps/passenger-app-web/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ARG DRTS_CANDIDATE_SHA
ENV DRTS_CANDIDATE_SHA=$DRTS_CANDIDATE_SHA
COPY apps/passenger-app-web/ apps/passenger-app-web/
COPY tsconfig.base.json .
RUN mkdir -p apps/passenger-app-web/public && \
    pnpm --filter @drts/contracts build && \
    pnpm --filter @drts/ui-tokens build && \
    pnpm --filter @drts/ui-web build && \
    pnpm --filter @drts/passenger-client build && \
    pnpm --filter @drts/passenger-app-web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3009
WORKDIR /app
COPY --from=build /workspace/apps/passenger-app-web/.next/standalone ./
COPY --from=build /workspace/apps/passenger-app-web/.next/static ./apps/passenger-app-web/.next/static
COPY --from=build /workspace/apps/passenger-app-web/public ./apps/passenger-app-web/public
EXPOSE 3009
CMD ["node", "apps/passenger-app-web/server.js"]
