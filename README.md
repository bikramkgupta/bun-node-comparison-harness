# Bun vs Node.js Benchmark (v2)

Real-world benchmark comparing Bun and Node.js for a Todo application with **100 packages, no database** (pure runtime comparison).

## Benchmark Results

### v2: 100 Packages, No Database (In-Memory Storage)

| Metric | Node.js/npm | Bun | Winner |
|--------|-------------|-----|--------|
| **Local Install** | 40.6s | 7.79s | **Bun (5.2x faster)** |
| **Local Startup** | 776ms | 528ms | **Bun (1.47x faster)** |
| **Module Loading (Local)** | 766ms | 511ms | **Bun (1.5x faster)** |
| **Docker Startup** | 258ms | 329ms | Node.js (1.28x faster) |

### v1: 50 Packages, With PostgreSQL Database

| Metric | Node.js/npm | Bun | Winner |
|--------|-------------|-----|--------|
| **Local Install** | 34.2s | 10.35s | **Bun (3.3x faster)** |
| **Local Startup** | 1195ms | 1452ms | Node.js |
| **Docker Startup** | 1338ms | 1481ms | Node.js |

## Key Findings

1. **Install Speed**: Bun is ~5x faster for package installation (not 30x as sometimes claimed)
2. **Startup Speed (Local)**: Bun is ~1.5x faster when no database is involved (not 4x as claimed)
3. **Startup Speed (Docker)**: Node.js is actually faster in containerized environments
4. **Database Impact**: Database connection time (~1.2s) dominates startup, hiding runtime differences

## Why Different from Bun's Claims?

- **Real-world overhead**: Express middleware, 100+ packages, and production patterns add complexity
- **Not micro-benchmarks**: This is a realistic Todo app, not isolated tests
- **Container environment**: Docker Alpine Linux behaves differently than local macOS

## Project Structure

```
├── nodejs/          # Node.js + npm version
│   ├── server.js    # Express server (in-memory storage)
│   ├── package.json # 100 dependencies
│   └── Dockerfile
├── bun/             # Bun version (identical app)
│   ├── server.js    # Same Express server
│   ├── package.json # Same dependencies
│   └── Dockerfile
└── README.md
```

## Running Locally

### Node.js
```bash
cd nodejs
npm install
npm start
```

### Bun
```bash
cd bun
bun install
bun run server.js
```

## Docker

### Build
```bash
docker build -t todo-nodejs nodejs/
docker build -t todo-bun bun/
```

### Run
```bash
docker run -p 3000:3000 todo-nodejs
docker run -p 3000:3000 todo-bun
```

## API Endpoints

- `GET /api/health` - Health check with timing info
- `GET /api/todos` - List all todos (in-memory)
- `POST /api/todos` - Create a todo
- `PATCH /api/todos/:id` - Toggle todo completion
- `DELETE /api/todos/:id` - Delete a todo

## Timing Info

The `/api/health` endpoint returns:
```json
{
  "status": "healthy",
  "runtime": "bun",
  "runtime_version": "1.3.1",
  "module_load_ms": 511,
  "modules_loaded": 1449,
  "uptime_ms": 5000,
  "process_start": "2025-12-18T04:47:36.260Z"
}
```

---

## Automated Performance Benchmark

This project includes an automated benchmark suite to validate Bun's performance claims against Node.js, based on metrics from the [Strapi article](https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide).

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Docker Compose Network                           │
│                       (benchmark-net)                                │
│                                                                      │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐       │
│  │    Bun App     │   │  Node.js App   │   │  Load Tester   │       │
│  │  (port 3001)   │   │  (port 3002)   │   │    (hey)       │       │
│  │                │   │                │   │                │       │
│  │  Express +     │   │  Express +     │   │  Runs tests    │       │
│  │  100 packages  │   │  100 packages  │   │  against both  │       │
│  │                │   │                │   │                │       │
│  │  Endpoints:    │   │  Endpoints:    │   │  Tests:        │       │
│  │  /api/health   │   │  /api/health   │   │  - Throughput  │       │
│  │  /api/todos    │   │  /api/todos    │   │  - CPU-heavy   │       │
│  │  /api/cpu-heavy│   │  /api/cpu-heavy│   │  - Fibonacci   │       │
│  │  /api/fibonacci│   │  /api/fibonacci│   │                │       │
│  └────────────────┘   └────────────────┘   └────────────────┘       │
│          ▲                    ▲                    │                 │
│          │                    │                    │                 │
│          └────────────────────┴────────────────────┘                 │
│                        HTTP Requests                                 │
│                                                                      │
│  Results saved to: ./results/BENCHMARK-REPORT.md                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Test Methodology

#### 1. HTTP Throughput Test
- **Tool:** `hey` (Go-based HTTP load testing)
- **Duration:** 240 seconds per test
- **Concurrency:** 50 simultaneous connections
- **Endpoints:** `/api/todos`, `/api/health`
- **Metric:** Requests per second

#### 2. CPU-Heavy Task Test
- **Task:** Generate and sort 100,000 random numbers
- **Iterations:** 10 runs per runtime
- **Endpoint:** `GET /api/cpu-heavy`
- **Metric:** Execution time in milliseconds

#### 3. Fibonacci Computation Test
- **Task:** Recursive Fibonacci(40) calculation
- **Iterations:** 5 runs per runtime
- **Endpoint:** `GET /api/fibonacci/40`
- **Metric:** Execution time in milliseconds

### Running the Benchmark

```bash
# Build and run all containers
docker compose up --build

# Wait for tests to complete (~20 minutes)
# Results are automatically saved to ./results/

# View the report
cat results/BENCHMARK-REPORT.md

# Clean up
docker compose down
```

### Expected Results (per Strapi article)

| Metric          | Node.js   | Bun       | Expected Improvement |
|-----------------|-----------|-----------|----------------------|
| HTTP req/s      | ~13,000   | ~52,000   | 4x faster            |
| CPU task (100k) | ~3,400ms  | ~1,700ms  | 2x faster            |

### Project Structure

```
├── bun/                  # Bun runtime application
│   ├── Dockerfile
│   ├── server.js         # Express server with benchmark endpoints
│   ├── package.json      # 100 dependencies
│   └── src/              # React frontend
├── nodejs/               # Node.js runtime application
│   ├── Dockerfile
│   ├── server.js         # Same Express server
│   ├── package.json      # Same dependencies
│   └── src/              # Same React frontend
├── load-tester/          # Benchmark runner container
│   ├── Dockerfile
│   └── benchmark.sh      # Test orchestration script
├── results/              # Test results output (created on run)
├── docker-compose.yml    # Orchestration
└── README.md             # This file
```

### Benchmark Endpoints

In addition to the standard Todo API, both apps expose:

- `GET /api/cpu-heavy` - Generate and sort 100,000 random numbers
  ```json
  {
    "runtime": "bun",
    "operation": "generate_and_sort_100k_numbers",
    "duration_ms": 45,
    "array_length": 100000
  }
  ```

- `GET /api/fibonacci/:n` - Recursive Fibonacci calculation
  ```json
  {
    "runtime": "bun",
    "operation": "fibonacci",
    "n": 40,
    "result": 102334155,
    "duration_ms": 892
  }
  ```
