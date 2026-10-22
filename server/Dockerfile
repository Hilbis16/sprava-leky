FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
RUN npm ci --omit=dev --workspace server --include-workspace-root=false --legacy-peer-deps --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node server/src ./server/src
COPY --chown=node:node src/domain/validation.ts ./src/domain/validation.ts
COPY --chown=node:node server/migrations ./server/migrations
WORKDIR /app/server
USER node
EXPOSE 3001
CMD ["npm", "start"]
