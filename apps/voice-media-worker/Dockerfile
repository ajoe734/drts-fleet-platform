# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base

LABEL org.opencontainers.image.source="drts-fleet-platform" \
      org.opencontainers.image.title="drts-voice-media-worker" \
      org.opencontainers.image.description="DRTS Voice Media Worker"

ENV CI=1 \
    HUSKY=0 \
    PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:/node_modules/.bin:$PATH

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace

FROM base AS deps

# Install dependencies for the whole workspace (pnpm workspaces)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/voice-media-worker/package.json apps/voice-media-worker/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build

# Copy full source and build contracts + voice-media-worker
COPY apps/voice-media-worker/ apps/voice-media-worker/
COPY tsconfig.base.json .

RUN pnpm --filter @drts/contracts build && \
    pnpm --filter @drts/voice-media-worker build

# pnpm deploy creates a self-contained flat node_modules (no workspace symlinks)
RUN pnpm --filter @drts/voice-media-worker --prod deploy --legacy /deploy/worker

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    VOICE_MEDIA_PORT=3002

WORKDIR /app

# Deployed node_modules: flat, no symlinks, workspace deps are embedded
COPY --from=build /deploy/worker/node_modules ./node_modules
COPY --from=build /deploy/worker/package.json ./package.json
# Built output from build stage
COPY --from=build /workspace/apps/voice-media-worker/dist ./dist

EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.VOICE_MEDIA_PORT||3002)+'/health',res=>{process.exit(res.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
