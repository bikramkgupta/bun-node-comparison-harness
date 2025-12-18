// Handle SSL for DigitalOcean managed databases (must be first)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Load some of the bulky packages to simulate real-world usage
const _ = require('lodash');
const moment = require('moment');
const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const winston = require('winston');

// Load dotenv for environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MODULE_LOAD_END = Date.now();
const MODULE_LOAD_TIME = MODULE_LOAD_END - MODULE_LOAD_START;
console.log(`[TIMING] Module loading time: ${MODULE_LOAD_TIME}ms`);

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
// Database Setup
// ============================================
const DB_CONNECT_START = Date.now();

// Parse connection string and set SSL
const connectionString = process.env.DATABASE_CONNECTION_STRING;
const pool = new Pool({
  connectionString: connectionString,
  ssl: connectionString && connectionString.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false
});

// Initialize database table
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS todos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        completed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const DB_CONNECT_END = Date.now();
    console.log(`[TIMING] Database initialization time: ${DB_CONNECT_END - DB_CONNECT_START}ms`);
    logger.info('Database table initialized successfully');
  } catch (error) {
    logger.error('Database initialization failed:', error.message);
  }
}

// ============================================
// Express App Setup
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts for React
}));
app.use(compression());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// Validation Schemas (using Joi)
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
    uptime_ms: uptime,
    uptime_formatted: moment.duration(uptime).humanize(),
    process_start: PROCESS_START_ISO,
    current_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    request_id: uuidv4()
  });
});

// Get all todos
app.get('/api/todos', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM todos ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching todos:', error.message);
    res.status(500).json({ error: 'Failed to fetch todos' });
  }
});

// Create a new todo
app.post('/api/todos', async (req, res) => {
  try {
    const { error, value } = todoSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const result = await pool.query(
      'INSERT INTO todos (title) VALUES ($1) RETURNING *',
      [value.title]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating todo:', error.message);
    res.status(500).json({ error: 'Failed to create todo' });
  }
});

// Toggle todo completion
app.patch('/api/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE todos
       SET completed = NOT completed, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating todo:', error.message);
    res.status(500).json({ error: 'Failed to update todo' });
  }
});

// Delete a todo
app.delete('/api/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM todos WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json({ message: 'Todo deleted successfully' });
  } catch (error) {
    logger.error('Error deleting todo:', error.message);
    res.status(500).json({ error: 'Failed to delete todo' });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// Start Server
// ============================================
async function startServer() {
  await initDatabase();

  app.listen(PORT, () => {
    const READY_TIME = Date.now();
    const TOTAL_STARTUP_MS = READY_TIME - PROCESS_START_TIME;

    console.log('');
    console.log('============================================');
    console.log('[TIMING] STARTUP METRICS');
    console.log('============================================');
    console.log(`[TIMING] Process started at: ${PROCESS_START_ISO}`);
    console.log(`[TIMING] App ready at: ${new Date().toISOString()}`);
    console.log(`[TIMING] Module loading: ${MODULE_LOAD_TIME}ms`);
    console.log(`[TIMING] Total startup time: ${TOTAL_STARTUP_MS}ms`);
    console.log('============================================');
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('============================================');
    console.log('');

    // Write timing to file (for Docker to capture)
    const timingData = {
      process_start: PROCESS_START_ISO,
      ready_at: new Date().toISOString(),
      module_load_ms: MODULE_LOAD_TIME,
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
      // Ignore file write errors in read-only containers
    }

    logger.info(`Server started in ${TOTAL_STARTUP_MS}ms`);
  });
}

startServer().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
