// ============================================
// TIMING INSTRUMENTATION - Process Start
// ============================================
const PROCESS_START_TIME = Date.now();
const PROCESS_START_ISO = new Date().toISOString();
console.log(`[TIMING] Process started at: ${PROCESS_START_ISO}`);
console.log(`[TIMING] Process start timestamp: ${PROCESS_START_TIME}`);

// ============================================
// Module Loading - This is what we're measuring
// ============================================
const MODULE_LOAD_START = Date.now();

// Core Express packages
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Load MANY packages to simulate real-world enterprise app
// Date/Time libraries
const _ = require('lodash');
const moment = require('moment');
const dayjs = require('dayjs');
const { format: formatDate } = require('date-fns');
const { DateTime } = require('luxon');

// HTTP clients (not used but loaded)
const axios = require('axios');

// Validation
const Joi = require('joi');
const yup = require('yup');
const { z } = require('zod');
const Ajv = require('ajv');

// ID generation
const { v4: uuidv4 } = require('uuid');
const { nanoid } = require('nanoid');

// Logging
const winston = require('winston');
const pino = require('pino');

// State management (loaded but not used)
const { createStore } = require('redux');
const { createSlice } = require('@reduxjs/toolkit');
const { produce } = require('immer');

// Utilities
const classnames = require('classnames');
const { Map, List } = require('immutable');
const R = require('ramda');
const { Subject } = require('rxjs');
const Bluebird = require('bluebird');
const async = require('async');
const EventEmitter3 = require('eventemitter3');

// More utilities
const semver = require('semver');
const { glob } = require('glob');
const debug = require('debug')('app');
const ms = require('ms');
const bytes = require('bytes');
const qs = require('qs');

// Load dotenv
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MODULE_LOAD_END = Date.now();
const MODULE_LOAD_TIME = MODULE_LOAD_END - MODULE_LOAD_START;
console.log(`[TIMING] Module loading time: ${MODULE_LOAD_TIME}ms`);
console.log(`[TIMING] Loaded ${Object.keys(require.cache).length} modules from cache`);

// ============================================
// Logger Setup
// ============================================
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// ============================================
// In-Memory Todo Storage (No Database)
// ============================================
let todos = [];
let nextId = 1;

// ============================================
// Express App Setup
// ============================================
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// Validation Schema
// ============================================
const todoSchema = Joi.object({
  title: Joi.string().min(1).max(255).required()
});

// ============================================
// API Routes
// ============================================

// Health check with timing info
app.get('/api/health', (req, res) => {
  const uptime = Date.now() - PROCESS_START_TIME;
  res.json({
    status: 'healthy',
    runtime: 'node',
    runtime_version: process.version,
    uptime_ms: uptime,
    uptime_formatted: moment.duration(uptime).humanize(),
    module_load_ms: MODULE_LOAD_TIME,
    modules_loaded: Object.keys(require.cache).length,
    process_start: PROCESS_START_ISO,
    current_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    request_id: uuidv4(),
    todo_count: todos.length
  });
});

// Get all todos
app.get('/api/todos', (req, res) => {
  res.json(todos);
});

// Create a new todo
app.post('/api/todos', (req, res) => {
  const { error, value } = todoSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const todo = {
    id: nextId++,
    title: value.title,
    completed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  todos.unshift(todo);
  res.status(201).json(todo);
});

// Toggle todo completion
app.patch('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const todoIndex = todos.findIndex(t => t.id === id);

  if (todoIndex === -1) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  todos[todoIndex] = {
    ...todos[todoIndex],
    completed: !todos[todoIndex].completed,
    updated_at: new Date().toISOString()
  };

  res.json(todos[todoIndex]);
});

// Delete a todo
app.delete('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const todoIndex = todos.findIndex(t => t.id === id);

  if (todoIndex === -1) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  todos.splice(todoIndex, 1);
  res.json({ message: 'Todo deleted successfully' });
});

// ============================================
// CPU-Heavy Benchmark Endpoints
// ============================================

// CPU-Heavy endpoint: Generate and sort 100,000 numbers (matches Strapi article test)
app.get('/api/cpu-heavy', (req, res) => {
  const startTime = Date.now();

  // Generate 100,000 random numbers
  const numbers = [];
  for (let i = 0; i < 100000; i++) {
    numbers.push(Math.random() * 1000000);
  }

  // Sort them
  numbers.sort((a, b) => a - b);

  const duration = Date.now() - startTime;

  res.json({
    runtime: 'node',
    runtime_version: process.version,
    operation: 'generate_and_sort_100k_numbers',
    duration_ms: duration,
    array_length: numbers.length,
    first_5: numbers.slice(0, 5),
    last_5: numbers.slice(-5)
  });
});

// Fibonacci endpoint (recursive, CPU intensive)
app.get('/api/fibonacci/:n', (req, res) => {
  const n = Math.min(parseInt(req.params.n) || 40, 45); // Cap at 45 to prevent timeout
  const startTime = Date.now();

  function fib(num) {
    if (num <= 1) return num;
    return fib(num - 1) + fib(num - 2);
  }

  const result = fib(n);
  const duration = Date.now() - startTime;

  res.json({
    runtime: 'node',
    runtime_version: process.version,
    operation: 'fibonacci',
    n: n,
    result: result,
    duration_ms: duration
  });
});

// ============================================
// Network Throughput Benchmark Endpoints
// ============================================

// Pre-generate payload buffers for network tests (avoids CPU overhead during test)
const PAYLOAD_1KB = Buffer.alloc(1024, 'X');
const PAYLOAD_CACHE = new Map();

function getPayload(sizeKB) {
  if (!PAYLOAD_CACHE.has(sizeKB)) {
    const size = Math.min(sizeKB, 10240); // Cap at 10MB
    PAYLOAD_CACHE.set(sizeKB, Buffer.alloc(size * 1024, 'X'));
  }
  return PAYLOAD_CACHE.get(sizeKB);
}

// Download endpoint - Test EGRESS throughput
// Returns a payload of specified size in KB (default 100KB, max 10MB)
app.get('/api/network/download/:sizeKB?', (req, res) => {
  const sizeKB = Math.min(parseInt(req.params.sizeKB) || 100, 10240);
  const startTime = Date.now();
  const payload = getPayload(sizeKB);

  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': payload.length,
    'X-Payload-Size-KB': sizeKB,
    'X-Runtime': 'node'
  });

  res.send(payload);
});

// Upload endpoint - Test INBOUND throughput
// Accepts any payload and reports size received
app.post('/api/network/upload', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  const startTime = Date.now();
  const bytesReceived = req.body ? req.body.length : 0;
  const duration = Date.now() - startTime;

  res.json({
    runtime: 'node',
    runtime_version: process.version,
    bytes_received: bytesReceived,
    kb_received: (bytesReceived / 1024).toFixed(2),
    mb_received: (bytesReceived / (1024 * 1024)).toFixed(4),
    duration_ms: duration
  });
});

// Concurrent connections test endpoint
// Holds connection open for specified duration to test max concurrent connections
app.get('/api/network/hold/:durationMs?', async (req, res) => {
  const duration = Math.min(parseInt(req.params.durationMs) || 1000, 30000); // Max 30s
  const startTime = Date.now();

  await new Promise(resolve => setTimeout(resolve, duration));

  res.json({
    runtime: 'node',
    runtime_version: process.version,
    held_duration_ms: Date.now() - startTime,
    requested_duration_ms: duration
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
  const READY_TIME = Date.now();
  const TOTAL_STARTUP_MS = READY_TIME - PROCESS_START_TIME;

  console.log('');
  console.log('============================================');
  console.log('[TIMING] STARTUP METRICS (No Database)');
  console.log('============================================');
  console.log(`[TIMING] Runtime: Node.js ${process.version}`);
  console.log(`[TIMING] Process started at: ${PROCESS_START_ISO}`);
  console.log(`[TIMING] App ready at: ${new Date().toISOString()}`);
  console.log(`[TIMING] Module loading: ${MODULE_LOAD_TIME}ms`);
  console.log(`[TIMING] Modules loaded: ${Object.keys(require.cache).length}`);
  console.log(`[TIMING] Total startup time: ${TOTAL_STARTUP_MS}ms`);
  console.log('============================================');
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('============================================');
  console.log('');

  // Write timing to file
  const timingData = {
    process_start: PROCESS_START_ISO,
    ready_at: new Date().toISOString(),
    module_load_ms: MODULE_LOAD_TIME,
    modules_loaded: Object.keys(require.cache).length,
    total_startup_ms: TOTAL_STARTUP_MS,
    runtime: 'node',
    runtime_version: process.version
  };

  try {
    fs.writeFileSync(
      path.join(__dirname, 'startup-timing.json'),
      JSON.stringify(timingData, null, 2)
    );
  } catch (e) {
    // Ignore file write errors
  }

  logger.info(`Server started in ${TOTAL_STARTUP_MS}ms`);
});
