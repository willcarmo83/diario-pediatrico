const { verifyToken } = require("../utils/authUtils");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  // EventSource (usado no /stream de tempo real) não permite mandar headers customizados,
  // então SÓ para essa rota aceitamos o token via querystring como alternativa.
  // Trade-off consciente: o token fica visível em logs de acesso do servidor para essa rota
  // específica — aceitável para o MVP, mas em produção o ideal é um token de curta duração
  // exclusivo para abrir o stream (não o mesmo JWT de 30 dias usado no resto da API).
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : (req.path.endsWith("/stream") ? req.query.token : null);
  if (!token) return res.status(401).json({ error: "Token ausente. Faça login." });
  try {
    req.user = verifyToken(token); // { id, role, name }
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Você não tem permissão para essa ação." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
