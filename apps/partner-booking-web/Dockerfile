# syntax=docker/dockerfile:1.7
#
# Partner Booking is now part of the shared dev deploy: the same image serves
# credit-card airport transfer, insurance replacement, and travel-agency flows.

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-partner-booking-web" \
      org.opencontainers.image.description="DRTS Phase 1 white-label partner booking surface"

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
COPY apps/partner-booking-web/package.json apps/partner-booking-web/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/partner-booking-web/ apps/partner-booking-web/
COPY tsconfig.base.json .

RUN pnpm --filter @drts/ui-tokens build && \
    pnpm --filter @drts/partner-booking-web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3007

WORKDIR /app

COPY --from=build /workspace/apps/partner-booking-web/.next/standalone ./
COPY --from=build /workspace/apps/partner-booking-web/.next/static ./apps/partner-booking-web/.next/static
COPY --from=build /workspace/apps/partner-booking-web/public ./apps/partner-booking-web/public

EXPOSE 3007
CMD ["node", "apps/partner-booking-web/server.js"]
