# EventWise: zero runtime dependencies, so the image is just Node + source.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

# Run as the unprivileged user that ships with the official image.
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "server.js"]
