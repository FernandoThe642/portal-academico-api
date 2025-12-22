require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const usersRoutes = require("./routes/users.routes");
const resourcesRoutes = require("./routes/resources.routes");

const app = express();
app.use(cors());
app.use(express.json());


// Health check
app.get("/health", (req, res) => res.json({ ok: true }));

// Rutas API
app.use("/users", usersRoutes);
app.use("/resources", resourcesRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on :${port}`));
