#!/bin/bash
# Start the full dev environment

set -e

echo "Starting e-agent dev environment..."

# Start infrastructure (Postgres + Redis)
echo "Starting database and cache..."
docker compose up -d

# Wait for Postgres to be ready
echo "Waiting for Postgres..."
until docker compose exec db pg_isready -U eagent > /dev/null 2>&1; do
  sleep 1
done
echo "Postgres ready."

# Start API server
echo "Starting API server..."
cd packages/api
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
