const { verifyToken } = require("../utils/authUtils");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
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
