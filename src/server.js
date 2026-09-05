require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const childrenRoutes = require("./routes/children");
const entriesRoutes = require("./routes/entries");
const dashboardRoutes = require("./routes/dashboard");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/children", childrenRoutes);
// entries e dashboard são aninhados em /children/:childId/...
app.use("/children/:childId/entries", entriesRoutes);
app.use("/children/:childId", dashboardRoutes);
// edição/remoção de um registro específico (não precisa do childId na URL)
app.use("/entries", (req, res, next) => { req.url = "/entry" + req.url; next(); }, entriesRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno." });
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));
