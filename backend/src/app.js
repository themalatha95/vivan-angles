
const express = require('express');
const cors = require('cors');
const path = require('path');

const errorHandler = require('./middleware/errorHandler');
const audit = require('./middleware/audit');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));

app.use(express.json());
app.use(audit);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'vivan-angels',
    version: 2
  });
});

// API Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/audit', require('./routes/audit.routes'));
app.use('/api/agents', require('./routes/agents.routes'));
app.use('/api/caretakers', require('./routes/caretakers.routes'));
app.use('/api/leads', require('./routes/leads.routes'));
app.use('/api/jobs', require('./routes/jobs.routes'));
app.use('/api/payments', require('./routes/payments.routes'));
app.use('/api/salary', require('./routes/salary.routes'));
app.use('/api/commissions', require('./routes/commissions.routes'));
app.use('/api/expenses', require('./routes/expenses.routes'));
app.use('/api/attendance', require('./routes/attendance.routes'));
app.use('/api/reports', require('./routes/reports.routes'));
app.use('/api/accountant', require('./routes/accountant.routes'));

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.resolve(
    __dirname,
    '../../frontend/dist'
  );

  // Serve React static files
  app.use(express.static(frontendPath));

  // React Router fallback (Express 4 and 5 compatible)
  app.use((req, res, next) => {
    // Do not serve React HTML for missing API routes
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      return next();
    }

    // Only handle browser page requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    // Missing static assets should not return index.html
    if (path.extname(req.path)) {
      return next();
    }

    res.sendFile(
      path.join(frontendPath, 'index.html'),
      (err) => {
        if (err) next(err);
      }
    );
  });
}

// API and other unmatched routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found'
  });
});

// Central error handler
app.use(errorHandler);

module.exports = app;

