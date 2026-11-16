module.exports = (err, req, res, next) => {
  // Always log the actual error to your backend terminal for debugging
  console.error("SERVER ERROR TRACE:", err);

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Duplicate record: ' + err.sqlMessage });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large (max 5 MB)' });
  }

  const status = err.status || 500;
  res.status(status).json({ 
    error: status === 500 ? 'Server error' : err.message,
    details: err.message // Temporarily useful for seeing what went wrong
  });
};
