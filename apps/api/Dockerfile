# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-api" \
      org.opencontainers.image.description="DRTS Phase1 API"

ENV CI=1 \
    HUSKY=0 \
    PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:/node_modules/.bin:$PATH

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace

FROM base AS deps

# Install dependencies for the whole workspace (pnpm workspaces)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/*/package.json packages/
COPY apps/api/package.json apps/api/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build

# Copy sources and build contracts + API
COPY packages ./packages
COPY apps/api ./apps/api
COPY tsconfig.base.json .

RUN pnpm --filter @drts/contracts build && \
    pnpm --filter @drts/api build

# pnpm deploy creates a self-contained flat node_modules (no workspace symlinks)
# that is safe to COPY into the runtime stage
RUN pnpm --filter @drts/api --prod deploy /deploy/api

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    API_PORT=3001

WORKDIR /app

# Deployed node_modules: flat, no symlinks, workspace deps are embedded
COPY --from=build /deploy/api/node_modules ./node_modules
COPY --from=build /deploy/api/package.json ./package.json
# Built API output from the build stage (pnpm deploy doesn't include dist)
COPY --from=build /workspace/apps/api/dist ./dist

EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --retries=12 CMD node -e "require('http').get('http://127.0.0.1:'+process.env.API_PORT+'/health',res=>{process.exit(res.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
