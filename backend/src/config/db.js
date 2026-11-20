const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'vivan_angels',

  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
};

if (isProduction) {
  if (!process.env.DB_SSL_CA_PATH) {
    throw new Error('DB_SSL_CA_PATH is required in production');
  }

  config.ssl = {
    ca: fs.readFileSync(process.env.DB_SSL_CA_PATH),
    rejectUnauthorized: true,
  };
}

module.exports = mysql.createPool(config);