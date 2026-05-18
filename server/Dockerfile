# ============================================
# SyncPlay Server - Dockerfile
# ============================================
# This builds the Node.js backend into a Docker image
# Think of it as packaging your server into a box
# that can run anywhere (your laptop, EC2, etc.)
# ============================================

# Start with a lightweight Node.js image (Alpine = small Linux)
FROM node:20-alpine

# Set the working directory inside the container
# All commands after this will run inside /app
WORKDIR /app

# Copy package files FIRST (Docker caches this layer)
# This means if your code changes but packages don't,
# Docker won't re-install packages (saves time!)
COPY package.json package-lock.json* ./

# Install ONLY production dependencies (no devDependencies)
RUN npm install --omit=dev

# Now copy the rest of the server code
COPY . .

# Create the uploads directory inside the container
RUN mkdir -p /app/uploads/stories

# The server listens on port 3001
EXPOSE 3001

# Health check - Docker will ping this every 30 seconds
# If it fails 3 times, Docker marks container as "unhealthy"
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start the server
CMD ["node", "src/index.js"]
