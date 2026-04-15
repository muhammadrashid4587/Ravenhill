#!/bin/bash
# Start the full dev environment

set -e

echo "Starting e-agent dev environment..."

# Start infrastructure (Postgres + Redis)
echo "Starting database and cache..."
# Use docker-compose v1 if v2 plugin not available
if docker compose version > /dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi
$COMPOSE up -d

# Wait for Postgres to be ready
echo "Waiting for Postgres..."
until $COMPOSE exec -T db pg_isready -U eagent > /dev/null 2>&1; do
  sleep 1
done
echo "Postgres ready."

# Start API server
echo "Starting API server..."
cd packages/api
# Activate venv if it exists
if [ -f .venv/bin/activate ]; then
  source .venv/bin/activate
fi
uvicorn main:app --reload --port 8000 &
API_PID=$!
cd ../..

# Start web dev server
echo "Starting web server..."
cd packages/web
npm run dev &
WEB_PID=$!
cd ../..

echo ""
echo "e-agent is running:"
echo "  API:  http://localhost:8000"
echo "  Web:  http://localhost:3000"
echo "  Docs: http://localhost:8000/docs"
echo ""

# Wait for either process to exit
wait $API_PID $WEB_PID
