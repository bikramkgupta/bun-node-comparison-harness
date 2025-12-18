// ============================================
// Node.js Cluster Mode - Multi-Core Support
// ============================================
const cluster = require('cluster');
const os = require('os');

// Configuration
const numCPUs = os.cpus().length;
const WORKERS = process.env.WORKERS === 'auto' || !process.env.WORKERS
  ? numCPUs
  : parseInt(process.env.WORKERS) || numCPUs;

if (cluster.isPrimary) {
  const CLUSTER_START_TIME = Date.now();

  console.log('');
  console.log('============================================');
  console.log('[CLUSTER] Node.js Multi-Core Mode');
  console.log('============================================');
  console.log(`[CLUSTER] Primary process PID: ${process.pid}`);
  console.log(`[CLUSTER] Available CPUs: ${numCPUs}`);
  console.log(`[CLUSTER] Spawning ${WORKERS} workers...`);
  console.log('============================================');
  console.log('');

  let workersReady = 0;

  // Fork workers
  for (let i = 0; i < WORKERS; i++) {
    const worker = cluster.fork({
      WORKER_ID: i,
      WORKERS_TOTAL: WORKERS
    });
    console.log(`[CLUSTER] Forked worker ${i} (PID: ${worker.process.pid})`);
  }

  // Track when workers are listening
  cluster.on('listening', (worker, address) => {
    workersReady++;
    if (workersReady === WORKERS) {
      const duration = Date.now() - CLUSTER_START_TIME;
      console.log('');
      console.log('============================================');
      console.log(`[CLUSTER] All ${WORKERS} workers ready in ${duration}ms`);
      console.log('============================================');
      console.log('');
    }
  });

  // Restart crashed workers
  cluster.on('exit', (worker, code, signal) => {
    const workerId = worker.process.env?.WORKER_ID || 'unknown';
    console.log(`[CLUSTER] Worker ${workerId} (PID: ${worker.process.pid}) died (${signal || code})`);
    console.log('[CLUSTER] Restarting worker...');
    cluster.fork({
      WORKER_ID: workerId,
      WORKERS_TOTAL: WORKERS
    });
  });

} else {
  // Worker process - run the Express server
  require('./server.js');
}
