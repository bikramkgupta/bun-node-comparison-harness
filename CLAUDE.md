# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Bun vs Node.js Performance Benchmark** project comparing runtime performance using identical Express Todo applications with 100 npm packages and in-memory storage (no database).

## Commands

### Bun Application (in `bun/` directory)
```bash
bun install                    # Install dependencies
bun run server.js              # Start server
bun --watch server.js          # Development with auto-reload
bun build ./src/index.jsx --outdir ./public --minify  # Build React frontend
```

### Node.js Application (in `nodejs/` directory)
```bash
npm install                    # Install dependencies
npm start                      # Start server (node server.js)
npm run dev                    # Development with nodemon
npm run build                  # Webpack production build
```

### Web Dashboard (Recommended)
```bash
docker compose up --build      # Build and run all containers
# Open http://localhost:8080   # Access the benchmark dashboard
docker compose down            # Clean up
```

### CLI Benchmark (Legacy)
```bash
docker compose run --rm load-tester /benchmark.sh  # Run CLI benchmark
cat results/BENCHMARK-REPORT.md                     # View results
```

### Individual Docker Containers
```bash
docker build -t todo-bun bun/
docker build -t todo-nodejs nodejs/
docker run -p 3001:3000 todo-bun
docker run -p 3002:3000 todo-nodejs
```

## Architecture

### Project Structure
- **`bun/`** and **`nodejs/`** contain identical Express applications differing only in runtime
- **`load-tester/`** contains the benchmark orchestration (uses `hey` for HTTP load testing)
- **`results/`** stores benchmark output (JSON data + markdown report)
- **`docker-compose.yml`** orchestrates all three containers on a bridge network

### Runtime Comparison Design
Both apps are intentionally identical:
- Same 100 npm dependencies (date libs, HTTP clients, ORMs, validation, logging, etc.)
- Same Express server code with timing instrumentation
- Same React frontend
- Same API endpoints

### Docker Compose Services
| Service | Port | Purpose |
|---------|------|---------|
| bun-app | 3001 | Bun runtime (oven/bun:1.1-alpine) |
| nodejs-app | 3002 | Node.js runtime (node:22-alpine) |
| load-tester | 8080 | Web dashboard for benchmarks (Bun HTTP server) |

## API Endpoints

All endpoints identical in both apps:

```
GET  /api/health           # Runtime info, timing metrics, module count
GET  /api/todos            # List todos (in-memory)
POST /api/todos            # Create todo {title: string}
PATCH /api/todos/:id       # Toggle completion
DELETE /api/todos/:id      # Delete todo

# Benchmark-specific endpoints
GET /api/cpu-heavy              # Generate/sort 100k numbers
GET /api/fibonacci/:n           # Recursive Fibonacci (max n=45)
GET /api/json-benchmark/:size   # JSON parse/serialize (small, medium, large)
GET /api/network/download/:kb   # Download payload for egress test (max 10MB)
POST /api/network/upload        # Upload payload for inbound test (max 50MB)
GET /api/network/hold/:ms       # Hold connection for concurrent session test
```

## Benchmark Test Types

The dashboard supports 9 benchmark types:

| Test Type | Description | Metric |
|-----------|-------------|--------|
| `throughput-todos` | HTTP throughput on /api/todos | Requests/sec |
| `throughput-health` | HTTP throughput on /api/health | Requests/sec |
| `cpu-heavy` | Generate and sort 100k numbers | ms per operation |
| `fibonacci` | Recursive Fibonacci(40) calculation | ms per operation |
| `json-processing` | JSON stringify/parse of nested objects | ms per operation |
| `network-egress` | Server → Client download throughput | Mbps |
| `network-inbound` | Client → Server upload throughput | Mbps |
| `concurrent-sessions` | Max sustained concurrent connections | Connection count |
| `full-suite` | Run all tests sequentially | Combined metrics |

### Parallel Execution

All tests run **Bun and Node.js in parallel** for:
- Fairer comparison (identical system conditions)
- ~50% faster total benchmark time
- More realistic load testing (both servers stressed simultaneously)

## Benchmark Configuration

Environment variables for load-tester:
- `TEST_DURATION` - HTTP test duration (default: 240s)
- `CONCURRENCY` - Simultaneous connections (default: 50)
- `BUN_HOST` / `NODEJS_HOST` - Container hostnames

## Key Files

| File | Purpose |
|------|---------|
| `*/server.js` | Express server with timing instrumentation |
| `*/Dockerfile` | Alpine containers with install timing |
| `load-tester/server.js` | Bun HTTP server for dashboard |
| `load-tester/runner.js` | Benchmark execution module |
| `load-tester/public/index.html` | Dashboard UI (dark theme) |
| `load-tester/benchmark.sh` | Legacy CLI benchmark script |
| `docker-compose.yml` | Service orchestration with healthchecks |

## Dashboard API Endpoints

The load-tester dashboard (http://localhost:8080) exposes:

```
GET  /api/tests           # List available test types
GET  /api/health          # Dashboard health check
GET  /api/services        # Check Bun/Node.js app status
POST /api/run             # Start benchmark {testType, duration, concurrency}
GET  /api/status/:runId   # Get run status and progress
GET  /api/reports         # List historical benchmark runs
GET  /api/reports/:id     # Get specific run details
```

## Timing Instrumentation

Both servers measure and expose:
- `PROCESS_START_TIME` - When process started
- `MODULE_LOAD_TIME` - Time to load all 100 packages
- Available via `/api/health` endpoint

Dockerfiles measure:
- Package install start/end times
- Install duration in milliseconds
