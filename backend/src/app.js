const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const audit = require('./middleware/audit');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(audit);

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'vivan-angels', version: 2 }));
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

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);
module.exports = app;
