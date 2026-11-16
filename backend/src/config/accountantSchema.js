const db = require('./db');

// Small, repeatable upgrade for the accountant payment workflow.
// Existing installations can start the server without running a separate migration.
async function ensureAccountantSchema() {
  const statements = [
    `ALTER TABLE commissions ADD COLUMN amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE commissions ADD COLUMN method ENUM('upi','bank_transfer','cash','other') NULL`,
    `ALTER TABLE commissions ADD COLUMN reference_no VARCHAR(80) NULL`,
    `ALTER TABLE commissions ADD COLUMN receipt_no VARCHAR(40) NULL`,
    `ALTER TABLE commissions ADD COLUMN proof_url VARCHAR(255) NULL`,
    `ALTER TABLE salary_payments ADD COLUMN amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE salary_payments ADD COLUMN method ENUM('upi','bank_transfer','cash','other') NULL`,
    `ALTER TABLE salary_payments ADD COLUMN receipt_no VARCHAR(40) NULL`,
    `ALTER TABLE salary_payments ADD COLUMN proof_url VARCHAR(255) NULL`,
    `ALTER TABLE salary_payments ADD COLUMN payout_provider VARCHAR(30) NULL`,
    `ALTER TABLE salary_payments ADD COLUMN provider_payout_id VARCHAR(80) NULL`,
    `ALTER TABLE salary_payments ADD COLUMN provider_status VARCHAR(30) NULL`,
    `ALTER TABLE salary_payments ADD COLUMN payout_url VARCHAR(500) NULL`,
    `ALTER TABLE payments ADD COLUMN receipt_no VARCHAR(40) NULL`,
    `ALTER TABLE payments ADD COLUMN next_due_date DATE NULL`,
    `ALTER TABLE payments ADD COLUMN proof_url VARCHAR(255) NULL`,
    `ALTER TABLE payments ADD COLUMN remarks VARCHAR(500) NULL`,
    `CREATE TABLE IF NOT EXISTS accountant_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_type ENUM('customer_payment','agent_commission','caretaker_salary') NOT NULL,
      source_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_date DATE NOT NULL,
      method ENUM('upi','bank_transfer','cash','other') NOT NULL,
      reference_no VARCHAR(80) NULL,
      remarks VARCHAR(255) NULL,
      created_by INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_accountant_tx_source (transaction_type, source_id)
    )`,
    `CREATE TABLE IF NOT EXISTS accountant_followups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category ENUM('customer','agent','caretaker') NOT NULL,
      entity_id INT NULL,
      entity_name VARCHAR(160) NOT NULL,
      pending_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      follow_up_date DATE NOT NULL,
      contact_method ENUM('call','whatsapp','email','other') NOT NULL DEFAULT 'call',
      response VARCHAR(500) NULL,
      commitment_date DATE NULL,
      next_follow_up DATE NULL,
      status ENUM('pending','resolved') NOT NULL DEFAULT 'pending',
      created_by INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS accountant_daily_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      report_date DATE NOT NULL,
      total_received DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
      net_cash_movement DECIMAL(10,2) NOT NULL DEFAULT 0,
      pending_transactions INT NOT NULL DEFAULT 0,
      customer_followups INT NOT NULL DEFAULT 0,
      agent_followups INT NOT NULL DEFAULT 0,
      caretaker_followups INT NOT NULL DEFAULT 0,
      payments_committed DECIMAL(10,2) NOT NULL DEFAULT 0,
      next_follow_up_dates VARCHAR(500) NULL,
      manager_issues VARCHAR(1000) NULL,
      remarks VARCHAR(1000) NULL,
      submitted_to_manager TINYINT(1) NOT NULL DEFAULT 0,
      created_by INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const sql of statements) {
    try { await db.query(sql); } catch (e) {
      // ALTER TABLE fails when the column already exists; that is expected.
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_TABLE_EXISTS_ERROR') throw e;
    }
  }
  await db.query("UPDATE commissions SET amount_paid=amount WHERE status='paid' AND amount_paid=0");
  await db.query("UPDATE salary_payments SET amount_paid=amount WHERE status='paid' AND amount_paid=0");
}

module.exports = ensureAccountantSchema;
