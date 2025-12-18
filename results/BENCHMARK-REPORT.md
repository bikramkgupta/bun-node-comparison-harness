# Bun vs Node.js Performance Benchmark Results

**Generated:** 2025-12-18 05:59:35 UTC

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Test Duration | 240s |
| Concurrency | 50 workers |
| CPU Test Iterations | 10 |
| Fibonacci Iterations | 5 |

---

## HTTP Throughput Results

### /api/todos Endpoint

| Runtime | Requests/sec | Improvement |
|---------|-------------|-------------|
| **Bun** | 23767.7784 | **2.99x** |
| Node.js | 7938.9353 | baseline |

### /api/health Endpoint

| Runtime | Requests/sec |
|---------|-------------|
| **Bun** | 22130.8974 |
| Node.js | 4602.2713 |

---

## CPU-Heavy Task Results

**Task:** Generate and sort 100,000 random numbers

| Runtime | Avg Time (ms) | Improvement |
|---------|--------------|-------------|
| **Bun** | 17 | **1.88x faster** |
| Node.js | 32 | baseline |

---

## Fibonacci(40) Results

**Task:** Recursive Fibonacci calculation (n=40)

| Runtime | Avg Time (ms) | Improvement |
|---------|--------------|-------------|
| **Bun** | 491 | **2.60x faster** |
| Node.js | 1279 | baseline |

---

## Comparison with Strapi Article Claims

| Metric | Article Claims | Our Results | Match? |
|--------|---------------|-------------|--------|
| HTTP req/s (Bun) | ~52,000 | 23767.7784 | - |
| HTTP req/s (Node) | ~13,000 | 7938.9353 | - |
| HTTP improvement | 4x | 2.99x | - |
| CPU task (Bun) | 1,700ms | 17ms | - |
| CPU task (Node) | 3,400ms | 32ms | - |
| CPU improvement | 2x | 1.88x | - |

---

## Summary

- **HTTP Throughput:** Bun achieved 23767.7784 req/s vs Node.js 7938.9353 req/s (**2.99x faster**)
- **CPU-Heavy Task:** Bun completed in 17ms vs Node.js 32ms (**1.88x faster**)
- **Fibonacci:** Bun completed in 491ms vs Node.js 1279ms (**2.60x faster**)

---

## Raw Data Files

- `bun-throughput-todos.json`
- `nodejs-throughput-todos.json`
- `bun-throughput-health.json`
- `nodejs-throughput-health.json`
- `bun-cpu-heavy.json`
- `nodejs-cpu-heavy.json`
- `bun-fibonacci.json`
- `nodejs-fibonacci.json`
