# Stage 1: build the Evently page (React + Vite) into static files.
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# Stage 2: the API server. Zero runtime dependencies, so it is just Node + source + built page.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node --from=web /web/dist ./web/dist

# Run as the unprivileged user that ships with the official image.
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "server.js"]
