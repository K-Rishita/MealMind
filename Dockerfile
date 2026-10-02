# syntax=docker/dockerfile:1

# ---- 1. Build the React frontend ----
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# No build args: Supabase config is served at runtime by the API (/config.js).
RUN npm run build

# ---- 2. Compile the API ----
FROM node:22-alpine AS api
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/ ./
RUN npm run build

# ---- 3. Small runtime image ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=./public
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=api /app/api/dist ./dist
COPY --from=frontend /app/frontend/build ./public
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
