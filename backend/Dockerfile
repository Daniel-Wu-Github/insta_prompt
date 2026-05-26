FROM oven/bun:1.1-alpine

WORKDIR /app

COPY backend/package.json backend/bun.lock ./
RUN bun install

COPY backend/src ./src
COPY shared ./shared

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
