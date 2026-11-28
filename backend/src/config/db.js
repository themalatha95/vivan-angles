const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
const useSSL = process.env.DB_SSL === 'true';

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  connectTimeout: 10000,
};

if (useSSL) {
  if (!process.env.DB_SSL_CA_PATH) {
    throw new Error('DB_SSL_CA_PATH is required');
  }

  config.ssl = {
    ca: fs.readFileSync(process.env.DB_SSL_CA_PATH),
    rejectUnauthorized: true,
    verifyIdentity: true,
  };
} else if (
  isProduction &&
  process.env.DB_ALLOW_INSECURE !== 'true'
) {
  throw new Error('Secure database connection required');
}

module.exports = mysql.createPool(config);