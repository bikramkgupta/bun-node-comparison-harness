// Benchmark Runner Module
// Wraps hey/curl commands for benchmark execution

import { $ } from "bun";
import { existsSync, mkdirSync } from "fs";

// Determine results directory with fallback to /tmp for cloud environments
function getResultsDir() {
  const primaryDir = process.env.RESULTS_DIR || "/results";
  const fallbackDir = "/tmp/benchmark-results";

  // Try primary directory first
  try {
    if (!existsSync(primaryDir)) {
      mkdirSync(primaryDir, { recursive: true });
    }
    // Test write access
    const testFile = `${primaryDir}/.write-test`;
    Bun.write(testFile, "test");
    return primaryDir;
  } catch (e) {
    console.log(`[Storage] Primary dir ${primaryDir} not available, using ${fallbackDir}`);
    // Fall back to /tmp
    try {
      if (!existsSync(fallbackDir)) {
        mkdirSync(fallbackDir, { recursive: true });
      }
      return fallbackDir;
    } catch (e2) {
      console.error("[Storage] Failed to create fallback directory:", e2);
      return fallbackDir; // Return anyway, let it fail later with better error
    }
  }
}

const RESULTS_DIR = getResultsDir();
// For App Platform: use full URLs from env vars (e.g., http://bun-service:8080)
// For Docker Compose: fallback to container names with port 3000
const BUN_URL = process.env.BUN_URL || `http://${process.env.BUN_HOST || "bun-app"}:3000`;
const NODEJS_URL = process.env.NODEJS_URL || `http://${process.env.NODEJS_HOST || "nodejs-app"}:3000`;

console.log(`[Storage] Using results directory: ${RESULTS_DIR}`);

// Generate concurrency levels for testing based on max target
function generateConcurrencyLevels(maxConcurrency) {
  const levels = [];

  if (maxConcurrency <= 500) {
    // Low range: 50, 100, 200, 300, 400, 500
    for (let i = 50; i <= maxConcurrency; i += 50) {
      if (i <= 100 || i % 100 === 0) levels.push(i);
    }
  } else if (maxConcurrency <= 2000) {
    // Medium range: 100, 250, 500, 750, 1000, 1250, 1500, 1750, 2000
    levels.push(100, 250, 500);
    for (let i = 750; i <= maxConcurrency; i += 250) {
      levels.push(i);
    }
  } else {
    // High range: 100, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000
    levels.push(100, 500, 1000);
    for (let i = 1500; i <= maxConcurrency; i += 500) {
      levels.push(i);
    }
  }

  // Ensure max is included
  if (levels[levels.length - 1] !== maxConcurrency) {
    levels.push(maxConcurrency);
  }

  return levels.filter(l => l <= maxConcurrency);
}

// Store active runs
const activeRuns = new Map();

// Test configurations
export const TEST_TYPES = {
  "throughput-todos": {
    name: "HTTP Throughput (/api/todos)",
    endpoint: "/api/todos",
    type: "throughput",
    description: "Measure requests per second on the todos endpoint"
  },
  "throughput-health": {
    name: "HTTP Throughput (/api/health)",
    endpoint: "/api/health",
    type: "throughput",
    description: "Measure requests per second on the health endpoint"
  },
  "cpu-heavy": {
    name: "CPU Heavy (100k Sort)",
    endpoint: "/api/cpu-heavy",
    type: "cpu",
    description: "Generate and sort 100,000 random numbers"
  },
  "fibonacci": {
    name: "Fibonacci (n=40)",
    endpoint: "/api/fibonacci/40",
    type: "fibonacci",
    description: "Recursive Fibonacci calculation"
  },
  "network-egress": {
    name: "Network Egress (Mbps)",
    endpoint: "/api/network/download/1024",
    type: "network-egress",
    description: "Measure outbound network throughput (server → client)"
  },
  "network-inbound": {
    name: "Network Inbound (Mbps)",
    endpoint: "/api/network/upload",
    type: "network-inbound",
    description: "Measure inbound network throughput (client → server)"
  },
  "concurrent-sessions": {
    name: "Max Concurrent Sessions",
    endpoint: "/api/network/hold/1000",
    type: "concurrent-sessions",
    description: "Test maximum concurrent connections the server can handle"
  },
  "json-processing": {
    name: "JSON Parse/Serialize",
    endpoint: "/api/json-benchmark/medium",
    type: "json",
    description: "Measure JSON stringify and parse performance"
  },
  "full-suite": {
    name: "Full Benchmark Suite",
    endpoint: "all",
    type: "suite",
    description: "Run all tests sequentially"
  }
};

// Generate unique run ID
function generateRunId() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `run-${timestamp}`;
}

// Parse hey output to extract metrics
function parseHeyOutput(output) {
  const lines = output.split("\n");
  let rps = 0, avgLatency = "0", p99Latency = "0", totalRequests = 0, totalBytes = 0;

  for (const line of lines) {
    if (line.includes("Requests/sec:")) {
      rps = parseFloat(line.split(":")[1]?.trim()) || 0;
    }
    if (line.includes("Average:") && !avgLatency.includes(".")) {
      avgLatency = line.split(":")[1]?.trim()?.split(" ")[0] || "0";
    }
    if (line.includes("99%")) {
      const parts = line.trim().split(/\s+/);
      p99Latency = parts[1] || "0";
    }
    if (line.includes("Total:") && totalRequests === 0) {
      totalRequests = parseFloat(line.split(":")[1]?.trim()?.split(" ")[0]) || 0;
    }
    if (line.includes("Total data:")) {
      const match = line.match(/Total data:\s+([\d.]+)\s*(\w+)/);
      if (match) {
        totalBytes = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        if (unit === 'kb' || unit === 'kilobytes') totalBytes *= 1024;
        else if (unit === 'mb' || unit === 'megabytes') totalBytes *= 1024 * 1024;
        else if (unit === 'gb' || unit === 'gigabytes') totalBytes *= 1024 * 1024 * 1024;
      }
    }
  }

  return { rps, avgLatency, p99Latency, totalRequests, totalBytes };
}

// Run throughput test using hey
async function runThroughputTest(name, url, endpoint, duration, concurrency) {
  const fullUrl = `${url}${endpoint}`;

  try {
    const result = await $`hey -z ${duration} -c ${concurrency} ${fullUrl}`.text();
    const metrics = parseHeyOutput(result);

    return {
      test: name,
      endpoint,
      duration,
      concurrency,
      requests_per_second: metrics.rps,
      avg_latency_secs: metrics.avgLatency,
      p99_latency_secs: metrics.p99Latency,
      total_requests: metrics.totalRequests,
      raw_output: result
    };
  } catch (error) {
    return {
      test: name,
      endpoint,
      error: error.message,
      requests_per_second: 0
    };
  }
}

// Run CPU-heavy test
async function runCpuTest(name, url, iterations = 10) {
  const times = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const response = await fetch(`${url}/api/cpu-heavy`);
      const data = await response.json();
      times.push(data.duration_ms);
    } catch (error) {
      times.push(0);
    }
  }

  const validTimes = times.filter(t => t > 0);
  const avgTime = validTimes.length > 0
    ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length)
    : 0;
  const minTime = validTimes.length > 0 ? Math.min(...validTimes) : 0;
  const maxTime = validTimes.length > 0 ? Math.max(...validTimes) : 0;

  return {
    test: name,
    operation: "generate_and_sort_100k_numbers",
    iterations,
    avg_duration_ms: avgTime,
    min_duration_ms: minTime,
    max_duration_ms: maxTime,
    all_durations_ms: times
  };
}

// Run Fibonacci test
async function runFibonacciTest(name, url, n = 40, iterations = 5) {
  const times = [];
  let result = 0;

  for (let i = 0; i < iterations; i++) {
    try {
      const response = await fetch(`${url}/api/fibonacci/${n}`);
      const data = await response.json();
      times.push(data.duration_ms);
      result = data.result;
    } catch (error) {
      times.push(0);
    }
  }

  const validTimes = times.filter(t => t > 0);
  const avgTime = validTimes.length > 0
    ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length)
    : 0;

  return {
    test: name,
    operation: "fibonacci",
    n,
    result,
    iterations,
    avg_duration_ms: avgTime,
    all_durations_ms: times
  };
}

// Run Network Egress test (download throughput)
async function runNetworkEgressTest(name, url, duration, concurrency) {
  // Download 1MB payloads to measure egress throughput
  const payloadSizeKB = 1024; // 1MB
  const endpoint = `/api/network/download/${payloadSizeKB}`;
  const fullUrl = `${url}${endpoint}`;

  try {
    const result = await $`hey -z ${duration} -c ${concurrency} ${fullUrl}`.text();
    const metrics = parseHeyOutput(result);

    // Calculate throughput in Mbps
    // Total data transferred / duration in seconds = bytes per second
    // Convert to Mbps: (bytes/sec * 8) / 1,000,000
    const durationSecs = parseFloat(duration.replace('s', ''));
    const bytesPerSecond = metrics.totalBytes / durationSecs;
    const mbps = (bytesPerSecond * 8) / 1000000;

    return {
      test: name,
      endpoint,
      type: "network-egress",
      duration,
      concurrency,
      payload_size_kb: payloadSizeKB,
      total_requests: metrics.totalRequests,
      total_bytes: metrics.totalBytes,
      total_mb: (metrics.totalBytes / (1024 * 1024)).toFixed(2),
      requests_per_second: metrics.rps,
      throughput_mbps: mbps.toFixed(2),
      avg_latency_secs: metrics.avgLatency,
      p99_latency_secs: metrics.p99Latency,
      raw_output: result
    };
  } catch (error) {
    return {
      test: name,
      endpoint,
      type: "network-egress",
      error: error.message,
      throughput_mbps: 0
    };
  }
}

// Run Network Inbound test (upload throughput)
async function runNetworkInboundTest(name, url, duration, concurrency) {
  // Upload 1MB payloads to measure inbound throughput
  const payloadSizeKB = 1024; // 1MB
  const endpoint = `/api/network/upload`;
  const fullUrl = `${url}${endpoint}`;

  // Generate a 1MB payload file for upload
  const payloadFile = "/tmp/upload-payload.bin";
  try {
    await $`dd if=/dev/zero of=${payloadFile} bs=1024 count=${payloadSizeKB} 2>/dev/null`;
  } catch (e) {
    // Fallback: create with Bun
    await Bun.write(payloadFile, Buffer.alloc(payloadSizeKB * 1024, 'X'));
  }

  try {
    // Use hey with POST method and body
    const result = await $`hey -z ${duration} -c ${concurrency} -m POST -D ${payloadFile} -T "application/octet-stream" ${fullUrl}`.text();
    const metrics = parseHeyOutput(result);

    // Calculate throughput in Mbps
    const durationSecs = parseFloat(duration.replace('s', ''));
    const totalUploadedBytes = metrics.totalRequests * payloadSizeKB * 1024;
    const bytesPerSecond = totalUploadedBytes / durationSecs;
    const mbps = (bytesPerSecond * 8) / 1000000;

    return {
      test: name,
      endpoint,
      type: "network-inbound",
      duration,
      concurrency,
      payload_size_kb: payloadSizeKB,
      total_requests: metrics.totalRequests,
      total_uploaded_bytes: totalUploadedBytes,
      total_uploaded_mb: (totalUploadedBytes / (1024 * 1024)).toFixed(2),
      requests_per_second: metrics.rps,
      throughput_mbps: mbps.toFixed(2),
      avg_latency_secs: metrics.avgLatency,
      p99_latency_secs: metrics.p99Latency,
      raw_output: result
    };
  } catch (error) {
    return {
      test: name,
      endpoint,
      type: "network-inbound",
      error: error.message,
      throughput_mbps: 0
    };
  }
}

// Run Concurrent Sessions test
async function runConcurrentSessionsTest(name, url, duration, maxConcurrency = 2000) {
  const endpoint = `/api/network/hold/1000`; // Hold each connection for 1 second
  const fullUrl = `${url}${endpoint}`;

  // Generate concurrency levels dynamically based on maxConcurrency
  // For 2000: [100, 250, 500, 750, 1000, 1500, 2000]
  // For 5000: [100, 500, 1000, 1500, 2000, 3000, 4000, 5000]
  const concurrencyLevels = generateConcurrencyLevels(maxConcurrency);
  console.log(`[Concurrent] Testing levels: ${concurrencyLevels.join(', ')} (max: ${maxConcurrency})`);
  const results = [];

  for (const concurrency of concurrencyLevels) {
    if (concurrency > maxConcurrency) break;

    try {
      // Short duration test at each level
      const result = await $`hey -z 10s -c ${concurrency} ${fullUrl}`.text();
      const metrics = parseHeyOutput(result);

      // Check for errors in output
      const errorMatch = result.match(/\[(\d+)\]\s+Get.*error/g);
      const errors = errorMatch ? errorMatch.length : 0;
      const successRate = metrics.totalRequests > 0
        ? ((metrics.totalRequests - errors) / metrics.totalRequests * 100).toFixed(1)
        : 0;

      results.push({
        concurrency,
        total_requests: metrics.totalRequests,
        requests_per_second: metrics.rps,
        avg_latency_secs: metrics.avgLatency,
        success_rate: successRate,
        errors
      });

      // If success rate drops below 95%, stop testing higher levels
      if (parseFloat(successRate) < 95) break;

    } catch (error) {
      results.push({
        concurrency,
        error: error.message
      });
      break;
    }
  }

  // Find the highest concurrency with >95% success rate
  const successfulLevels = results.filter(r => !r.error && parseFloat(r.success_rate) >= 95);
  const maxSustainedConcurrency = successfulLevels.length > 0
    ? Math.max(...successfulLevels.map(r => r.concurrency))
    : 0;

  // Generate recommendation based on results
  const targetReached = maxSustainedConcurrency >= maxConcurrency;
  const recommendation = targetReached
    ? `Server handles ${maxConcurrency}+ concurrent connections well`
    : maxSustainedConcurrency >= 1000
      ? `Server sustains ${maxSustainedConcurrency} concurrent connections (target: ${maxConcurrency})`
      : `Server may struggle above ${maxSustainedConcurrency} concurrent connections`;

  return {
    test: name,
    endpoint,
    type: "concurrent-sessions",
    duration: "10s per level",
    tested_levels: results,
    max_sustained_concurrency: maxSustainedConcurrency,
    target_concurrency: maxConcurrency,
    recommendation
  };
}

// Run JSON Processing test
async function runJsonTest(name, url, iterations = 100) {
  const endpoint = `/api/json-benchmark/medium`;
  const fullUrl = `${url}${endpoint}`;
  const results = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const response = await fetch(fullUrl);
      const data = await response.json();
      results.push({
        iteration: i + 1,
        json_kb: parseFloat(data.json_kb),
        stringify_ms: data.timings_ms.stringify,
        parse_ms: data.timings_ms.parse,
        total_ms: data.timings_ms.total
      });
    } catch (error) {
      results.push({ iteration: i + 1, error: error.message });
    }
  }

  const successful = results.filter(r => !r.error);
  const avgStringify = successful.length > 0
    ? successful.reduce((sum, r) => sum + r.stringify_ms, 0) / successful.length
    : 0;
  const avgParse = successful.length > 0
    ? successful.reduce((sum, r) => sum + r.parse_ms, 0) / successful.length
    : 0;
  const avgTotal = successful.length > 0
    ? successful.reduce((sum, r) => sum + r.total_ms, 0) / successful.length
    : 0;

  return {
    test: name,
    endpoint,
    type: "json",
    iterations,
    successful_iterations: successful.length,
    avg_stringify_ms: avgStringify.toFixed(3),
    avg_parse_ms: avgParse.toFixed(3),
    avg_total_ms: avgTotal.toFixed(3),
    json_size_kb: successful[0]?.json_kb || 0
  };
}

// Check if services are healthy
export async function checkServicesHealth() {
  const results = { bun: null, nodejs: null };

  try {
    const bunResponse = await fetch(`${BUN_URL}/api/health`);
    results.bun = await bunResponse.json();
  } catch (error) {
    results.bun = { error: error.message };
  }

  try {
    const nodejsResponse = await fetch(`${NODEJS_URL}/api/health`);
    results.nodejs = await nodejsResponse.json();
  } catch (error) {
    results.nodejs = { error: error.message };
  }

  return results;
}

// Start a benchmark run
export async function startBenchmark(testType, config) {
  const runId = generateRunId();
  const { duration = "30s", concurrency = 50, iterations = 10, maxConcurrency = 2000, suiteDurationMinutes = 10 } = config;

  // Initialize run state
  const run = {
    id: runId,
    testType,
    config: { duration, concurrency, iterations, maxConcurrency, suiteDurationMinutes },
    status: "running",
    progress: 0,
    progressText: "Initializing...",
    startTime: new Date().toISOString(),
    results: { bun: null, nodejs: null },
    summary: null
  };

  activeRuns.set(runId, run);

  // Run benchmark asynchronously
  runBenchmarkAsync(runId, testType, duration, concurrency, iterations, maxConcurrency, suiteDurationMinutes);

  return runId;
}

// Async benchmark execution
async function runBenchmarkAsync(runId, testType, duration, concurrency, iterations, maxConcurrency = 2000, suiteDurationMinutes = 10) {
  const run = activeRuns.get(runId);
  if (!run) return;

  const testConfig = TEST_TYPES[testType];
  if (!testConfig) {
    run.status = "error";
    run.error = "Unknown test type";
    return;
  }

  try {
    // Check services
    run.progressText = "Checking service health...";
    run.progress = 5;

    const health = await checkServicesHealth();
    if (health.bun?.error || health.nodejs?.error) {
      run.status = "error";
      run.error = "Services not healthy";
      return;
    }

    if (testType === "full-suite") {
      await runFullSuite(run, concurrency, iterations, maxConcurrency, suiteDurationMinutes);
    } else if (testConfig.type === "throughput") {
      await runSingleThroughputTest(run, testConfig.endpoint, duration, concurrency);
    } else if (testConfig.type === "cpu") {
      await runSingleCpuTest(run, iterations);
    } else if (testConfig.type === "fibonacci") {
      await runSingleFibonacciTest(run, iterations);
    } else if (testConfig.type === "network-egress") {
      await runSingleNetworkEgressTest(run, duration, concurrency);
    } else if (testConfig.type === "network-inbound") {
      await runSingleNetworkInboundTest(run, duration, concurrency);
    } else if (testConfig.type === "concurrent-sessions") {
      await runSingleConcurrentSessionsTest(run, maxConcurrency);
    } else if (testConfig.type === "json") {
      await runSingleJsonTest(run, iterations);
    }

    // Calculate summary
    run.progress = 95;
    run.progressText = "Generating summary...";
    run.summary = calculateSummary(run.results, testType);

    // Save results
    await saveResults(run);

    run.status = "complete";
    run.progress = 100;
    run.progressText = "Complete!";
    run.endTime = new Date().toISOString();

  } catch (error) {
    run.status = "error";
    run.error = error.message;
    run.progress = 0;
    run.progressText = `Error: ${error.message}`;
  }
}

async function runSingleThroughputTest(run, endpoint, duration, concurrency) {
  run.progressText = `Testing Bun ${endpoint}...`;
  run.progress = 20;
  run.results.bun = await runThroughputTest("Bun", BUN_URL, endpoint, duration, concurrency);

  run.progressText = `Testing Node.js ${endpoint}...`;
  run.progress = 60;
  run.results.nodejs = await runThroughputTest("Node.js", NODEJS_URL, endpoint, duration, concurrency);
}

async function runSingleCpuTest(run, iterations) {
  run.progressText = "Testing Bun CPU performance...";
  run.progress = 20;
  run.results.bun = await runCpuTest("Bun", BUN_URL, iterations);

  run.progressText = "Testing Node.js CPU performance...";
  run.progress = 60;
  run.results.nodejs = await runCpuTest("Node.js", NODEJS_URL, iterations);
}

async function runSingleFibonacciTest(run, iterations) {
  run.progressText = "Testing Bun Fibonacci...";
  run.progress = 20;
  run.results.bun = await runFibonacciTest("Bun", BUN_URL, 40, iterations);

  run.progressText = "Testing Node.js Fibonacci...";
  run.progress = 60;
  run.results.nodejs = await runFibonacciTest("Node.js", NODEJS_URL, 40, iterations);
}

async function runSingleNetworkEgressTest(run, duration, concurrency) {
  run.progressText = "Testing Bun egress throughput (download)...";
  run.progress = 20;
  run.results.bun = await runNetworkEgressTest("Bun", BUN_URL, duration, concurrency);

  run.progressText = "Testing Node.js egress throughput (download)...";
  run.progress = 60;
  run.results.nodejs = await runNetworkEgressTest("Node.js", NODEJS_URL, duration, concurrency);
}

async function runSingleNetworkInboundTest(run, duration, concurrency) {
  run.progressText = "Testing Bun inbound throughput (upload)...";
  run.progress = 20;
  run.results.bun = await runNetworkInboundTest("Bun", BUN_URL, duration, concurrency);

  run.progressText = "Testing Node.js inbound throughput (upload)...";
  run.progress = 60;
  run.results.nodejs = await runNetworkInboundTest("Node.js", NODEJS_URL, duration, concurrency);
}

async function runSingleConcurrentSessionsTest(run, maxConcurrency) {
  run.progressText = "Testing Bun max concurrent sessions...";
  run.progress = 20;
  run.results.bun = await runConcurrentSessionsTest("Bun", BUN_URL, "10s", maxConcurrency);

  run.progressText = "Testing Node.js max concurrent sessions...";
  run.progress = 60;
  run.results.nodejs = await runConcurrentSessionsTest("Node.js", NODEJS_URL, "10s", maxConcurrency);
}

async function runSingleJsonTest(run, iterations) {
  run.progressText = "Testing Bun JSON processing...";
  run.progress = 20;
  run.results.bun = await runJsonTest("Bun", BUN_URL, iterations);

  run.progressText = "Testing Node.js JSON processing...";
  run.progress = 60;
  run.results.nodejs = await runJsonTest("Node.js", NODEJS_URL, iterations);
}

async function runFullSuite(run, concurrency, iterations, maxConcurrency, suiteDurationMinutes) {
  // Calculate time allocation
  // Total time in seconds
  const totalSeconds = suiteDurationMinutes * 60;

  // Reserve time for quick tests and concurrent sessions
  // CPU + Fibonacci: ~30s total (quick tests)
  // Concurrent sessions: ~2 minutes (120s) for moderate concurrency
  const quickTestsTime = 30;
  const concurrentSessionsTime = 120;

  // Duration-based tests: throughput-todos, throughput-health, network-egress, network-inbound
  // Each runs on both runtimes = 8 total runs
  const durationBasedRuns = 8;
  const remainingTime = totalSeconds - quickTestsTime - concurrentSessionsTime;
  const perTestDuration = Math.max(30, Math.floor(remainingTime / durationBasedRuns));
  const testDuration = `${perTestDuration}s`;

  // Concurrent sessions target - scale with available time
  const concurrentTarget = Math.min(maxConcurrency, suiteDurationMinutes >= 20 ? 2000 : suiteDurationMinutes >= 10 ? 1000 : 500);

  console.log(`[Full Suite] Total: ${suiteDurationMinutes}min, Per-test: ${perTestDuration}s, Concurrent target: ${concurrentTarget}`);

  run.results = {
    bun: { throughput: {}, cpu: null, fibonacci: null, networkEgress: null, networkInbound: null, concurrent: null, json: null },
    nodejs: { throughput: {}, cpu: null, fibonacci: null, networkEgress: null, networkInbound: null, concurrent: null, json: null }
  };

  // 1. Throughput tests (20%)
  run.progressText = "Testing Bun /api/todos throughput...";
  run.progress = 5;
  run.results.bun.throughput.todos = await runThroughputTest("Bun", BUN_URL, "/api/todos", testDuration, concurrency);

  run.progressText = "Testing Node.js /api/todos throughput...";
  run.progress = 10;
  run.results.nodejs.throughput.todos = await runThroughputTest("Node.js", NODEJS_URL, "/api/todos", testDuration, concurrency);

  run.progressText = "Testing Bun /api/health throughput...";
  run.progress = 15;
  run.results.bun.throughput.health = await runThroughputTest("Bun", BUN_URL, "/api/health", testDuration, concurrency);

  run.progressText = "Testing Node.js /api/health throughput...";
  run.progress = 20;
  run.results.nodejs.throughput.health = await runThroughputTest("Node.js", NODEJS_URL, "/api/health", testDuration, concurrency);

  // 2. Network Egress tests (35%)
  run.progressText = "Testing Bun network egress (download)...";
  run.progress = 25;
  run.results.bun.networkEgress = await runNetworkEgressTest("Bun", BUN_URL, testDuration, concurrency);

  run.progressText = "Testing Node.js network egress (download)...";
  run.progress = 35;
  run.results.nodejs.networkEgress = await runNetworkEgressTest("Node.js", NODEJS_URL, testDuration, concurrency);

  // 3. Network Inbound tests (50%)
  run.progressText = "Testing Bun network inbound (upload)...";
  run.progress = 42;
  run.results.bun.networkInbound = await runNetworkInboundTest("Bun", BUN_URL, testDuration, concurrency);

  run.progressText = "Testing Node.js network inbound (upload)...";
  run.progress = 50;
  run.results.nodejs.networkInbound = await runNetworkInboundTest("Node.js", NODEJS_URL, testDuration, concurrency);

  // 4. CPU tests (60%)
  run.progressText = "Testing Bun CPU performance...";
  run.progress = 55;
  run.results.bun.cpu = await runCpuTest("Bun", BUN_URL, iterations);

  run.progressText = "Testing Node.js CPU performance...";
  run.progress = 60;
  run.results.nodejs.cpu = await runCpuTest("Node.js", NODEJS_URL, iterations);

  // 5. Fibonacci tests (70%)
  run.progressText = "Testing Bun Fibonacci...";
  run.progress = 65;
  run.results.bun.fibonacci = await runFibonacciTest("Bun", BUN_URL, 40, 5);

  run.progressText = "Testing Node.js Fibonacci...";
  run.progress = 70;
  run.results.nodejs.fibonacci = await runFibonacciTest("Node.js", NODEJS_URL, 40, 5);

  // 6. Concurrent Sessions tests (85%)
  run.progressText = "Testing Bun concurrent sessions...";
  run.progress = 72;
  run.results.bun.concurrent = await runConcurrentSessionsTest("Bun", BUN_URL, "10s", concurrentTarget);

  run.progressText = "Testing Node.js concurrent sessions...";
  run.progress = 80;
  run.results.nodejs.concurrent = await runConcurrentSessionsTest("Node.js", NODEJS_URL, "10s", concurrentTarget);

  // 7. JSON Processing tests (92%)
  run.progressText = "Testing Bun JSON processing...";
  run.progress = 88;
  run.results.bun.json = await runJsonTest("Bun", BUN_URL, 50);

  run.progressText = "Testing Node.js JSON processing...";
  run.progress = 92;
  run.results.nodejs.json = await runJsonTest("Node.js", NODEJS_URL, 50);
}

function calculateSummary(results, testType) {
  const summary = {
    testType,
    improvements: {}
  };

  if (testType === "full-suite") {
    // Throughput improvements
    if (results.bun?.throughput?.todos && results.nodejs?.throughput?.todos) {
      const bunRps = results.bun.throughput.todos.requests_per_second;
      const nodeRps = results.nodejs.throughput.todos.requests_per_second;
      summary.improvements.throughputTodos = nodeRps > 0 ? (bunRps / nodeRps).toFixed(2) : "N/A";
    }

    // CPU improvements
    if (results.bun?.cpu && results.nodejs?.cpu) {
      const bunMs = results.bun.cpu.avg_duration_ms;
      const nodeMs = results.nodejs.cpu.avg_duration_ms;
      summary.improvements.cpu = bunMs > 0 ? (nodeMs / bunMs).toFixed(2) : "N/A";
    }

    // Fibonacci improvements
    if (results.bun?.fibonacci && results.nodejs?.fibonacci) {
      const bunMs = results.bun.fibonacci.avg_duration_ms;
      const nodeMs = results.nodejs.fibonacci.avg_duration_ms;
      summary.improvements.fibonacci = bunMs > 0 ? (nodeMs / bunMs).toFixed(2) : "N/A";
    }

    // Network Egress improvements
    if (results.bun?.networkEgress && results.nodejs?.networkEgress) {
      const bunMbps = parseFloat(results.bun.networkEgress.throughput_mbps) || 0;
      const nodeMbps = parseFloat(results.nodejs.networkEgress.throughput_mbps) || 0;
      summary.improvements.networkEgress = nodeMbps > 0 ? (bunMbps / nodeMbps).toFixed(2) : "N/A";
    }

    // Network Inbound improvements
    if (results.bun?.networkInbound && results.nodejs?.networkInbound) {
      const bunMbps = parseFloat(results.bun.networkInbound.throughput_mbps) || 0;
      const nodeMbps = parseFloat(results.nodejs.networkInbound.throughput_mbps) || 0;
      summary.improvements.networkInbound = nodeMbps > 0 ? (bunMbps / nodeMbps).toFixed(2) : "N/A";
    }

    // Concurrent sessions improvements
    if (results.bun?.concurrent && results.nodejs?.concurrent) {
      const bunMax = results.bun.concurrent.max_sustained_concurrency || 0;
      const nodeMax = results.nodejs.concurrent.max_sustained_concurrency || 0;
      summary.improvements.concurrent = nodeMax > 0 ? (bunMax / nodeMax).toFixed(2) : "N/A";
    }

    // JSON processing improvements
    if (results.bun?.json && results.nodejs?.json) {
      const bunMs = parseFloat(results.bun.json.avg_total_ms) || 0;
      const nodeMs = parseFloat(results.nodejs.json.avg_total_ms) || 0;
      summary.improvements.json = bunMs > 0 ? (nodeMs / bunMs).toFixed(2) : "N/A";
    }
  } else if (testType.startsWith("throughput")) {
    const bunRps = results.bun?.requests_per_second || 0;
    const nodeRps = results.nodejs?.requests_per_second || 0;
    summary.improvements.throughput = nodeRps > 0 ? (bunRps / nodeRps).toFixed(2) : "N/A";
    summary.bunRps = bunRps;
    summary.nodeRps = nodeRps;
  } else if (testType === "cpu-heavy") {
    const bunMs = results.bun?.avg_duration_ms || 0;
    const nodeMs = results.nodejs?.avg_duration_ms || 0;
    summary.improvements.cpu = bunMs > 0 ? (nodeMs / bunMs).toFixed(2) : "N/A";
    summary.bunMs = bunMs;
    summary.nodeMs = nodeMs;
  } else if (testType === "fibonacci") {
    const bunMs = results.bun?.avg_duration_ms || 0;
    const nodeMs = results.nodejs?.avg_duration_ms || 0;
    summary.improvements.fibonacci = bunMs > 0 ? (nodeMs / bunMs).toFixed(2) : "N/A";
    summary.bunMs = bunMs;
    summary.nodeMs = nodeMs;
  } else if (testType === "network-egress") {
    const bunMbps = parseFloat(results.bun?.throughput_mbps) || 0;
    const nodeMbps = parseFloat(results.nodejs?.throughput_mbps) || 0;
    summary.improvements.egress = nodeMbps > 0 ? (bunMbps / nodeMbps).toFixed(2) : "N/A";
    summary.bunMbps = bunMbps;
    summary.nodeMbps = nodeMbps;
    summary.bunRps = results.bun?.requests_per_second || 0;
    summary.nodeRps = results.nodejs?.requests_per_second || 0;
  } else if (testType === "network-inbound") {
    const bunMbps = parseFloat(results.bun?.throughput_mbps) || 0;
    const nodeMbps = parseFloat(results.nodejs?.throughput_mbps) || 0;
    summary.improvements.inbound = nodeMbps > 0 ? (bunMbps / nodeMbps).toFixed(2) : "N/A";
    summary.bunMbps = bunMbps;
    summary.nodeMbps = nodeMbps;
    summary.bunRps = results.bun?.requests_per_second || 0;
    summary.nodeRps = results.nodejs?.requests_per_second || 0;
  } else if (testType === "concurrent-sessions") {
    const bunMax = results.bun?.max_sustained_concurrency || 0;
    const nodeMax = results.nodejs?.max_sustained_concurrency || 0;
    summary.improvements.concurrency = nodeMax > 0 ? (bunMax / nodeMax).toFixed(2) : "N/A";
    summary.bunMaxConcurrency = bunMax;
    summary.nodeMaxConcurrency = nodeMax;
  } else if (testType === "json-processing") {
    const bunMs = parseFloat(results.bun?.avg_total_ms) || 0;
    const nodeMs = parseFloat(results.nodejs?.avg_total_ms) || 0;
    summary.improvements.json = bunMs > 0 ? (nodeMs / bunMs).toFixed(2) : "N/A";
    summary.bunMs = bunMs;
    summary.nodeMs = nodeMs;
  }

  return summary;
}

async function saveResults(run) {
  const runDir = `${RESULTS_DIR}/${run.id}`;

  try {
    await $`mkdir -p ${runDir}`;

    // Save config
    await Bun.write(`${runDir}/config.json`, JSON.stringify(run.config, null, 2));

    // Save results
    await Bun.write(`${runDir}/bun-results.json`, JSON.stringify(run.results.bun, null, 2));
    await Bun.write(`${runDir}/nodejs-results.json`, JSON.stringify(run.results.nodejs, null, 2));

    // Save summary
    await Bun.write(`${runDir}/summary.json`, JSON.stringify({
      id: run.id,
      testType: run.testType,
      startTime: run.startTime,
      endTime: run.endTime,
      summary: run.summary
    }, null, 2));

    // Update runs index
    await updateRunsIndex(run);

  } catch (error) {
    console.error("Failed to save results:", error);
  }
}

async function updateRunsIndex(run) {
  const indexPath = `${RESULTS_DIR}/runs.json`;
  let runs = [];

  try {
    const existing = await Bun.file(indexPath).text();
    runs = JSON.parse(existing);
  } catch {
    // File doesn't exist yet
  }

  // Extract detailed metrics for the index (for expanded view in UI)
  const details = extractRunDetails(run);

  runs.unshift({
    id: run.id,
    testType: run.testType,
    testName: TEST_TYPES[run.testType]?.name || run.testType,
    startTime: run.startTime,
    endTime: run.endTime,
    config: run.config,
    summary: run.summary,
    // Additional details for expanded view
    details
  });

  // Keep last 50 runs
  runs = runs.slice(0, 50);

  await Bun.write(indexPath, JSON.stringify(runs, null, 2));
}

// Extract detailed metrics from run results for the index
function extractRunDetails(run) {
  const details = {
    bun: {},
    nodejs: {}
  };

  const bunResults = run.results?.bun;
  const nodeResults = run.results?.nodejs;

  if (run.testType.startsWith("throughput")) {
    // Throughput test details
    details.bun = {
      rps: bunResults?.requests_per_second || 0,
      avgLatency: bunResults?.avg_latency_secs || "0",
      p99Latency: bunResults?.p99_latency_secs || "0",
      totalRequests: bunResults?.total_requests || 0
    };
    details.nodejs = {
      rps: nodeResults?.requests_per_second || 0,
      avgLatency: nodeResults?.avg_latency_secs || "0",
      p99Latency: nodeResults?.p99_latency_secs || "0",
      totalRequests: nodeResults?.total_requests || 0
    };
  } else if (run.testType === "cpu-heavy") {
    // CPU test details
    details.bun = {
      avgMs: bunResults?.avg_duration_ms || 0,
      minMs: bunResults?.min_duration_ms || 0,
      maxMs: bunResults?.max_duration_ms || 0,
      iterations: bunResults?.iterations || 0
    };
    details.nodejs = {
      avgMs: nodeResults?.avg_duration_ms || 0,
      minMs: nodeResults?.min_duration_ms || 0,
      maxMs: nodeResults?.max_duration_ms || 0,
      iterations: nodeResults?.iterations || 0
    };
  } else if (run.testType === "fibonacci") {
    // Fibonacci test details
    details.bun = {
      avgMs: bunResults?.avg_duration_ms || 0,
      n: bunResults?.n || 40,
      result: bunResults?.result || 0,
      iterations: bunResults?.iterations || 0
    };
    details.nodejs = {
      avgMs: nodeResults?.avg_duration_ms || 0,
      n: nodeResults?.n || 40,
      result: nodeResults?.result || 0,
      iterations: nodeResults?.iterations || 0
    };
  } else if (run.testType === "network-egress") {
    // Network egress test details
    details.bun = {
      throughputMbps: bunResults?.throughput_mbps || "0",
      rps: bunResults?.requests_per_second || 0,
      totalMb: bunResults?.total_mb || "0",
      avgLatency: bunResults?.avg_latency_secs || "0"
    };
    details.nodejs = {
      throughputMbps: nodeResults?.throughput_mbps || "0",
      rps: nodeResults?.requests_per_second || 0,
      totalMb: nodeResults?.total_mb || "0",
      avgLatency: nodeResults?.avg_latency_secs || "0"
    };
  } else if (run.testType === "network-inbound") {
    // Network inbound test details
    details.bun = {
      throughputMbps: bunResults?.throughput_mbps || "0",
      rps: bunResults?.requests_per_second || 0,
      totalUploadedMb: bunResults?.total_uploaded_mb || "0",
      avgLatency: bunResults?.avg_latency_secs || "0"
    };
    details.nodejs = {
      throughputMbps: nodeResults?.throughput_mbps || "0",
      rps: nodeResults?.requests_per_second || 0,
      totalUploadedMb: nodeResults?.total_uploaded_mb || "0",
      avgLatency: nodeResults?.avg_latency_secs || "0"
    };
  } else if (run.testType === "concurrent-sessions") {
    // Concurrent sessions test details
    details.bun = {
      maxConcurrency: bunResults?.max_sustained_concurrency || 0,
      testedLevels: bunResults?.tested_levels?.length || 0,
      recommendation: bunResults?.recommendation || ""
    };
    details.nodejs = {
      maxConcurrency: nodeResults?.max_sustained_concurrency || 0,
      testedLevels: nodeResults?.tested_levels?.length || 0,
      recommendation: nodeResults?.recommendation || ""
    };
  } else if (run.testType === "json-processing") {
    // JSON processing test details
    details.bun = {
      avgTotalMs: bunResults?.avg_total_ms || "0",
      avgStringifyMs: bunResults?.avg_stringify_ms || "0",
      avgParseMs: bunResults?.avg_parse_ms || "0",
      jsonSizeKb: bunResults?.json_size_kb || 0,
      iterations: bunResults?.iterations || 0
    };
    details.nodejs = {
      avgTotalMs: nodeResults?.avg_total_ms || "0",
      avgStringifyMs: nodeResults?.avg_stringify_ms || "0",
      avgParseMs: nodeResults?.avg_parse_ms || "0",
      jsonSizeKb: nodeResults?.json_size_kb || 0,
      iterations: nodeResults?.iterations || 0
    };
  } else if (run.testType === "full-suite") {
    // Full suite - extract key metrics from all test types
    details.bun = {
      throughputTodos: bunResults?.throughput?.todos?.requests_per_second || 0,
      throughputHealth: bunResults?.throughput?.health?.requests_per_second || 0,
      cpuAvgMs: bunResults?.cpu?.avg_duration_ms || 0,
      fibAvgMs: bunResults?.fibonacci?.avg_duration_ms || 0,
      networkEgressMbps: bunResults?.networkEgress?.throughput_mbps || "0",
      networkInboundMbps: bunResults?.networkInbound?.throughput_mbps || "0",
      maxConcurrent: bunResults?.concurrent?.max_sustained_concurrency || 0,
      jsonAvgMs: bunResults?.json?.avg_total_ms || "0"
    };
    details.nodejs = {
      throughputTodos: nodeResults?.throughput?.todos?.requests_per_second || 0,
      throughputHealth: nodeResults?.throughput?.health?.requests_per_second || 0,
      cpuAvgMs: nodeResults?.cpu?.avg_duration_ms || 0,
      fibAvgMs: nodeResults?.fibonacci?.avg_duration_ms || 0,
      networkEgressMbps: nodeResults?.networkEgress?.throughput_mbps || "0",
      networkInboundMbps: nodeResults?.networkInbound?.throughput_mbps || "0",
      maxConcurrent: nodeResults?.concurrent?.max_sustained_concurrency || 0,
      jsonAvgMs: nodeResults?.json?.avg_total_ms || "0"
    };
  }

  return details;
}

// Get run status
export function getRunStatus(runId) {
  return activeRuns.get(runId) || null;
}

// Get all runs from index
export async function getAllRuns() {
  try {
    const indexPath = `${RESULTS_DIR}/runs.json`;
    const content = await Bun.file(indexPath).text();
    return JSON.parse(content);
  } catch {
    return [];
  }
}

// Get specific run details
export async function getRunDetails(runId) {
  const runDir = `${RESULTS_DIR}/${runId}`;

  try {
    const [config, bunResults, nodejsResults, summary] = await Promise.all([
      Bun.file(`${runDir}/config.json`).json(),
      Bun.file(`${runDir}/bun-results.json`).json(),
      Bun.file(`${runDir}/nodejs-results.json`).json(),
      Bun.file(`${runDir}/summary.json`).json()
    ]);

    return { config, bunResults, nodejsResults, summary };
  } catch (error) {
    return null;
  }
}
