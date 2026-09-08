require("dotenv").config();
const { init } = require("../db");
const app = require("./app");

const PORT = process.env.PORT || 3333;

init()
  .then(() => {
    app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Falha ao iniciar o banco de dados:", err);
    process.exit(1);
  });
