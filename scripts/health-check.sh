#!/bin/bash
# ============================================
# SyncPlay - Health Check Script
# ============================================
# Quick script to check if everything is running.
# Run this anytime you want to verify the app status.
#
# Usage: bash health-check.sh
# ============================================

echo "🏥 SyncPlay Health Check"
echo "========================"
echo ""

# Check backend API
echo -n "Backend API (port 3001): "
if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "✅ HEALTHY"
    curl -s http://localhost:3001/api/health | python3 -m json.tool 2>/dev/null || true
else
    echo "❌ UNREACHABLE"
fi
echo ""

# Check frontend
echo -n "Frontend (port 80): "
if curl -sf http://localhost:80 > /dev/null 2>&1; then
    echo "✅ HEALTHY"
else
    echo "❌ UNREACHABLE"
fi
echo ""

# Show running containers
echo "📊 Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Docker not available"
echo ""

# Show resource usage
echo "💾 Resource Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || echo "Docker not available"
