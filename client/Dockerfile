# ============================================
# SyncPlay Client - Dockerfile (Multi-Stage)
# ============================================
# Stage 1: Build the React app (using Node.js)
# Stage 2: Serve the built files (using Nginx)
#
# Why two stages? 
# - Node.js image is ~300MB (needed only to build)
# - Nginx image is ~25MB (only serves static files)
# - Final image is tiny and fast!
# ============================================

# ---------- STAGE 1: BUILD ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (for Docker cache)
COPY package.json package-lock.json* ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install

# Copy source code
COPY . .

# These are passed at build time via docker-compose or CI
# They get baked into the static JS bundle
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ARG VITE_CLERK_PUBLISHABLE_KEY

# Build the React app (creates /app/dist folder)
RUN npm run build


# ---------- STAGE 2: SERVE ----------
FROM nginx:alpine

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built React app from Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx listens on port 80
EXPOSE 80

# Start nginx in the foreground (required for Docker)
CMD ["nginx", "-g", "daemon off;"]
