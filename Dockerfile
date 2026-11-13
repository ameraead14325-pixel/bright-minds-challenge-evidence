FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY server ./server
COPY public ./public
COPY db ./db
RUN mkdir -p /data && chown -R node:node /data /app
USER node
ENV DATABASE_PATH=/data/shawahid.db PORT=3000
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
