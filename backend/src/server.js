require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { init } = require("../db");
const authRoutes = require("./routes/auth");
const childrenRoutes = require("./routes/children");
const entriesRoutes = require("./routes/entries");
const dashboardRoutes = require("./routes/dashboard");
const invitesRoutes = require("./routes/invites");
const adminRoutes = require("./routes/admin");

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "100kb" }));

// Limite geral pra toda a API — impede que uma conta (ou um script automatizado)
// sobrecarregue o servidor ou encha o banco de dados com requisições em massa.
// Isso não substitui monitoramento humano, mas barra o cenário mais comum de abuso.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Aguarde alguns minutos e tente novamente." },
});
app.use(apiLimiter);

// Limite mais rígido só pra login/registro — dificulta força bruta de senha
// e criação em massa de contas falsas.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});
app.use("/auth", authLimiter);

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/children", childrenRoutes);
app.use("/children/:childId/entries", entriesRoutes);
app.use("/children/:childId", dashboardRoutes);
app.use("/entries", (req, res, next) => { req.url = "/entry" + req.url; next(); }, entriesRoutes);
app.use("/invites", invitesRoutes);
app.use("/admin", adminRoutes);

// Handler central de erros — cobre também rejeições de rotas async (Express 5).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno." });
});

const PORT = process.env.PORT || 3333;

init()
  .then(() => {
    app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Falha ao iniciar o banco de dados:", err);
    process.exit(1);
  });
