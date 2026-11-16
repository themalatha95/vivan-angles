// Small dependency-free PDF writer for caretaker downloads. It intentionally
// keeps the output text-first so it works in local development and production.
function esc(value) {
  return String(value ?? '-').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function makePdf(title, lines) {
  const text = ['BT', '/F1 18 Tf', '50 780 Td', `(${esc(title)}) Tj`, '/F1 10 Tf', '0 -28 Td'];
  lines.forEach((line) => { text.push(`(${esc(line)}) Tj`, '0 -16 Td'); });
  text.push('ET');
  const stream = text.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  let out = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { out += String(offset).padStart(10, '0') + ' 00000 n \n'; });
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function caretakerLines(c) {
  return [
    `Caretaker ID: ${c.va_id || '-'}`,
    `Full name: ${c.name || '-'}`,
    `Mobile: ${c.phone || '-'}`,
    `Email: ${c.email || '-'}`,
    `Service: ${c.service_label || c.service_type || '-'}`,
    `Experience: ${c.experience_years || 0} years`,
    `Skills: ${c.skills || '-'}`,
    `Languages: ${c.languages || '-'}`,
    `Address: ${c.address || c.area || '-'}`,
    `Status: ${c.status || '-'}`,
  ];
}

module.exports = { makePdf, caretakerLines };
