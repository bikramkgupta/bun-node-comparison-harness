# TODO: Add JSON and Cold Start Benchmarks

## Overview
Add two new benchmark types to complete the test coverage:
1. **JSON Parse/Serialize** - Measures JSON processing performance (common in APIs)
2. **Cold Start Time** - Measures time from process start to first response (critical for serverless)

---

## Task 1: Add JSON Parse/Serialize Benchmark

### 1.1 Add API Endpoint to `bun/server.js`

Location: After the network endpoints (~line 290)

```javascript
// ============================================
// JSON Processing Benchmark Endpoints
// ============================================

// Generate a complex nested JSON object
function generateComplexJson(depth = 5, breadth = 10) {
  if (depth === 0) {
    return {
      id: Math.random().toString(36).substring(7),
      value: Math.random() * 1000,
      timestamp: Date.now(),
      tags: Array(5).fill(0).map(() => Math.random().toString(36).substring(7))
    };
  }

  const obj = {
    level: depth,
    children: []
  };

  for (let i = 0; i < breadth; i++) {
    obj.children.push(generateComplexJson(depth - 1, Math.max(2, breadth - 2)));
  }

  return obj;
}

// JSON benchmark endpoint
// Tests: JSON.stringify + JSON.parse performance
app.get('/api/json-benchmark/:size?', (req, res) => {
  const size = req.params.size || 'medium'; // small, medium, large
  const startTime = process.hrtime.bigint();

  // Generate JSON based on size
  let depth, breadth;
  switch (size) {
    case 'small':
      depth = 3; breadth = 5;
      break;
    case 'large':
      depth = 6; breadth = 15;
      break;
    default: // medium
      depth = 5; breadth = 10;
  }

  // Generate complex object
  const obj = generateComplexJson(depth, breadth);
  const generateTime = process.hrtime.bigint();

  // Stringify
  const jsonString = JSON.stringify(obj);
  const stringifyTime = process.hrtime.bigint();

  // Parse back
  const parsed = JSON.parse(jsonString);
  const parseTime = process.hrtime.bigint();

  const totalTime = process.hrtime.bigint();

  res.json({
    runtime: RUNTIME,
    size,
    json_bytes: Buffer.byteLength(jsonString),
    json_kb: (Buffer.byteLength(jsonString) / 1024).toFixed(2),
    timings_ms: {
      generate: Number(generateTime - startTime) / 1e6,
      stringify: Number(stringifyTime - generateTime) / 1e6,
      parse: Number(parseTime - stringifyTime) / 1e6,
      total: Number(totalTime - startTime) / 1e6
    }
  });
});
```

### 1.2 Add Same Endpoint to `nodejs/server.js`

Copy the same code to nodejs/server.js, changing `RUNTIME` reference to `'node'`.

### 1.3 Add Test Type to `load-tester/runner.js`

In `TEST_TYPES` object (around line 78):

```javascript
"json-processing": {
  name: "JSON Parse/Serialize",
  endpoint: "/api/json-benchmark/medium",
  type: "json",
  description: "Measure JSON stringify and parse performance"
},
```

### 1.4 Add Runner Function to `load-tester/runner.js`

After `runConcurrentSessionsTest` function:

```javascript
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
  const avgStringify = successful.reduce((sum, r) => sum + r.stringify_ms, 0) / successful.length;
  const avgParse = successful.reduce((sum, r) => sum + r.parse_ms, 0) / successful.length;
  const avgTotal = successful.reduce((sum, r) => sum + r.total_ms, 0) / successful.length;

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

async function runSingleJsonTest(run, iterations) {
  run.progressText = "Testing Bun JSON processing...";
  run.progress = 20;
  run.results.bun = await runJsonTest("Bun", BUN_URL, iterations);

  run.progressText = "Testing Node.js JSON processing...";
  run.progress = 60;
  run.results.nodejs = await runJsonTest("Node.js", NODEJS_URL, iterations);
}
```

### 1.5 Add to `runBenchmarkAsync` Switch Statement

```javascript
} else if (testConfig.type === "json") {
  await runSingleJsonTest(run, iterations);
}
```

### 1.6 Add to `calculateSummary` Function

```javascript
} else if (testType === "json-processing") {
  const bunMs = parseFloat(results.bun?.avg_total_ms) || 0;
  const nodeMs = parseFloat(results.nodejs?.avg_total_ms) || 0;
  summary.improvements.json = bunMs > 0 ? (nodeMs / bunMs).toFixed(2) : "N/A";
  summary.bunMs = bunMs;
  summary.nodeMs = nodeMs;
}
```

### 1.7 Update Frontend `index.html`

Add display results handling in `displayResults` function:

```javascript
} else if (type === 'json-processing') {
  bunValue = data.results?.bun?.avg_total_ms || '-';
  nodeValue = data.results?.nodejs?.avg_total_ms || '-';
  bunLabel = 'ms per operation';
  nodeLabel = 'ms per operation';
  improvement = data.summary?.improvements?.json || '-';
}
```

---

## Task 2: Add Cold Start Benchmark

### 2.1 Create Cold Start Test Script

Create `load-tester/cold-start-test.js`:

```javascript
// Cold Start Benchmark
// Measures time from container start to first successful response

export async function measureColdStart(url, timeout = 30000) {
  const startTime = Date.now();
  let firstResponseTime = null;
  let attempts = 0;

  while (Date.now() - startTime < timeout) {
    attempts++;
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        firstResponseTime = Date.now() - startTime;
        const data = await response.json();
        return {
          cold_start_ms: firstResponseTime,
          attempts,
          module_load_time_ms: data.module_load_time_ms,
          runtime: data.runtime,
          runtime_version: data.runtime_version
        };
      }
    } catch (e) {
      // Service not ready yet
    }
    await new Promise(r => setTimeout(r, 100));
  }

  return {
    error: "Timeout waiting for service",
    timeout_ms: timeout,
    attempts
  };
}
```

### 2.2 Add Cold Start Endpoint to Load Tester

In `load-tester/server.js`, add API endpoint:

```javascript
// POST /api/cold-start - Trigger cold start measurement
// This requires docker/container restart capability
if (path === "/api/cold-start" && method === "POST") {
  // Note: This is a placeholder - actual implementation requires
  // container orchestration access
  return jsonResponse({
    error: "Cold start test requires manual container restart",
    instructions: [
      "1. Stop the target container (bun-app or nodejs-app)",
      "2. Start the container",
      "3. Measure time until /api/health responds"
    ]
  }, 501);
}
```

### 2.3 Add to TEST_TYPES (informational only)

```javascript
"cold-start": {
  name: "Cold Start Time",
  endpoint: "/api/health",
  type: "cold-start",
  description: "Measure time from process start to first response (requires container restart)"
},
```

### 2.4 Document Cold Start Testing Approach

The cold start test is special because it requires container restart. Options:

**Option A: Manual Testing (Recommended for now)**
```bash
# Terminal 1: Watch for container ready
time curl --retry 30 --retry-delay 1 --retry-connrefused http://localhost:3001/api/health

# Terminal 2: Restart container
docker restart bun-benchmark
```

**Option B: Add to runner.js with Docker API (Future)**
Would require docker socket access in load-tester container.

---

## Task 3: Add to Full Suite

### 3.1 Update `runFullSuite` Function

Add JSON test after Fibonacci tests:

```javascript
// 7. JSON Processing tests (92%)
run.progressText = "Testing Bun JSON processing...";
run.progress = 88;
run.results.bun.json = await runJsonTest("Bun", BUN_URL, 50);

run.progressText = "Testing Node.js JSON processing...";
run.progress = 92;
run.results.nodejs.json = await runJsonTest("Node.js", NODEJS_URL, 50);
```

### 3.2 Update Results Structure in `runFullSuite`

```javascript
run.results = {
  bun: { throughput: {}, cpu: null, fibonacci: null, networkEgress: null, networkInbound: null, concurrent: null, json: null },
  nodejs: { throughput: {}, cpu: null, fibonacci: null, networkEgress: null, networkInbound: null, concurrent: null, json: null }
};
```

### 3.3 Update `calculateSummary` for Full Suite

Add in the full-suite section:

```javascript
// JSON processing improvements
if (results.bun?.json && results.nodejs?.json) {
  const bunMs = parseFloat(results.bun.json.avg_total_ms) || 0;
  const nodeMs = parseFloat(results.nodejs.json.avg_total_ms) || 0;
  summary.improvements.json = bunMs > 0 ? (nodeMs / bunMs).toFixed(2) : "N/A";
}
```

### 3.4 Update `getRunDetails` for Full Suite

Add to details objects:

```javascript
jsonAvgMs: bunResults?.json?.avg_total_ms || 0,
```

### 3.5 Update Frontend Full Suite Display

Add to `buildReportDetails` full-suite section:

```javascript
<div class="report-details-row">
  <span class="report-details-label">JSON Processing</span>
  <span class="report-details-value">${details.bun?.jsonAvgMs || '-'}ms</span>
</div>
```

---

## Task 4: Update Frontend UI

### 4.1 Add JSON Test Type to Dropdown (Already Done via API)

The dropdown loads from `/api/tests`, so no change needed.

### 4.2 Add Display Handling in `displayResults`

Already covered in Task 1.7.

### 4.3 Add Report Details for JSON Test

In `buildReportDetails`:

```javascript
} else if (testType === 'json-processing') {
  bunRows = `
    <div class="report-details-row">
      <span class="report-details-label">Avg Total</span>
      <span class="report-details-value">${details.bun?.avgTotalMs || '-'}ms</span>
    </div>
    <div class="report-details-row">
      <span class="report-details-label">Stringify</span>
      <span class="report-details-value">${details.bun?.avgStringifyMs || '-'}ms</span>
    </div>
    <div class="report-details-row">
      <span class="report-details-label">Parse</span>
      <span class="report-details-value">${details.bun?.avgParseMs || '-'}ms</span>
    </div>
    <div class="report-details-row">
      <span class="report-details-label">JSON Size</span>
      <span class="report-details-value">${details.bun?.jsonSizeKb || '-'} KB</span>
    </div>
  `;
  // Similar for nodeRows...
}
```

---

## Testing Checklist

- [ ] JSON endpoint works on bun-app: `curl http://localhost:3001/api/json-benchmark/medium`
- [ ] JSON endpoint works on nodejs-app: `curl http://localhost:3002/api/json-benchmark/medium`
- [ ] JSON test appears in dashboard dropdown
- [ ] JSON test runs successfully and shows results
- [ ] Full suite includes JSON test
- [ ] Cold start documented in README

---

## Files to Modify

1. `bun/server.js` - Add JSON endpoint
2. `nodejs/server.js` - Add JSON endpoint
3. `load-tester/runner.js` - Add test type, runner functions, summary calculation
4. `load-tester/public/index.html` - Add display handling
5. `load-tester/server.js` - (Optional) Add cold-start API placeholder

---

## Deployment

```bash
# Rebuild and test locally
docker compose down
docker compose build --no-cache
docker compose up -d

# Test JSON endpoint
curl http://localhost:3001/api/json-benchmark/medium
curl http://localhost:3002/api/json-benchmark/medium

# Test via dashboard
open http://localhost:8080

# Commit and push
git add -A
git commit -m "feat: Add JSON parse/serialize benchmark"
git push origin dev
```

---

## Estimated Time

- Task 1 (JSON Benchmark): ~30 minutes
- Task 2 (Cold Start): ~15 minutes (documentation only)
- Task 3 (Full Suite Integration): ~15 minutes
- Task 4 (Frontend UI): ~15 minutes
- Testing: ~15 minutes

**Total: ~1.5 hours**
