#!/bin/bash
# ============================================
# SyncPlay - EC2 Deployment Script
# ============================================
# This script runs ON the EC2 instance.
# It pulls new images and restarts containers.
#
# Usage: bash deploy.sh
# ============================================

set -e  # Stop on any error

echo "🚀 SyncPlay Deployment Starting..."
echo "=================================="
echo "Time: $(date)"
echo ""

# Navigate to the project directory on EC2
cd /home/ubuntu/syncplay

# Step 1: Pull latest images
echo "📦 Step 1: Pulling latest Docker images..."
docker compose pull
echo "✅ Images pulled!"
echo ""

# Step 2: Stop old containers (gracefully)
echo "⏹️  Step 2: Stopping old containers..."
docker compose down
echo "✅ Old containers stopped!"
echo ""

# Step 3: Start new containers
echo "▶️  Step 3: Starting new containers..."
docker compose up -d
echo "✅ Containers started!"
echo ""

# Step 4: Wait for startup
echo "⏳ Step 4: Waiting 15 seconds for startup..."
sleep 15

# Step 5: Health check
echo "🏥 Step 5: Running health checks..."

# Check backend
if curl -sf http://localhost:3001/api/health > /dev/null; then
    echo "  ✅ Backend is healthy!"
else
    echo "  ❌ Backend health check FAILED!"
    echo "  📋 Backend logs:"
    docker logs syncplay-server --tail 20
    exit 1
fi

# Check frontend
if curl -sf http://localhost:80 > /dev/null; then
    echo "  ✅ Frontend is healthy!"
else
    echo "  ❌ Frontend health check FAILED!"
    echo "  📋 Frontend logs:"
    docker logs syncplay-client --tail 20
    exit 1
fi

echo ""

# Step 6: Show container status
echo "📊 Container Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Step 7: Clean up old images
echo "🧹 Cleaning up old Docker images..."
docker image prune -f
echo ""

echo "=================================="
echo "🎉 Deployment Complete!"
echo "=================================="
