FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8789
COPY package.json ./
RUN corepack enable && pnpm install --prod --frozen-lockfile=false
COPY --from=build /app/dist ./dist
COPY server ./server
RUN mkdir -p /app/data /app/uploads /app/backups
EXPOSE 8789
CMD ["node", "server/index.mjs"]
