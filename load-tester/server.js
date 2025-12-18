// Bun HTTP Server for Load Tester Dashboard
import {
  TEST_TYPES,
  checkServicesHealth,
  startBenchmark,
  getRunStatus,
  getAllRuns,
  getRunDetails
} from "./runner.js";

const PORT = process.env.PORT || 8080;

// CORS headers for development
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

// JSON response helper
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}

// Serve static files
async function serveStatic(path) {
  const filePath = path === "/" ? "/public/index.html" : `/public${path}`;

  try {
    const file = Bun.file(import.meta.dir + filePath);
    const exists = await file.exists();

    if (!exists) {
      // Fallback to index.html for SPA routing
      const indexFile = Bun.file(import.meta.dir + "/public/index.html");
      if (await indexFile.exists()) {
        return new Response(indexFile, {
          headers: { "Content-Type": "text/html" }
        });
      }
      return new Response("Not Found", { status: 404 });
    }

    const contentType = getContentType(filePath);
    return new Response(file, {
      headers: { "Content-Type": contentType }
    });
  } catch (error) {
    return new Response("Internal Server Error", { status: 500 });
  }
}

function getContentType(path) {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".ico")) return "image/x-icon";
  return "text/plain";
}

// Request handler
async function handleRequest(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // API Routes
  if (path.startsWith("/api/")) {
    return handleApi(path, method, req);
  }

  // Static files
  return serveStatic(path);
}

// API handler
async function handleApi(path, method, req) {
  // GET /api/tests - List available tests
  if (path === "/api/tests" && method === "GET") {
    return jsonResponse({
      tests: Object.entries(TEST_TYPES).map(([id, config]) => ({
        id,
        ...config
      }))
    });
  }

  // GET /api/health - Dashboard health check
  if (path === "/api/health" && method === "GET") {
    const services = await checkServicesHealth();
    return jsonResponse({
      dashboard: "ok",
      services,
      timestamp: new Date().toISOString()
    });
  }

  // GET /api/services - Check backend services
  if (path === "/api/services" && method === "GET") {
    const services = await checkServicesHealth();
    return jsonResponse(services);
  }

  // POST /api/run - Start a benchmark
  if (path === "/api/run" && method === "POST") {
    try {
      const body = await req.json();
      const { testType, duration = "30s", concurrency = 50, iterations = 10 } = body;

      if (!testType || !TEST_TYPES[testType]) {
        return jsonResponse({ error: "Invalid test type" }, 400);
      }

      const runId = await startBenchmark(testType, { duration, concurrency, iterations });
      return jsonResponse({ runId, status: "started" });
    } catch (error) {
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // GET /api/status/:runId - Get run status
  const statusMatch = path.match(/^\/api\/status\/(.+)$/);
  if (statusMatch && method === "GET") {
    const runId = statusMatch[1];
    const status = getRunStatus(runId);

    if (!status) {
      // Check if it's a completed run from disk
      const details = await getRunDetails(runId);
      if (details) {
        return jsonResponse({
          id: runId,
          status: "complete",
          progress: 100,
          progressText: "Complete!",
          results: {
            bun: details.bunResults,
            nodejs: details.nodejsResults
          },
          summary: details.summary?.summary
        });
      }
      return jsonResponse({ error: "Run not found" }, 404);
    }

    return jsonResponse(status);
  }

  // GET /api/reports - List all historical reports
  if (path === "/api/reports" && method === "GET") {
    const runs = await getAllRuns();
    return jsonResponse({ reports: runs });
  }

  // GET /api/reports/:id - Get specific report
  const reportMatch = path.match(/^\/api\/reports\/(.+)$/);
  if (reportMatch && method === "GET") {
    const runId = reportMatch[1];
    const details = await getRunDetails(runId);

    if (!details) {
      return jsonResponse({ error: "Report not found" }, 404);
    }

    return jsonResponse(details);
  }

  // 404 for unknown API routes
  return jsonResponse({ error: "Not found" }, 404);
}

// Start server
const server = Bun.serve({
  port: PORT,
  fetch: handleRequest
});

console.log(`
╔════════════════════════════════════════════════════════════╗
║       Bun vs Node.js Benchmark Dashboard                   ║
╠════════════════════════════════════════════════════════════╣
║  Dashboard running at: http://localhost:${PORT}              ║
║                                                            ║
║  API Endpoints:                                            ║
║    GET  /api/tests       - List available tests            ║
║    GET  /api/health      - Dashboard health                ║
║    GET  /api/services    - Check backend services          ║
║    POST /api/run         - Start benchmark                 ║
║    GET  /api/status/:id  - Get run status                  ║
║    GET  /api/reports     - List historical reports         ║
║    GET  /api/reports/:id - Get specific report             ║
╚════════════════════════════════════════════════════════════╝
`);
