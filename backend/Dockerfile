# Multi-stage build for Hetzner / container deploy (PM2 path remains in infra/deploy.sh).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# Keep tsx available so the container can run migrations on start (parity with
# infra/deploy.sh which runs `npm run db:migrate` before the app boots).
RUN npm ci --omit=dev && npm i -g tsx
COPY --from=build /app/dist ./dist
COPY src/db ./src/db
COPY tsconfig.json drizzle.config.ts ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
