const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dir = path.join(__dirname, '../../uploads/documents');
fs.mkdirSync(dir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) =>
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.pdf'].includes(path.extname(file.originalname).toLowerCase());
    ok ? cb(null, true) : cb(Object.assign(new Error('Only jpg, png or pdf files allowed'), { status: 400 }));
  },
});
upload.dir = dir;
module.exports = upload;
