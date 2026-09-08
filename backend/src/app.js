const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

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

// Rate limiting fica desligado em teste — senão uma suíte com muitas chamadas de
// login/registro esbarra no limite e os testes falham por um motivo que não é bug.
const isTest = process.env.NODE_ENV === "test";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Aguarde alguns minutos e tente novamente." },
});
if (!isTest) app.use(apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});
if (!isTest) app.use("/auth", authLimiter);

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

module.exports = app;
