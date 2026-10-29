# CLAUDE.md — Night Staff

Webapp para um grupo de amigos (número variável, mínimo 3), em ciclos de 11 dias (RULES.md §1). Regras em **`RULES.md`**, que é a fonte da verdade. Objetivo: **a solução mais simples que funcione.** Não adicionar features, abstrações nem dependências que não sejam pedidas.

## Stack
- **Frontend:** React + Vite + TypeScript + Tailwind + **neobrutalism.dev** (componentes neo-brutalistas sobre shadcn/ui: contornos grossos, sombras duras, cores fortes). Instalar os componentes pela CLI do shadcn, como indicado em neobrutalism.dev. Sem fontes pixel; usar uma fonte sans-serif forte nos títulos.
- **Backend:** Supabase.
  - Postgres + Auth (magic link, registo público desligado, os 8 jogadores são convidados).
  - RLS.
  - `pg_cron`.
  - 1 Edge Function.
- **Testes:** Vitest.
- **Sem servidor próprio, sem PWA, sem notificações.**

## Estrutura
```
engine/      # motor de regras — TypeScript PURO
sim/         # simulador de bots (usa engine/)
web/         # app React
supabase/
  migrations/
  functions/resolve-night/   # chama engine/, grava resultado
RULES.md
CLAUDE.md
```

## Motor (`engine/`)
- Função principal: `resolveNight(state, actions, seed) → { ledger, summary }`.
- **Sem I/O, sem base de dados, sem `Date.now()`, sem `Math.random()`.** Recebe tudo como argumento.
- **Zero dependências.** Os imports relativos levam a extensão `.ts`, para correr tanto em Vite como em Deno (Edge Function).
- RNG com seed (ex.: mulberry32) num módulo `rng.ts`.
- **Cada regra do `RULES.md` §3 tem pelo menos um teste**, incluindo:
  - alvo fora
  - defesa contra N ataques e contra B bombas
  - sorteio com 2 e com 3 atacantes
  - 1 bomba + N
  - 2 bombas + N, com arredondamento
  - bomba sozinha
  - ataques cruzados (A→B, B→A)
  - bónus de casa
  - `STAY` por defeito
- A validação de quotas e de alvo é uma função à parte: `validateAction(state, action)`.

## Dados (Supabase)
| Tabela | Campos | Leitura |
|---|---|---|
| `players` | id (= auth.users.id), name | Todos |
| `games` | id (= um ciclo), start_date (dia 1), status: `prep` \| `running` \| `finished`, seed (sorteio do desempate, RULES.md §5; preenchida pela resolve-night) | Todos |
| `game_players` | game_id, player_id | Todos. Escrita só pelo próprio, só com `status = prep` |
| `actions` | game_id, night, player_id, type, target_id; único (game_id, night, player_id) | **Só o próprio** |
| `nights` | game_id, night, seed, resolved_at, summary jsonb | Todos, depois de resolvida |
| `ledger` | id, game_id, night, player_id, delta, reason, target_id (alvo do próprio ataque, para o confronto direto) | **Só o próprio**; todos quando `games.status = finished` |

- **RLS em `actions`:**
  - Cada jogador só pode inserir, alterar e ler as suas próprias ações.
  - Só pode escrever na noite atual, até às 23:59 de Lisboa inclusive: fecha às 00:00.
  - Nada mais é exposto.
- O ranking é a soma do `ledger`. Durante o jogo, cada jogador só vê a sua soma, e o ranking completo só no dia 11.
- O `nights.summary` **não pode conter pontos**: só casa/fora, ataques recebidos, defesas, revelações e contagens de sorteios e bombas.

## Resolução da noite
- O `pg_cron` corre **de hora a hora** e chama `resolve-night`.
- A função converte a hora para **Europe/Lisbon** e só resolve se a noite anterior ainda não estiver resolvida (idempotente). Isto evita problemas com a mudança de hora.
- A mesma função faz as **transições de ciclo** (RULES.md §1):
  - `prep` → `running` às 00:00 do dia 2, se houver 3 ou mais inscritos. Se não houver, adia o `start_date` 1 dia.
  - `running` → `finished` depois da noite 9.
  - No dia a seguir à resolução, cria o próximo ciclo em `prep`, copiando os inscritos.
- O cálculo da fase e do dia do ciclo a partir das datas é uma função pura no `engine/`: `nextStep` (próximo passo do ciclo mais recente, repetido até não haver nada a fazer) e `prepareNight` (ações inválidas → `STAY`, com log).
- A função usa a `service_role`, que **só existe na Edge Function** e nunca no `web/`.
- Escritas atómicas e idempotentes em SQL, executáveis só pela `service_role`: `apply_night` (noite + ledger) e `next_cycle` (novo ciclo + inscritos). O ciclo mais recente é o de maior `games.id`.
- O `pg_cron` lê o URL e a chave de dois segredos do **Vault**, `project_url` e `service_role_key`, criados à mão pelo Walter em cada projeto.

## UI
- **Tema escuro**, "noite de bairro":
  - Fundo `#0B1020`, cartas `#151B33`.
  - Janela/ouro `#F5C542`, perigo `#E5484D`, defesa `#4C8DFF`.
- **Ecrãs:**
  - Hoje: escolha, quotas restantes, contagem até às 23:59.
  - Manhã: resumo da noite.
  - Bairro/Histórico: uma casa por jogador, com a janela acesa se o jogador estava em casa, por noite.
  - Os meus pontos (durante o jogo) e o ranking final (só no dia 11).
- Textos em **português de Portugal**, com tom de narrador. Mobile-first.
- **Nomes na UI:** usar sempre os nomes da coluna "Nome na app" do `RULES.md` §2 (Folga, Segurança, Visita surpresa, Reunião de emergência). Os códigos (`STAY`, `DEFEND`...) ficam só no código. O vencedor chama-se **Funcionário do Mês**.
- **Convenções do `web/`:**
  - Um só `package.json`, o da raiz: o `npm ci` da CI instala tudo e o `npm run lint` também verifica o `web/` (`tsc -p web`).
  - O `components.json` do shadcn está na raiz. Os componentes vão para `web/src/components/ui/`: são gerados pela CLI e não se editam à mão. O ESLint ignora essa pasta, mas o `tsc` não.
  - Tema: as variáveis do neobrutalism.dev em `web/src/index.css`, com a paleta acima. Contornos e sombras claros (`#F4F1E8`), para se verem no fundo escuro. Títulos em Archivo Black.
  - A lógica pura de cada ecrã fica em `web/src/lib/` e testa-se no Vitest. O web importa o `engine/` por caminho relativo.
  - Leituras partilhadas em `web/src/lib/data.ts`: um erro lança e o ecrã mostra `LoadError` ("Espreitar outra vez"), nunca um estado vazio. Ecrãs em abas (Hoje, Manhã, Bairro, Pontos), sem router. O `useLoad` ignora respostas de leituras antigas.
  - Pontos: o ranking usa o `finalRanking` do `engine/` com a `games.seed`, e só aparece com `status = finished`. Durante a preparação do ciclo seguinte, mostra o ciclo anterior.
  - `web/.env.local` (fora do git) tem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, como no `web/.env.example`. Só a chave pública.
- **Auth:** o registo fecha-se com `[auth] enable_signup = false`. Não pôr `false` em `[auth.email]`, que desliga também o magic link.
  - O magic link volta para `window.location.origin`: o URL do site (dev e produção) tem de estar em *Site URL* / *Redirect URLs* no painel do Supabase. No local já está no `config.toml` (`http://localhost:5173`).

## Comandos
```
npm test            # vitest (engine + sim)
npm run sim         # simulação de N jogos com bots
npm run dev         # web (Vite)
npm run build       # build do web/
supabase start      # Supabase local (com o seed.sql: Walter + 3 jogadores de teste)
supabase stop --no-backup  # obrigatório depois de mudar o config.toml: com backup, o auth arranca com a config antiga
npm run test:db     # testes SQL (pgTAP) + ciclo inteiro na resolve-night (precisa do Supabase local)
```

## Regras para agentes (obrigatório)
1. Trabalhar **só em branches** e entregar por **Pull Request**. Nunca fazer push para `main`.
2. Usar **só Supabase local ou o projeto de dev**. Nunca o de produção.
3. **Proibido:**
   - deploy
   - migrações em produção
   - mexer em secrets
   - colocar chaves no código ou no frontend
4. **Feito = `npm test` passa + lint limpo + descrição do PR com o que mudou e o que ficou por fazer.**
5. **Não alterar o `RULES.md`.** Se uma regra for ambígua, parar e perguntar.
6. Não adicionar dependências sem justificar no PR.
7. **Antes de começares uma tarefa**, lê os comentários de revisão do teu último PR com merge (`gh pr list --state merged --limit 1`, depois `gh pr view <n> --comments`). Trata das 🟡 sugestões que ainda estiverem pendentes ou explica no PR porque não o fizeste.
8. **Decisões de implementação:** se mudares o modelo de dados, a estrutura ou as convenções (uma coluna nova, um nome, um formato), atualiza o CLAUDE.md **no mesmo PR** e lista a decisão na descrição. Se a decisão mudar as **regras do jogo** (pontos, quotas, horários, visibilidade), não decidas: pára e pergunta ao Walter.

## Processo automático
- O trabalho está no **`TASKS.md`**, por ordem. Faz-se sempre a primeira tarefa `[ ]` que não esteja marcada como "em curso".
- O **construtor** trabalha num branch `auto/<tarefa>`, abre o PR e, no próprio PR, muda a caixa da tarefa para `[x]`.
- O **revisor** comenta e **faz merge sozinho** se a CI estiver verde e não houver 🔴 bloqueantes. Se houver, o construtor corrige no mesmo PR.
- **Nunca há merge automático** de PRs que alterem `RULES.md`, `CENARIOS.md`, `.github/` ou `.claude/`, nem do `TASKS.md` além de mudar caixas `[ ]` → `[x]`. Esses PRs são do Walter.
- **Ao fim de 3 revisões com bloqueantes no mesmo PR**, o PR recebe a label `precisa-walter` e tudo para até o Walter intervir.
- **Revisão final** (última tarefa do `TASKS.md`): testar a RLS com 2 utilizadores e confirmar que:
  - nenhuma ação de outro jogador é legível antes da resolução;
  - nenhuma pontuação de outro jogador é legível antes do dia 11.
