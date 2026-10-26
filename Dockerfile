FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM deps AS prisma-client
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN node_modules/.bin/prisma generate --config prisma7.config.ts

FROM node:22-alpine
RUN apk upgrade --no-cache \
 && apk add --no-cache tini openssl \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/lib/node_modules/corepack /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app
ENV NODE_ENV=production PORT=4000

COPY package.json package-lock.json tsconfig.json prisma7.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma-client /app/src/generated ./src/generated

USER node
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx", "src/index.ts"]