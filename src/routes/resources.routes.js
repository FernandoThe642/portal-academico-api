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

/**
 * GET /resources
 * Lista metadatos de recursos
 */
router.get("/", async (req, res) => {
  try {
    const q = `
      SELECT
        r.id,
        r.original_name,
        r.stored_name,
        r.mime_type,
        r.size_bytes,
        r.category_id,
        c.name AS category_name,
        r.created_at
      FROM resources r
      LEFT JOIN categories c ON c.id = r.category_id
      ORDER BY r.id DESC
    `;
    const r = await pool.query(q);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /resources/upload
 * Sube archivo y guarda metadata + log
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  const client = await pool.connect();

  try {
    if (!req.file) {
      return res.status(400).json({ error: "Falta el archivo (field: file)" });
    }

    const categoryIdRaw = req.body.category_id;
    const category_id =
      categoryIdRaw !== undefined && categoryIdRaw !== ""
        ? Number(categoryIdRaw)
        : null;

    if (category_id !== null && Number.isNaN(category_id)) {
      return res.status(400).json({ error: "category_id debe ser un número" });
    }

    await client.query("BEGIN");

    // Validar que la categoría exista
    if (category_id !== null) {
      const check = await client.query(
        "SELECT 1 FROM categories WHERE id = $1",
        [category_id]
      );
      if (check.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "category_id no existe" });
      }
    }

    const { originalname, filename, mimetype, size } = req.file;

    // Guardamos solo el nombre (ruta estable)
    const storagePath = filename;

    const qInsert = `
      INSERT INTO resources
      (original_name, stored_name, mime_type, size_bytes, storage_path, category_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const rInsert = await client.query(qInsert, [
      originalname,
      filename,
      mimetype,
      size,
      storagePath,
      category_id,
    ]);

    const newResource = rInsert.rows[0];

    // Log simple (solo hora)
    const qLog = `
      INSERT INTO logs (entity, entity_id, action)
      VALUES ($1, $2, $3)
    `;
    await client.query(qLog, [
      "resource",
      newResource.id,
      "RESOURCE_UPLOADED",
    ]);

    await client.query("COMMIT");

    res.status(201).json(newResource);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
