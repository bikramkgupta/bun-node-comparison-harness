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
