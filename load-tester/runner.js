// Benchmark Runner Module
// Wraps hey/curl commands for benchmark execution

import { $ } from "bun";

const RESULTS_DIR = process.env.RESULTS_DIR || "/results";
// For App Platform: use full URLs from env vars (e.g., http://bun-service:8080)
// For Docker Compose: fallback to container names with port 3000
const BUN_URL = process.env.BUN_URL || `http://${process.env.BUN_HOST || "bun-app"}:3000`;
const NODEJS_URL = process.env.NODEJS_URL || `http://${process.env.NODEJS_HOST || "nodejs-app"}:3000`;

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
  let rps = 0, avgLatency = "0", p99Latency = "0", totalRequests = 0;

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
  }

  return { rps, avgLatency, p99Latency, totalRequests };
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
  const { duration = "30s", concurrency = 50, iterations = 10 } = config;

  // Initialize run state
  const run = {
    id: runId,
    testType,
    config: { duration, concurrency, iterations },
    status: "running",
    progress: 0,
    progressText: "Initializing...",
    startTime: new Date().toISOString(),
    results: { bun: null, nodejs: null },
    summary: null
  };

  activeRuns.set(runId, run);

  // Run benchmark asynchronously
  runBenchmarkAsync(runId, testType, duration, concurrency, iterations);

  return runId;
}

// Async benchmark execution
async function runBenchmarkAsync(runId, testType, duration, concurrency, iterations) {
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
      await runFullSuite(run, duration, concurrency, iterations);
    } else if (testConfig.type === "throughput") {
      await runSingleThroughputTest(run, testConfig.endpoint, duration, concurrency);
    } else if (testConfig.type === "cpu") {
      await runSingleCpuTest(run, iterations);
    } else if (testConfig.type === "fibonacci") {
      await runSingleFibonacciTest(run, iterations);
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

async function runFullSuite(run, duration, concurrency, iterations) {
  run.results = {
    bun: { throughput: {}, cpu: null, fibonacci: null },
    nodejs: { throughput: {}, cpu: null, fibonacci: null }
  };

  // Throughput tests
  run.progressText = "Testing Bun /api/todos throughput...";
  run.progress = 10;
  run.results.bun.throughput.todos = await runThroughputTest("Bun", BUN_URL, "/api/todos", duration, concurrency);

  run.progressText = "Testing Node.js /api/todos throughput...";
  run.progress = 25;
  run.results.nodejs.throughput.todos = await runThroughputTest("Node.js", NODEJS_URL, "/api/todos", duration, concurrency);

  run.progressText = "Testing Bun /api/health throughput...";
  run.progress = 40;
  run.results.bun.throughput.health = await runThroughputTest("Bun", BUN_URL, "/api/health", duration, concurrency);

  run.progressText = "Testing Node.js /api/health throughput...";
  run.progress = 50;
  run.results.nodejs.throughput.health = await runThroughputTest("Node.js", NODEJS_URL, "/api/health", duration, concurrency);

  // CPU tests
  run.progressText = "Testing Bun CPU performance...";
  run.progress = 60;
  run.results.bun.cpu = await runCpuTest("Bun", BUN_URL, iterations);

  run.progressText = "Testing Node.js CPU performance...";
  run.progress = 70;
  run.results.nodejs.cpu = await runCpuTest("Node.js", NODEJS_URL, iterations);

  // Fibonacci tests
  run.progressText = "Testing Bun Fibonacci...";
  run.progress = 80;
  run.results.bun.fibonacci = await runFibonacciTest("Bun", BUN_URL, 40, 5);

  run.progressText = "Testing Node.js Fibonacci...";
  run.progress = 90;
  run.results.nodejs.fibonacci = await runFibonacciTest("Node.js", NODEJS_URL, 40, 5);
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

  runs.unshift({
    id: run.id,
    testType: run.testType,
    testName: TEST_TYPES[run.testType]?.name || run.testType,
    startTime: run.startTime,
    endTime: run.endTime,
    summary: run.summary
  });

  // Keep last 50 runs
  runs = runs.slice(0, 50);

  await Bun.write(indexPath, JSON.stringify(runs, null, 2));
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
