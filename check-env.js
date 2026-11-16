// Vivan Angels - local environment check
// Run from the vivan-angels folder:  node check-env.js
// Optional DB settings (defaults shown):
//   Windows PowerShell:  $env:DB_USER="root"; $env:DB_PASS="yourpass"; node check-env.js
//   Mac/Linux:           DB_USER=root DB_PASS=yourpass node check-env.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const results = [];
const log = (ok, step, detail) => {
  results.push(ok);
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${step}${detail ? ' -> ' + detail : ''}`);
};
const run = (cmd) => {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return null; }
};

(async () => {
  console.log(`\nOS: ${process.platform} ${process.arch}\n`);

  // Step 1: Node.js (need 18+)
  const major = parseInt(process.versions.node.split('.')[0], 10);
  log(major >= 18, 'Step 1: Node.js 18+', `found v${process.versions.node}`);

  // Step 2: npm
  const npmV = run('npm --version');
  log(!!npmV, 'Step 2: npm installed', npmV || 'not found');

  // Step 3: Git
  const gitV = run('git --version');
  log(!!gitV, 'Step 3: Git installed', gitV || 'not found');

  // Step 4: MySQL client / server binary
  const mysqlV = run('mysql --version');
  log(!!mysqlV, 'Step 4: MySQL client on PATH', mysqlV || 'not found (install MySQL 8 or add it to PATH)');

  // Step 5: schema file present
  const schemaPath = path.join(__dirname, 'database', 'schema.sql');
  log(fs.existsSync(schemaPath), 'Step 5: database/schema.sql exists', schemaPath);

  // Step 6: MySQL connection (needs: npm install mysql2)
  let mysql;
  try { mysql = require('mysql2/promise'); }
  catch { log(false, 'Step 6: mysql2 package', 'run "npm install mysql2" in this folder, then re-run'); }

  if (mysql) {
    const cfg = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
    };
    let conn;
    try {
      conn = await mysql.createConnection(cfg);
      const [[v]] = await conn.query('SELECT VERSION() AS v');
      log(true, 'Step 6: MySQL connection', `server ${v.v}`);

      // Step 7: database + tables
      const [dbs] = await conn.query("SHOW DATABASES LIKE 'vivan_angels'");
      if (dbs.length === 0) {
        log(false, 'Step 7: vivan_angels database', 'not created yet (we will import schema.sql next)');
      } else {
        await conn.query('USE vivan_angels');
        const [tables] = await conn.query('SHOW TABLES');
        const expected = ['users','agents','caretakers','caretaker_documents','leads',
          'lead_followups','jobs','payments','commissions','audit_log'];
        const have = tables.map(t => Object.values(t)[0]);
        const missing = expected.filter(t => !have.includes(t));
        log(missing.length === 0, 'Step 7: all 10 tables present',
          missing.length ? 'missing: ' + missing.join(', ') : '');
      }
    } catch (e) {
      log(false, 'Step 6: MySQL connection', e.code || e.message);
    } finally {
      if (conn) await conn.end();
    }
  }

  const failed = results.filter(r => !r).length;
  console.log(`\n${failed === 0 ? 'All checks passed.' : failed + ' check(s) failed.'} Paste this full output back to Claude.\n`);
})();
