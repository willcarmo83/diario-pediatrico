# Diário Pediátrico — Backend

API REST para o app de acompanhamento (água/banheiro) entre responsáveis e clínica.

## Como rodar

```bash
npm install
node seed.js        # cria dados de teste (2 famílias + 1 conta de clínica)
node src/server.js  # sobe em http://localhost:3333
```

Contas de teste (senha `123456` para todas):
| Email | Papel |
|---|---|
| marina@exemplo.com | mãe do Lucas |
| rafael@exemplo.com | pai do Lucas — **mesmo filho que a Marina** |
| carlos@exemplo.com | pai da Sofia |
| ana@clinica.com | equipe da clínica (vê todas as crianças) |

## Como os 3 requisitos foram resolvidos

**1) Vários pais registrando ao mesmo tempo**
Cada registro (`entries`) é um evento independente com seu próprio id — não existe um
"documento compartilhado" sendo escrito por duas pessoas, então não tem conflito de
concorrência a resolver. O SQLite roda em modo `WAL`, que permite leituras e escritas
simultâneas sem travar. Para a família ver a atualização do outro responsável em tempo real
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

## O que falta para ir pra uma clínica de verdade

Esse backend é o MVP funcional — validado ponta a ponta (login de dois responsáveis,
um editando o registro do outro, dashboard e diagnóstico calculando certo, clínica vendo
os dois responsáveis do mesmo filho). Antes de um ambiente real de clínica, ainda falta:

1. **Trocar SQLite por Postgres.** O SQL usado aqui é simples de propósito (sem recursos
   exclusivos do SQLite) — trocar o driver em `db/index.js` por `pg` e ajustar os poucos
   `datetime('now')` para `now()` é o suficiente. Vale nesse momento porque múltiplas
   instâncias do servidor (para escalar) não conseguem compartilhar um arquivo SQLite.
2. **Rate limiting e validação de payload mais robusta** (ex: `zod`) nas rotas públicas.
3. **Recuperação de senha e verificação de email.**
4. **LGPD**: esse é dado de saúde de criança. Precisa de: criptografia em repouso,
   política de retenção, exportação/apagamento de dados a pedido, e um termo de
   consentimento explícito dos responsáveis.
5. **Alertas automáticos** para a clínica (ex: "3 dias sem evacuar") — hoje o médico
   precisa abrir o dashboard; um job periódico rodando `/diagnostico` para cada criança
   e dependendo do resultado, notificando, é o próximo passo natural.
6. **Testes automatizados** (hoje a validação foi manual via curl, documentada acima).
