FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM deps AS prisma-client
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN node_modules/.bin/prisma generate --config prisma7.config.ts

FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini openssl \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
 && corepack disable || true

WORKDIR /app
ENV NODE_ENV=production PORT=4000

COPY package.json package-lock.json tsconfig.json prisma7.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma-client /app/src/generated ./src/generated

USER node
EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "src/index.ts"]