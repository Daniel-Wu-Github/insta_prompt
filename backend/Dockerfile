FROM oven/bun:1.1-alpine

WORKDIR /app

# Copy package.json and lockfile from the backend folder in the repo root
# when building with the repo root as the Docker context.
COPY backend/package.json backend/bun.lock ./
RUN bun install

# Copy only the application source and shared code into the image so
# runtime imports such as '../../../shared/contracts' resolve correctly.
COPY backend/src ./src
COPY shared ./shared


ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
