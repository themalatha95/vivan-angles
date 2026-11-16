require('dotenv').config();
const app = require('./src/app');
const db = require('./src/config/db');
const ensureAccountantSchema = require('./src/config/accountantSchema');

const PORT = process.env.PORT || 5000;
(async () => {
  try {
    await db.query('SELECT 1');
    await ensureAccountantSchema();
    console.log('MySQL connected');
  } catch (e) {
    console.error('MySQL connection failed:', e.code || e.message);
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`Vivan Angels API running on http://localhost:${PORT}`));
})();
