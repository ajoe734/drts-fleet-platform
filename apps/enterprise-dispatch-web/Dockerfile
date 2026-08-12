# syntax=docker/dockerfile:1.7
#
# Enterprise Dispatch is a standalone employee self-service surface. It is
# deployed separately from tenant-console because it has distinct routing,
# chrome, and identity hand-off semantics.

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-enterprise-dispatch-web" \
      org.opencontainers.image.description="DRTS enterprise dispatch employee self-service surface"

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
COPY apps/enterprise-dispatch-web/package.json apps/enterprise-dispatch-web/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ARG DRTS_CANDIDATE_SHA
ENV DRTS_CANDIDATE_SHA=$DRTS_CANDIDATE_SHA
COPY apps/enterprise-dispatch-web/ apps/enterprise-dispatch-web/
COPY tsconfig.base.json .

RUN pnpm --filter @drts/contracts build && \
    pnpm --filter @drts/ui-tokens build && \
    pnpm --filter @drts/ui-web build && \
    pnpm --filter @drts/enterprise-dispatch-web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3010

WORKDIR /app

COPY --from=build /workspace/apps/enterprise-dispatch-web/.next/standalone ./
COPY --from=build /workspace/apps/enterprise-dispatch-web/.next/static ./apps/enterprise-dispatch-web/.next/static
COPY --from=build /workspace/apps/enterprise-dispatch-web/public ./apps/enterprise-dispatch-web/public

EXPOSE 3010
CMD ["node", "apps/enterprise-dispatch-web/server.js"]
