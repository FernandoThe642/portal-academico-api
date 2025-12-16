// src/routes/users.routes.js
const express = require("express");
const pool = require("../db");
const router = express.Router();

// POST /users  -> registrar usuario (con password y role)
router.post("/", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email y password son requeridos" });
    }

    // 3. Definir el rol: si no se proporciona en el body, usa 'cliente' (el nuevo default)
    const userRole = role || 'cliente'; // ¡AJUSTE HECHO AQUÍ!

    const q = `
        INSERT INTO users (name, email, password, role) 
        VALUES ($1, $2, $3, $4) 
        RETURNING id, name, email, role, created_at
    `;
    
    const r = await pool.query(q, [name, email, password, userRole]);
    
    res.status(201).json(r.rows[0]);

  } catch (e) {
    if (e.code === '23505') { 
        return res.status(409).json({ error: 'El email ya está registrado.' });
    }
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;