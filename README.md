# Diário Pediátrico — Backend

API REST para o app de acompanhamento (água/banheiro) entre responsáveis e clínica.
Banco de dados: **Postgres** (Neon, Supabase, RDS — qualquer um serve).

## Como rodar localmente

```bash
npm install
node seed.js     # cria dados de teste (2 famílias + 1 conta de clínica)
npm start        # sobe em http://localhost:3333
```

Se a variável `DATABASE_URL` não estiver definida, o servidor sobe automaticamente com
um **Postgres em memória** (`pg-mem`) só para você testar sem instalar nada — os dados
somem quando o processo reinicia. Pra usar de verdade (e pra fazer deploy), defina
`DATABASE_URL` no `.env` (veja `.env.example`).

Contas de teste (senha `123456` para todas):
| Email | Papel |
|---|---|
| marina@exemplo.com | mãe do Lucas |
| rafael@exemplo.com | pai do Lucas — **mesmo filho que a Marina** |
| carlos@exemplo.com | pai da Sofia |
| ana@clinica.com | equipe da clínica (vê todas as crianças) |

## Deploy gratuito (Neon + Render + Vercel)

**1. Banco — Neon (Postgres gratuito)**
1. Crie uma conta em [neon.tech](https://neon.tech), crie um projeto.
2. Copie a "Connection string" (formato `postgresql://usuario:senha@host/banco?sslmode=require`).

**2. Backend — Render (plano free)**
1. Crie conta em [render.com](https://render.com), conecte seu GitHub.
2. "New +" → "Web Service" → selecione o repositório → pasta `backend`.
3. Build command: `npm install` · Start command: `npm start`.
4. Em "Environment", adicione as variáveis:
   - `DATABASE_URL` = a connection string do Neon
   - `JWT_SECRET` = um valor aleatório longo (não reaproveite o de dev)
   - `CORS_ORIGIN` = a URL que a Vercel vai te dar pro front (dá pra deixar `*` no começo e trocar depois)
5. Depois do primeiro deploy, rode `node seed.js` **uma vez** apontando pro Neon (localmente,
   com `DATABASE_URL` do Neon no seu `.env`) se quiser os dados de teste — ou simplesmente
   use a tela de cadastro do app.
6. Plano free do Render "dorme" depois de ~15min sem uso — a primeira requisição depois disso
   demora uns 30-50s pra responder (as seguintes voltam ao normal). Isso não afeta os dados,
   só a velocidade da primeira chamada.

**3. Frontend — Vercel (plano free)**
1. Renomeie `frontend/app.html` para `frontend/index.html` (Vercel serve `index.html` como
   página padrão).
2. Crie conta em [vercel.com](https://vercel.com), "Add New" → "Project" → importe o repositório,
   apontando o "Root Directory" pra pasta `frontend`. Framework preset: "Other".
3. Depois do deploy, abra o app, clique em "endereço da API" na tela de login e cole a URL
   que o Render te deu (ex: `https://seu-app.onrender.com`) — ele lembra disso no navegador
   depois da primeira vez.
4. Volte no Render e atualize `CORS_ORIGIN` pra URL exata que a Vercel te deu.

## Como os 3 requisitos foram resolvidos

**1) Vários pais registrando ao mesmo tempo**
Cada registro (`entries`) é um evento independente com seu próprio id — não existe um
"documento compartilhado" sendo escrito por duas pessoas, então não tem conflito de
concorrência a resolver. Para a família ver a atualização do outro responsável em tempo real
(sem dar refresh), tem um endpoint de **Server-Sent Events**:
`GET /children/:childId/entries/stream` — cada registro criado, editado ou apagado é
transmitido na hora pra quem estiver conectado (o app do celular do pai, o dashboard da mãe,

o painel da clínica).

**2) Um responsável com mais de um filho**
Tabela de associação `guardian_child` (N:N) — um `user_id` pode aparecer em várias linhas,
uma por filho.

**3) Pai e mãe registrando pelo mesmo filho**
Mesma tabela `guardian_child`: um `child_id` pode ter várias linhas, uma por responsável,
cada uma com seu `parentesco` (MAE/PAI/OUTRO). Isso significa: contas separadas, login
separado, mas ambos enxergam e podem editar o histórico do mesmo filho — o campo
`created_by_id` em cada registro guarda quem efetivamente lançou aquele dado, e toda edição
gera uma linha em `entry_audit` (quem mudou o quê e quando), então dá pra saber que "o pai
corrigiu um registro que a mãe fez" sem perder o histórico original.

## Endpoints principais

```
POST   /auth/register              { name, email, password, role }
POST   /auth/login                 { email, password }

GET    /children                   crianças do usuário logado (ou todas, se CLINICA)
POST   /children                   { name, birthdate, parentesco } — cria + vincula quem criou
POST   /children/:id/guardians     { email, parentesco } — vincula um 2º responsável

POST   /children/:id/entries       { type: AGUA|BANHEIRO, subtype, timestamp?, note? }
GET    /children/:id/entries       histórico (filtros ?desde=&ate=)
GET    /children/:id/entries/stream   tempo real (SSE)
PUT    /entries/:entryId           edita (gera auditoria)
DELETE /entries/:entryId           soft delete (gera auditoria)

GET    /children/:id/dashboard?period=diario|mensal|anual
GET    /children/:id/diagnostico   variação % dos últimos 7 dias vs. 7 anteriores
```

Todas as rotas (exceto `/auth/*`) exigem header `Authorization: Bearer <token>`.

## Segurança da autenticação — o que já está certo e o que muda em produção

**Já está correto hoje:**
- A senha só trafega **uma vez**, no login (`POST /auth/login`, no corpo da requisição — nunca na URL/query string, nunca em log).
- Ela nunca é guardada em texto puro: `bcrypt` gera um hash irreversível (`password_hash`) e é isso que fica no banco.
- Depois do login, a senha não é mais usada: todo o resto da navegação usa o **token JWT** (`Authorization: Bearer <token>`), que expira em 30 dias e não permite descobrir a senha original.
- Mensagem de erro genérica ("Email ou senha inválidos") — não revela se foi o email ou a senha que errou, o que dificulta um ataque de enumeração de contas.
- Rate limit de 20 tentativas/15min por IP em `/auth/*` — dificulta força bruta.
- `helmet()` ativado — headers de segurança padrão (evita sniffing de MIME, clickjacking, etc.).
- Body limitado a 100kb — evita payload gigante como vetor de ataque.

**O que só existe de verdade quando isso for hospedado (não dá pra testar isso no localhost):**
- **HTTPS obrigatório.** Sem TLS, a senha do login trafega em texto puro pela rede, hash ou não — quem estiver "no meio do caminho" (wifi público, proxy malicioso) consegue capturar a senha antes mesmo dela virar hash no servidor. Qualquer host decente (Render, Railway, Fly.io) já entrega HTTPS de graça — só não desative.
- **`CORS_ORIGIN` travado no domínio exato do front** (hoje está `*` para funcionar em localhost). Em produção, `cors *` + token de autenticação é uma combinação perigosa: qualquer site poderia tentar chamar sua API usando o token de quem estiver logado. Trocar via variável de ambiente, sem mudar código.
- **Trocar o `JWT_SECRET`** do `.env.example` por um valor aleatório longo, gerado só para produção — nunca reaproveitar o de desenvolvimento.

## O que falta para ir pra uma clínica de verdade

Esse backend é o MVP funcional — validado ponta a ponta (login de dois responsáveis,
um editando o registro do outro, dashboard e diagnóstico calculando certo, clínica vendo
os dois responsáveis do mesmo filho). Antes de um ambiente real de clínica, ainda falta:

1. **Rate limiting e validação de payload mais robusta** (ex: `zod`) nas rotas públicas.
2. **Recuperação de senha e verificação de email.**
3. **LGPD**: esse é dado de saúde de criança. Precisa de: criptografia em repouso,
   política de retenção, exportação/apagamento de dados a pedido, e um termo de
   consentimento explícito dos responsáveis.
4. **Alertas automáticos** para a clínica (ex: "3 dias sem evacuar") — hoje o médico
   precisa abrir o dashboard; um job periódico rodando `/diagnostico` para cada criança
   e dependendo do resultado, notificando, é o próximo passo natural.
5. **Testes automatizados** (hoje a validação foi manual via curl, documentada acima).
