#!/bin/bash

# ============================================
# Bun vs Node.js Performance Benchmark Script
# ============================================

set -e

# Configuration from environment variables
DURATION="${TEST_DURATION:-240s}"
CONCURRENCY="${CONCURRENCY:-50}"
BUN_URL="http://${BUN_HOST:-bun-app}:3000"
NODEJS_URL="http://${NODEJS_HOST:-nodejs-app}:3000"
RESULTS_DIR="/results"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create results directory
mkdir -p "$RESULTS_DIR"

echo ""
echo "============================================"
echo "  Bun vs Node.js Performance Benchmark"
echo "============================================"
echo ""
echo "Configuration:"
echo "  - Test Duration: $DURATION"
echo "  - Concurrency: $CONCURRENCY workers"
echo "  - Bun URL: $BUN_URL"
echo "  - Node.js URL: $NODEJS_URL"
echo ""

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 5

# Verify services are up
echo -e "${BLUE}Checking service health...${NC}"
BUN_HEALTH=$(curl -s "$BUN_URL/api/health" | jq -r '.runtime // "unknown"')
NODEJS_HEALTH=$(curl -s "$NODEJS_URL/api/health" | jq -r '.runtime // "unknown"')

echo "  Bun app: $BUN_HEALTH"
echo "  Node.js app: $NODEJS_HEALTH"

if [ "$BUN_HEALTH" != "bun" ] || [ "$NODEJS_HEALTH" != "node" ]; then
    echo -e "${RED}ERROR: Services not ready${NC}"
    exit 1
fi

echo -e "${GREEN}Services are ready!${NC}"
echo ""

# ============================================
# Function to run hey and extract metrics
# ============================================
run_throughput_test() {
    local name=$1
    local url=$2
    local endpoint=$3
    local output_file=$4

    echo -e "${BLUE}Running throughput test: $name - $endpoint${NC}"

    # Run hey and capture output
    hey -z "$DURATION" -c "$CONCURRENCY" "${url}${endpoint}" > "/tmp/${output_file}.txt" 2>&1

    # Extract metrics from hey output
    local rps=$(grep "Requests/sec:" "/tmp/${output_file}.txt" | awk '{print $2}')
    local avg_latency=$(grep "Average:" "/tmp/${output_file}.txt" | head -1 | awk '{print $2}')
    local p99_latency=$(grep "99%" "/tmp/${output_file}.txt" | awk '{print $2}')
    local total_requests=$(grep "Total:" "/tmp/${output_file}.txt" | head -1 | awk '{print $2}')

    # Save as JSON
    cat > "${RESULTS_DIR}/${output_file}.json" << EOF
{
    "test": "$name",
    "endpoint": "$endpoint",
    "duration": "$DURATION",
    "concurrency": $CONCURRENCY,
    "requests_per_second": ${rps:-0},
    "avg_latency_secs": "${avg_latency:-0}",
    "p99_latency_secs": "${p99_latency:-0}",
    "total_requests": ${total_requests:-0}
}
EOF

    echo "  Requests/sec: $rps"
    echo "  Avg latency: $avg_latency"
    echo "  P99 latency: $p99_latency"
    echo ""
}

# ============================================
# Function to run CPU-heavy tests
# ============================================
run_cpu_test() {
    local name=$1
    local url=$2
    local iterations=$3
    local output_file=$4

    echo -e "${BLUE}Running CPU-heavy test: $name (${iterations} iterations)${NC}"

    local total_time=0
    local times=()

    for i in $(seq 1 $iterations); do
        local result=$(curl -s "${url}/api/cpu-heavy")
        local duration=$(echo "$result" | jq -r '.duration_ms')
        times+=($duration)
        total_time=$((total_time + duration))
        echo "  Iteration $i: ${duration}ms"
    done

    local avg_time=$((total_time / iterations))

    # Calculate min and max
    local min_time=${times[0]}
    local max_time=${times[0]}
    for t in "${times[@]}"; do
        if [ "$t" -lt "$min_time" ]; then min_time=$t; fi
        if [ "$t" -gt "$max_time" ]; then max_time=$t; fi
    done

    # Save as JSON
    cat > "${RESULTS_DIR}/${output_file}.json" << EOF
{
    "test": "$name",
    "operation": "generate_and_sort_100k_numbers",
    "iterations": $iterations,
    "avg_duration_ms": $avg_time,
    "min_duration_ms": $min_time,
    "max_duration_ms": $max_time,
    "all_durations_ms": [$(IFS=,; echo "${times[*]}")]
}
EOF

    echo "  Average: ${avg_time}ms"
    echo "  Min: ${min_time}ms, Max: ${max_time}ms"
    echo ""
}

# ============================================
# Function to run Fibonacci tests
# ============================================
run_fibonacci_test() {
    local name=$1
    local url=$2
    local n=$3
    local iterations=$4
    local output_file=$5

    echo -e "${BLUE}Running Fibonacci($n) test: $name (${iterations} iterations)${NC}"

    local total_time=0
    local times=()

    for i in $(seq 1 $iterations); do
        local result=$(curl -s "${url}/api/fibonacci/${n}")
        local duration=$(echo "$result" | jq -r '.duration_ms')
        times+=($duration)
        total_time=$((total_time + duration))
        echo "  Iteration $i: ${duration}ms"
    done

    local avg_time=$((total_time / iterations))

    # Save as JSON
    cat > "${RESULTS_DIR}/${output_file}.json" << EOF
{
    "test": "$name",
    "operation": "fibonacci",
    "n": $n,
    "iterations": $iterations,
    "avg_duration_ms": $avg_time,
    "all_durations_ms": [$(IFS=,; echo "${times[*]}")]
}
EOF

    echo "  Average: ${avg_time}ms"
    echo ""
}

# ============================================
# Run All Tests
# ============================================

echo "============================================"
echo "  HTTP Throughput Tests (hey)"
echo "============================================"
echo ""

# Throughput tests - /api/todos endpoint
run_throughput_test "Bun" "$BUN_URL" "/api/todos" "bun-throughput-todos"
run_throughput_test "Node.js" "$NODEJS_URL" "/api/todos" "nodejs-throughput-todos"

# Throughput tests - /api/health endpoint
run_throughput_test "Bun" "$BUN_URL" "/api/health" "bun-throughput-health"
run_throughput_test "Node.js" "$NODEJS_URL" "/api/health" "nodejs-throughput-health"

echo "============================================"
echo "  CPU-Heavy Tests (100k sort)"
echo "============================================"
echo ""

# CPU-heavy tests
run_cpu_test "Bun" "$BUN_URL" 10 "bun-cpu-heavy"
run_cpu_test "Node.js" "$NODEJS_URL" 10 "nodejs-cpu-heavy"

echo "============================================"
echo "  Fibonacci Tests (n=40)"
echo "============================================"
echo ""

# Fibonacci tests
run_fibonacci_test "Bun" "$BUN_URL" 40 5 "bun-fibonacci"
run_fibonacci_test "Node.js" "$NODEJS_URL" 40 5 "nodejs-fibonacci"

# ============================================
# Generate Report
# ============================================

echo "============================================"
echo "  Generating Report"
echo "============================================"
echo ""

# Read results for report
BUN_TODOS_RPS=$(jq -r '.requests_per_second' "$RESULTS_DIR/bun-throughput-todos.json")
NODEJS_TODOS_RPS=$(jq -r '.requests_per_second' "$RESULTS_DIR/nodejs-throughput-todos.json")
BUN_HEALTH_RPS=$(jq -r '.requests_per_second' "$RESULTS_DIR/bun-throughput-health.json")
NODEJS_HEALTH_RPS=$(jq -r '.requests_per_second' "$RESULTS_DIR/nodejs-throughput-health.json")

BUN_CPU_AVG=$(jq -r '.avg_duration_ms' "$RESULTS_DIR/bun-cpu-heavy.json")
NODEJS_CPU_AVG=$(jq -r '.avg_duration_ms' "$RESULTS_DIR/nodejs-cpu-heavy.json")

BUN_FIB_AVG=$(jq -r '.avg_duration_ms' "$RESULTS_DIR/bun-fibonacci.json")
NODEJS_FIB_AVG=$(jq -r '.avg_duration_ms' "$RESULTS_DIR/nodejs-fibonacci.json")

# Calculate improvements
THROUGHPUT_IMPROVEMENT=$(echo "scale=2; $BUN_TODOS_RPS / $NODEJS_TODOS_RPS" | bc)
CPU_IMPROVEMENT=$(echo "scale=2; $NODEJS_CPU_AVG / $BUN_CPU_AVG" | bc)
FIB_IMPROVEMENT=$(echo "scale=2; $NODEJS_FIB_AVG / $BUN_FIB_AVG" | bc)

# Generate markdown report
cat > "$RESULTS_DIR/BENCHMARK-REPORT.md" << EOF
# Bun vs Node.js Performance Benchmark Results

**Generated:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Test Duration | $DURATION |
| Concurrency | $CONCURRENCY workers |
| CPU Test Iterations | 10 |
| Fibonacci Iterations | 5 |

---

## HTTP Throughput Results

### /api/todos Endpoint

| Runtime | Requests/sec | Improvement |
|---------|-------------|-------------|
| **Bun** | $BUN_TODOS_RPS | **${THROUGHPUT_IMPROVEMENT}x** |
| Node.js | $NODEJS_TODOS_RPS | baseline |

### /api/health Endpoint

| Runtime | Requests/sec |
|---------|-------------|
| **Bun** | $BUN_HEALTH_RPS |
| Node.js | $NODEJS_HEALTH_RPS |

---

## CPU-Heavy Task Results

**Task:** Generate and sort 100,000 random numbers

| Runtime | Avg Time (ms) | Improvement |
|---------|--------------|-------------|
| **Bun** | $BUN_CPU_AVG | **${CPU_IMPROVEMENT}x faster** |
| Node.js | $NODEJS_CPU_AVG | baseline |

---

## Fibonacci(40) Results

**Task:** Recursive Fibonacci calculation (n=40)

| Runtime | Avg Time (ms) | Improvement |
|---------|--------------|-------------|
| **Bun** | $BUN_FIB_AVG | **${FIB_IMPROVEMENT}x faster** |
| Node.js | $NODEJS_FIB_AVG | baseline |

---

## Comparison with Strapi Article Claims

| Metric | Article Claims | Our Results | Match? |
|--------|---------------|-------------|--------|
| HTTP req/s (Bun) | ~52,000 | $BUN_TODOS_RPS | - |
| HTTP req/s (Node) | ~13,000 | $NODEJS_TODOS_RPS | - |
| HTTP improvement | 4x | ${THROUGHPUT_IMPROVEMENT}x | - |
| CPU task (Bun) | 1,700ms | ${BUN_CPU_AVG}ms | - |
| CPU task (Node) | 3,400ms | ${NODEJS_CPU_AVG}ms | - |
| CPU improvement | 2x | ${CPU_IMPROVEMENT}x | - |

---

## Summary

- **HTTP Throughput:** Bun achieved ${BUN_TODOS_RPS} req/s vs Node.js ${NODEJS_TODOS_RPS} req/s (**${THROUGHPUT_IMPROVEMENT}x faster**)
- **CPU-Heavy Task:** Bun completed in ${BUN_CPU_AVG}ms vs Node.js ${NODEJS_CPU_AVG}ms (**${CPU_IMPROVEMENT}x faster**)
- **Fibonacci:** Bun completed in ${BUN_FIB_AVG}ms vs Node.js ${NODEJS_FIB_AVG}ms (**${FIB_IMPROVEMENT}x faster**)

---

## Raw Data Files

- \`bun-throughput-todos.json\`
- \`nodejs-throughput-todos.json\`
- \`bun-throughput-health.json\`
- \`nodejs-throughput-health.json\`
- \`bun-cpu-heavy.json\`
- \`nodejs-cpu-heavy.json\`
- \`bun-fibonacci.json\`
- \`nodejs-fibonacci.json\`
EOF

echo -e "${GREEN}Report generated: $RESULTS_DIR/BENCHMARK-REPORT.md${NC}"
echo ""

# Print summary to console
echo "============================================"
echo "  BENCHMARK COMPLETE"
echo "============================================"
echo ""
echo "  HTTP Throughput (/api/todos):"
echo "    Bun:     $BUN_TODOS_RPS req/s"
echo "    Node.js: $NODEJS_TODOS_RPS req/s"
echo "    Improvement: ${THROUGHPUT_IMPROVEMENT}x"
echo ""
echo "  CPU-Heavy (100k sort):"
echo "    Bun:     ${BUN_CPU_AVG}ms"
echo "    Node.js: ${NODEJS_CPU_AVG}ms"
echo "    Improvement: ${CPU_IMPROVEMENT}x"
echo ""
echo "  Fibonacci(40):"
echo "    Bun:     ${BUN_FIB_AVG}ms"
echo "    Node.js: ${NODEJS_FIB_AVG}ms"
echo "    Improvement: ${FIB_IMPROVEMENT}x"
echo ""
echo "============================================"
echo "  Results saved to: $RESULTS_DIR/"
echo "============================================"
