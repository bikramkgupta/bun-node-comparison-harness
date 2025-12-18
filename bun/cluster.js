// ============================================
// Bun Cluster Mode - Multi-Core Support
// ============================================
import { cpus } from 'os';

// Configuration
const numCPUs = cpus().length;
const WORKERS = process.env.WORKERS === 'auto' || !process.env.WORKERS
  ? numCPUs
  : parseInt(process.env.WORKERS) || numCPUs;

const IS_WORKER = process.env.BUN_WORKER === 'true';

if (!IS_WORKER) {
  // Primary process - spawn workers
  const CLUSTER_START_TIME = Date.now();

  console.log('');
  console.log('============================================');
  console.log('[CLUSTER] Bun Multi-Core Mode');
  console.log('============================================');
  console.log(`[CLUSTER] Primary process PID: ${process.pid}`);
  console.log(`[CLUSTER] Available CPUs: ${numCPUs}`);
  console.log(`[CLUSTER] Spawning ${WORKERS} workers...`);
  console.log('============================================');
  console.log('');

  const workers = [];

  for (let i = 0; i < WORKERS; i++) {
    const worker = Bun.spawn(['bun', 'run', './server.js'], {
      cwd: import.meta.dir,
      env: {
        ...process.env,
        BUN_WORKER: 'true',
        WORKER_ID: String(i),
        WORKERS_TOTAL: String(WORKERS)
      },
      stdout: 'inherit',
      stderr: 'inherit'
    });

    workers.push({ proc: worker, id: i });
    console.log(`[CLUSTER] Spawned worker ${i} (PID: ${worker.pid})`);
  }

  const duration = Date.now() - CLUSTER_START_TIME;
  console.log('');
  console.log('============================================');
  console.log(`[CLUSTER] All ${WORKERS} workers spawned in ${duration}ms`);
  console.log('============================================');
  console.log('');

  // Monitor workers and restart if they die
  const checkWorkers = async () => {
    for (let i = 0; i < workers.length; i++) {
      const { proc, id } = workers[i];

      // Check if process exited
      if (proc.exitCode !== null) {
        console.log(`[CLUSTER] Worker ${id} (PID: ${proc.pid}) died with code ${proc.exitCode}`);
        console.log('[CLUSTER] Restarting worker...');

        const newWorker = Bun.spawn(['bun', 'run', './server.js'], {
          cwd: import.meta.dir,
          env: {
            ...process.env,
            BUN_WORKER: 'true',
            WORKER_ID: String(id),
            WORKERS_TOTAL: String(WORKERS)
          },
          stdout: 'inherit',
          stderr: 'inherit'
        });

        workers[i] = { proc: newWorker, id };
        console.log(`[CLUSTER] Respawned worker ${id} (PID: ${newWorker.pid})`);
      }
    }
  };

  // Check workers every 5 seconds
  setInterval(checkWorkers, 5000);

  // Keep primary process alive
  setInterval(() => {}, 1000);

} else {
  // Worker process - run the Express server
  await import('./server.js');
}
