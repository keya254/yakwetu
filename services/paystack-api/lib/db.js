'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'sinema-db',
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || 'sinema',
  password: process.env.POSTGRES_PASSWORD || 'change-me',
  database: process.env.POSTGRES_DB || 'sinema',
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

// Idle client errors must be handled or Node will exit
pool.on('error', (err) => {
  console.error('postgres idle client error', err.message || err);
});

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function withClient(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withClient };
