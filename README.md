# Bun vs Node.js Benchmark

Real-world benchmark comparing Bun and Node.js for a Todo application with PostgreSQL database.

## Benchmark Results

| Metric | Node.js/npm | Bun | Winner |
|--------|-------------|-----|--------|
| **Local Install** | 34.2s | 10.35s | **Bun (3.3x faster)** |
| **Docker Install** | 5.2s | 5.0s | Roughly equal |
| **Local Startup** | 1195ms | 1452ms | Node.js |
| **Docker Startup** | 1338ms | 1481ms | Node.js |
| **Module Loading** | 104ms | 129ms | Node.js |

## Key Findings

1. **Install Speed**: Bun is ~3.3x faster for package installation locally (not 30x as claimed)
2. **Startup Speed**: Node.js is slightly faster for startup (not 4x slower as claimed)
3. **Database Connection**: Dominates startup time (~1.2s), making runtime differences minimal
4. **Docker Production**: Both perform similarly in containerized environments

## Project Structure

```
├── nodejs/          # Node.js + npm version
│   ├── server.js    # Express server with timing
│   ├── package.json # 50+ dependencies
│   └── Dockerfile
├── bun/             # Bun version (identical app)
│   ├── server.js    # Same Express server
│   ├── package.json # Same dependencies
│   └── Dockerfile
└── .env             # Database connection
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
# Node.js
cd nodejs && docker build -t todo-nodejs .

# Bun
cd bun && docker build -t todo-bun .
```

### Run
```bash
docker run -p 3000:3000 -e DATABASE_CONNECTION_STRING="your-db-url" todo-nodejs
docker run -p 3000:3000 -e DATABASE_CONNECTION_STRING="your-db-url" todo-bun
```

## API Endpoints

- `GET /api/health` - Health check with timing info
- `GET /api/todos` - List all todos
- `POST /api/todos` - Create a todo
- `PATCH /api/todos/:id` - Toggle todo completion
- `DELETE /api/todos/:id` - Delete a todo

## Environment Variables

- `DATABASE_CONNECTION_STRING` - PostgreSQL connection URL
- `PORT` - Server port (default: 3000)
