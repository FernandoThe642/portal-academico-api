const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../db");
const router = express.Router();

const uploadDir = path.resolve(process.env.EFS_UPLOAD_DIR || "temp_uploads_local");

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

    // Guarda el Log simple (solo hora)
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

/**
 * GET /resources
 * Lista los metadatos de recursos
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
 * GET /resources/:id/view
 * Previsualización (inline) del archivo (imagen/pdf/etc.)
 */
router.get("/:id/view", async (req, res) => {
  try {
    const { id } = req.params;

    const q = `
      SELECT original_name, stored_name, mime_type
      FROM resources
      WHERE id = $1
    `;
    const r = await pool.query(q, [id]);

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Recurso no encontrado" });
    }

    const file = r.rows[0];

    const baseDir = path.resolve(process.env.EFS_UPLOAD_DIR || "temp_uploads_local");
    const filePath = path.join(baseDir, file.stored_name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Archivo no existe", filePath });
    }

    // Content-Type correcto para que el navegador lo muestre
    if (file.mime_type) res.setHeader("Content-Type", file.mime_type);

    // Inline = se muestra en el navegador (preview)
    res.setHeader("Content-Disposition", `inline; filename="${file.original_name}"`);

    return res.sendFile(filePath);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /resources/:id/download
 * Descarga el archivo por id
 */
router.get("/:id/download", async (req, res) => {
  try {
    const { id } = req.params;

    const q = `
      SELECT original_name, stored_name
      FROM resources
      WHERE id = $1
    `;
    const r = await pool.query(q, [id]);

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Recurso no encontrado" });
    }

    const file = r.rows[0];
    const filePath = path.join(uploadDir, file.stored_name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Archivo no existe", filePath });
    }

    return res.download(filePath, file.original_name);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


module.exports = router;
