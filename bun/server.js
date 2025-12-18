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

// Detect runtime
const RUNTIME = typeof Bun !== 'undefined' ? 'bun' : 'node';
const RUNTIME_VERSION = typeof Bun !== 'undefined' ? Bun.version : process.version;
console.log(`[RUNTIME] Running on: ${RUNTIME} ${RUNTIME_VERSION}`);

// Count modules loaded (works in both Node and Bun)
const modulesLoaded = typeof require.cache === 'object' ? Object.keys(require.cache).length : 'N/A';
console.log(`[TIMING] Modules loaded: ${modulesLoaded}`);

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
const PORT = process.env.PORT || 3000;

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
    runtime: RUNTIME,
    runtime_version: RUNTIME_VERSION,
    uptime_ms: uptime,
    uptime_formatted: moment.duration(uptime).humanize(),
    module_load_ms: MODULE_LOAD_TIME,
    modules_loaded: modulesLoaded,
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
  console.log(`[TIMING] Runtime: ${RUNTIME} ${RUNTIME_VERSION}`);
  console.log(`[TIMING] Process started at: ${PROCESS_START_ISO}`);
  console.log(`[TIMING] App ready at: ${new Date().toISOString()}`);
  console.log(`[TIMING] Module loading: ${MODULE_LOAD_TIME}ms`);
  console.log(`[TIMING] Modules loaded: ${modulesLoaded}`);
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
    modules_loaded: modulesLoaded,
    total_startup_ms: TOTAL_STARTUP_MS,
    runtime: RUNTIME,
    runtime_version: RUNTIME_VERSION
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
