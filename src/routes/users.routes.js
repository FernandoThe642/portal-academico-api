const express = require("express");
const pool = require("../db");
const router = express.Router();

/**
 * POST /users
 * Registra un usuario y guarda hora de registro en log
 */
router.post("/", async (req, res) => {
  const client = await pool.connect();

  try {
    const { name, email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email y password son requeridos" });
    }

    const allowedRoles = ["estudiante", "profesor"];
    const userRole = role && allowedRoles.includes(role) ? role : "estudiante";

    await client.query("BEGIN");

    const qUser = `
      INSERT INTO users (name, email, password, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role
    `;

    const rUser = await client.query(qUser, [
      name || null,
      email,
      password,
      userRole,
    ]);

    const newUser = rUser.rows[0];

    const qLog = `
      INSERT INTO logs (entity, entity_id, action)
      VALUES ($1, $2, $3)
    `;
    await client.query(qLog, ["user", newUser.id, "USER_CREATED"]);

    await client.query("COMMIT");
    res.status(201).json(newUser);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/**
 * GET /users
 * Obtiene la lista de usuarios
 */
router.get("/", async (req, res) => {
  try {
    const q = `
      SELECT id, name, email, role
      FROM users
      ORDER BY id DESC
    `;
    const r = await pool.query(q);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
