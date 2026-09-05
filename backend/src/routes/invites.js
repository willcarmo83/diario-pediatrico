const express = require("express");
const { pool } = require("../../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// DELETE /invites/:inviteId — revoga um código (ex: vazou, ou família não é mais paciente)
router.delete("/:inviteId", requireRole("CLINICA"), async (req, res) => {
  await pool.query("UPDATE invites SET revoked_at = now() WHERE id = $1", [req.params.inviteId]);
  res.status(204).send();
});

module.exports = router;
