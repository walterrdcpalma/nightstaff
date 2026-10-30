# DEPLOY.md — Pôr o Night Staff em produção

> Guia para o **Walter** executar à mão, por esta ordem. Os agentes **não** fazem deploy, não tocam em produção e não mexem em segredos (CLAUDE.md, regras 2 e 3).
> Aqui não há chaves, URLs nem palavras-passe reais: só os **nomes** dos segredos e marcadores como `<project-ref>`. Os valores ficam no painel do Supabase, no Vault e no alojamento do site.
> Os comandos usam a CLI do Supabase que vem no projeto (`npx supabase`, versão do `package.json`). O que não deu para confirmar no repositório está marcado **confirmar no painel**.

Marcadores usados:
- `<project-ref>`: o identificador do projeto de produção (20 letras; está no URL do painel e em *Project Settings*).
- `<URL do projeto>`: `https://<project-ref>.supabase.co`.
- `<URL do site>`: o endereço final do web (passo 6), por exemplo `https://nightstaff.<alojamento>`.

---

## Lista de verificação

### 1. Projeto Supabase de produção
1. Criar o projeto no painel do Supabase (região perto de Lisboa, por exemplo Europa Ocidental). Guardar a palavra-passe da BD num gestor de palavras-passe, nunca no repositório.
2. No terminal, na raiz do repositório:
   ```sh
   npm ci
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push --dry-run   # mostra as migrações que vão ser aplicadas
   npx supabase db push
   ```
   - O `db push` aplica só as migrações de `supabase/migrations/`. **Não** usar `--include-seed`: o `supabase/seed.sql` é só para o Supabase local.
   - **Não** usar `npx supabase config push`: o `supabase/config.toml` é o do Supabase local (`site_url` em `http://localhost:5173`). O Auth configura-se no painel (passo 4).
3. **Confirmar:**
   - `npx supabase db push --dry-run` volta a correr e diz que não há nada para aplicar.
   - No painel, em *Database → Extensions*, `pg_cron` e `pg_net` estão ativas (as migrações fazem `create extension if not exists`). Em *Project Settings → Vault* (ou *Integrations → Vault*; **confirmar no painel**), o Vault está disponível.
   - No *SQL Editor*, existem as tabelas `players`, `rooms`, `room_players`, `games`, `game_players`, `actions`, `nights`, `ledger` e `rankings`, todas com RLS:
     ```sql
     select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
     ```
     Todas as linhas com `rowsecurity = true`.

### 2. Segredos do Vault e pg_cron
O `pg_cron` chama a `resolve-night` de hora a hora (ao minuto 0) e lê o URL e a chave de dois segredos do Vault: `project_url` e `service_role_key` (CLAUDE.md, "Resolução da noite").

1. Copiar a chave `service_role` *legacy* (um JWT, começa por `eyJ`) em *Project Settings → API Keys* (**confirmar no painel**). Não a colar em mais lado nenhum.
   - Não usar a chave secreta nova (`sb_secret_…`): não é um JWT, e com a verificação de JWT ligada (passo 3) o gateway das Edge Functions recusa-a. Usá-la exigiria outra configuração (**confirmar no painel**).
2. No *SQL Editor* do projeto de produção:
   ```sql
   select vault.create_secret('<URL do projeto>', 'project_url');
   select vault.create_secret('<chave service_role>', 'service_role_key');
   ```
   - `project_url` é o URL sem `/` no fim: a chamada junta-lhe `/functions/v1/resolve-night`.
   - Fechar o separador do SQL Editor depois de correr, para a chave não ficar à vista no histórico. Se o painel guardar a consulta, apagá-la.
3. **Confirmar:**
   ```sql
   select name from vault.decrypted_secrets where name in ('project_url', 'service_role_key');  -- 2 linhas (só o nome)
   select jobname, schedule, active from cron.job;  -- resolve-night | 0 * * * * | true
   ```
   Depois da primeira hora certa (com a função já publicada, passo 3):
   ```sql
   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;  -- succeeded
   select status_code, created from net._http_response order by created desc limit 5;                     -- 200
   ```

### 3. Edge Function `resolve-night`
É a única Edge Function. Importa o motor de `engine/` e os bots de `sim/` por caminho relativo.
```sh
npx supabase functions deploy resolve-night
```
- Deixar a verificação de JWT ligada, que é a predefinição: **não** usar `--no-verify-jwt`. O pg_cron manda a `service_role` e o web manda o JWT do jogador.
- O `SUPABASE_URL` e o `SUPABASE_SERVICE_ROLE_KEY` são postos pelo Supabase nas funções publicadas. Não criar segredos com esses nomes (`npx supabase secrets list` só para ver).
- Se o deploy acusar erro nos imports de `../../../engine` ou `../../../sim`, **parar** e abrir uma tarefa: não mudar código à pressa em produção.

**Confirmar:**
- **Sem corpo (o pg_cron):** pode-se esperar pela hora certa e ver o passo 2. Para testar já, a partir do terminal (a chave só no terminal, nunca num ficheiro):
  ```sh
  curl -s -X POST '<URL do projeto>/functions/v1/resolve-night' \
    -H "Authorization: Bearer <chave service_role>" -H 'Content-Type: application/json' -d '{}'
  ```
  Resposta `200` com `{"today":"AAAA-MM-DD","done":[]}`: sem salas a decorrer, não há nada a fazer.
- **Com `{ room_id, night }` (Passar o dia):** testa-se pelo web, no teste de fumo (passo 7). Sem sessão, responde `401`: com a verificação de JWT ligada, quem recusa é o gateway, antes de a função correr.

### 4. Auth
No painel, em *Authentication* (**confirmar no painel** os nomes exatos dos menus):
1. **Registo aberto:** *Sign In / Providers* → *Allow new users to sign up* **ligado**, e o fornecedor **Email** ligado (o magic link precisa dele). Corresponde a `enable_signup = true` (RULES.md §1 v6).
2. **URLs:** *URL Configuration*:
   - *Site URL* = `<URL do site>`;
   - *Redirect URLs* = `<URL do site>` (e `<URL do site>/**`, se o painel pedir o padrão). O web pede o regresso a `window.location.origin`.
3. **Confirmar:** só depois do passo 6 (com o site no ar), pedir um magic link no site e ver que o link do email volta ao `<URL do site>`, e não ao `localhost`.

### 5. Email (SMTP próprio)
O serviço de email que vem com o Supabase só envia para membros da organização e tem um limite de 2 mensagens por hora. Não serve para os amigos receberem o magic link.

1. **Criar conta num fornecedor de SMTP** (por exemplo Brevo ou Resend) e **verificar o domínio** do remetente (os registos SPF e DKIM que o fornecedor indicar, no DNS do domínio). Sem domínio verificado, os emails caem no spam ou são recusados.
2. **Criar as credenciais SMTP** no fornecedor: anfitrião, porta, utilizador e palavra-passe (ou chave de API). Os valores estão na página de SMTP do fornecedor: **confirmar lá**, não os copiar de outro sítio.
3. **No painel do Supabase**, *Authentication → Emails → SMTP Settings* (**confirmar no painel**), ligar o SMTP próprio e preencher:
   - **Sender email:** por exemplo `noite@<o teu domínio>`, do domínio verificado;
   - **Sender name:** `Night Staff`;
   - anfitrião, porta, utilizador e palavra-passe do fornecedor.
4. Em *Authentication → Rate Limits* (**confirmar no painel**), ver o limite de emails por hora: com SMTP próprio pode subir, e um grupo de amigos chega para um valor baixo.
5. **Confirmar (teste de envio):** no site, pedir um magic link para um email teu que **não** seja membro da organização no Supabase. O email chega em menos de um minuto, do remetente certo, e o link entra no site. No fornecedor de SMTP, o envio aparece como entregue.

### 6. Web (site estático)
O web é um site estático (Vite) sem router: não precisa de reescritas de URL. As variáveis `VITE_*` entram no bundle **no build**.

1. No alojamento (por exemplo Cloudflare Pages, Netlify ou Vercel), ligar o repositório e configurar:
   - **Build command:** `npm ci && npm run build`
   - **Output directory:** `web/dist`
   - **Node:** 24, a versão da CI (`.github/workflows/test.yml`).
   - **Variáveis de ambiente:**
     - `VITE_SUPABASE_URL` = `<URL do projeto>`
     - `VITE_SUPABASE_ANON_KEY` = a chave **pública** (*anon* ou *publishable*) em *Project Settings → API Keys*. **Nunca a `service_role` nem a chave secreta.**
2. Publicar e anotar o endereço final: é o `<URL do site>`. Voltar ao passo 4 e pô-lo em *Site URL* e *Redirect URLs*.
3. **Confirmar:**
   - O site abre e mostra "Entrada do pessoal".
   - Para ver que o bundle não tem segredos, antes de publicar, no repositório: `npm test`. O `web/secrets.test.ts` faz o build e falha se aparecer uma chave que não seja a pública. No alojamento, a chave pública é a única variável do web.
   - Nas ferramentas do browser (*Network*), os pedidos vão para `<URL do projeto>` com a chave pública.

### 7. Teste de fumo
Com duas contas de email tuas (A e B) e, se der, um terceiro amigo (ou uma terceira conta, C):
1. **A:** entrar com um email novo → chega o magic link → escolher o nome → **As minhas salas**.
2. **A:** **Criar sala** → aparece o lobby com o código. **B** (e C): entrar com o código. Com 3 ou mais, **A** carrega em **Começar** e a noite 1 abre logo.
3. Cada um escolhe a ação e confirma. **A** não vê a escolha de **B**.
4. **No dia seguinte**, depois das 00:00 de Lisboa (o cron corre ao minuto 0), abrir a **☀️ Manhã**: a história da noite 1 e o relatório privado de cada um. No SQL Editor: `select game_id, night, resolved_at from nights order by resolved_at desc limit 3;`
5. **Sala contra bots:** **A** cria uma sala contra 3 bots, escolhe, carrega em **⏭️ Passar o dia** e vê a Manhã da noite 1 logo a seguir. Repetir até à noite 9, ou só algumas noites: o ranking e o 🏆 Funcionário do Mês aparecem nos Pontos no fim.
6. **❓ Ajuda** abre e fecha. **🪪 o meu nome** muda e aparece nas salas.

Se tudo correr bem, o jogo está no ar.

### 8. Se correr mal
- **Logs da função:** painel → *Edge Functions → resolve-night → Logs*. As ações inválidas aparecem como `Ações inválidas tratadas como STAY`, e os erros como `resolve-night falhou` ou `Passar o dia falhou`.
- **Logs do cron:** `select * from cron.job_run_details order by start_time desc limit 20;` e `select * from net._http_response order by created desc limit 20;` (o `status_code` e o `content` da resposta da função).
- **Noite que não resolveu:** a função é idempotente e recupera noites em atraso. Corrigido o problema (segredos do Vault, função publicada), chamá-la uma vez como no passo 3, ou esperar pela hora seguinte.
- **Repor uma versão anterior da função:** `git checkout <commit bom>` e `npx supabase functions deploy resolve-night`, e depois voltar ao `main`.
- **Base de dados:** **nunca apagar dados de produção sem backup.** Antes de qualquer correção manual:
  ```sh
  npx supabase db dump --linked -f backup-schema.sql
  npx supabase db dump --linked --data-only -f backup-dados.sql
  ```
  Guardar os ficheiros fora do repositório: têm dados dos jogadores. Os backups automáticos do Supabase dependem do plano, em *Database → Backups* (**confirmar no painel**).
- **Migrações:** nunca editar uma migração já aplicada. Uma correção é uma migração nova, por PR, testada no Supabase local (`npm run test:db`) e depois `npx supabase db push`.

---

## Depois do lançamento
- **Onde ver erros:**
  - função: *Edge Functions → resolve-night → Logs*;
  - cron: `cron.job_run_details` e `net._http_response`;
  - Auth (magic links que não chegam): *Authentication → Logs* (**confirmar no painel**) e o painel do fornecedor de SMTP;
  - web: as ferramentas do browser. O site não tem servidor próprio.
- **Mudar o SMTP:** criar as credenciais no fornecedor novo e verificar o domínio. Trocar os campos em *Authentication → Emails → SMTP Settings* e repetir o teste de envio do passo 5. Só depois desligar o fornecedor antigo.
- **Rodar as chaves:**
  - **Chave `service_role` (legacy, JWT):** gerar a nova em *Project Settings → API Keys* (**confirmar no painel**). Atualizar logo o segredo do Vault, ou o cron deixa de conseguir chamar a função:
    ```sql
    select vault.update_secret((select id from vault.secrets where name = 'service_role_key'), '<chave nova>');
    ```
    A função publicada recebe a chave do próprio Supabase. Confirmar no passo 2 (`net._http_response` com `200` na hora seguinte) e só depois revogar a antiga.
  - **Chave pública (anon/publishable):** gerar a nova e trocar o `VITE_SUPABASE_ANON_KEY` no alojamento. Fazer um build novo, porque a chave entra no bundle, e só depois revogar a antiga. Quem tiver a app aberta só precisa de recarregar a página.
  - **Palavra-passe da BD:** *Project Settings → Database* (**confirmar no painel**). Não é usada pela app; só pela CLI (`supabase link` volta a pedi-la).
- **Novas versões:**
  1. Cada PR com merge no `main` leva as migrações novas (`npx supabase db push --dry-run` e depois `db push`).
  2. Se a `supabase/functions/` ou o `engine/`/`sim/` mudarem, voltar a publicar a função.
  3. O web volta a publicar-se sozinho, se o alojamento estiver ligado ao `main`.
