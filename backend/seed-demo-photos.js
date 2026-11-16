// Creates non-personal placeholder passport photos for local demo caretakers.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const db = require('./src/config/db');

function makePhoto(seed) {
  const png = new PNG({ width: 96, height: 120 });
  const hue = (seed * 47) % 255;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const i = (png.width * y + x) << 2; const shirt = y > 72; const face = ((x - 48) ** 2 / 25 ** 2) + ((y - 48) ** 2 / 30 ** 2) < 1;
    png.data[i] = shirt ? 30 : face ? 225 : hue; png.data[i + 1] = shirt ? 100 + (seed * 13) % 80 : face ? 175 : 220; png.data[i + 2] = shirt ? 170 : face ? 120 : 245; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

(async () => {
  const dir = path.join(__dirname, 'uploads/documents'); fs.mkdirSync(dir, { recursive: true });
  const [[owner]] = await db.query("SELECT id FROM users WHERE role='owner' ORDER BY id LIMIT 1");
  const [caretakers] = await db.query('SELECT id,name FROM caretakers ORDER BY id');
  for (const c of caretakers) {
    const filename = `demo-photo-${c.id}.png`; const full = path.join(dir, filename);
    if (!fs.existsSync(full)) fs.writeFileSync(full, makePhoto(c.id));
    const [[photo]] = await db.query("SELECT id,file_url FROM caretaker_documents WHERE caretaker_id=? AND doc_type='photo' ORDER BY id DESC LIMIT 1", [c.id]);
    if (photo) await db.query('UPDATE caretaker_documents SET file_url=? WHERE id=? AND file_url LIKE "/uploads/documents/demo-%"', ['/uploads/documents/' + filename, photo.id]);
    else await db.query("INSERT INTO caretaker_documents (caretaker_id,doc_type,file_url,status,reviewed_by,reviewed_at) VALUES (?,?,?,'approved',?,NOW())", [c.id, 'photo', '/uploads/documents/' + filename, owner.id]);
  }
  console.log(`Dummy photos ready for ${caretakers.length} caretakers.`); await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
