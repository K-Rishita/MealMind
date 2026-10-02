# syntax=docker/dockerfile:1

# ---- 1. Build the React frontend ----
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY Recipes.json /app/Recipes.json
# Vite inlines VITE_* values at build time. These are public client config, not secrets.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
RUN npm run build

# ---- 2. Compile the API ----
FROM node:20-alpine AS api
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/ ./
RUN npm run build

# ---- 3. Small runtime image ----
FROM node:20-alpine AS runtime
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
