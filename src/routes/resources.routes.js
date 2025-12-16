const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer"); 
const pool = require("../db");
const router = express.Router();

const uploadDir = process.env.EFS_UPLOAD_DIR || "./temp_uploads_local";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safe}`); 
  },
});
const upload = multer({ storage });

// GET /resources  -> listar metadatos
router.get("/", async (req, res) => {
  try {
    const q = `SELECT id, original_name, stored_name, mime_type, size_bytes, created_at FROM resources ORDER BY id DESC`;
    const r = await pool.query(q);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /resources/upload  -> subir archivo a almacenamiento y guardar metadata
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Falta el archivo (field: file)" });

    const { originalname, filename, mimetype, size } = req.file;

    const q = `
      INSERT INTO resources (original_name, stored_name, mime_type, size_bytes, storage_path)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, original_name, stored_name, mime_type, size_bytes, created_at
    `;
    const storagePath = path.join(uploadDir, filename);
    const r = await pool.query(q, [originalname, filename, mimetype, size, storagePath]);

    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;