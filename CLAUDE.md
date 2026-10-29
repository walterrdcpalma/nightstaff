# CLAUDE.md — Night Staff

Webapp para um grupo de amigos (número variável, mínimo 3), em ciclos de 11 dias (RULES.md §1). Regras em **`RULES.md`**, que é a fonte da verdade. Objetivo: **a solução mais simples que funcione.** Não adicionar features, abstrações nem dependências que não sejam pedidas.

## Stack
- **Frontend:** React + Vite + TypeScript + Tailwind + **8bitcn** (componentes pixel-art sobre shadcn/ui). Fonte dos títulos: Press Start 2P.
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
| `games` | id (= um ciclo), start_date (dia 1), status: `prep` \| `running` \| `finished` | Todos |
| `game_players` | game_id, player_id | Todos. Escrita só pelo próprio, só com `status = prep` |
| `actions` | game_id, night, player_id, type, target_id; único (game_id, night, player_id) | **Só o próprio** |
| `nights` | game_id, night, seed, resolved_at, summary jsonb | Todos, depois de resolvida |
| `ledger` | id, game_id, night, player_id, delta, reason | **Só o próprio**; todos quando `games.status = finished` |

- **RLS em `actions`:**
  - Cada jogador só pode inserir, alterar e ler as suas próprias ações.
  - Só pode escrever na noite atual e antes das 23:59 de Lisboa.
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
- O cálculo da fase e do dia do ciclo a partir das datas é uma função pura no `engine/`.
- A função usa a `service_role`, que **só existe na Edge Function** e nunca no `web/`.

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

## Comandos
```
npm test            # vitest (engine + sim)
npm run sim         # simulação de N jogos com bots
npm run dev         # web
supabase start      # Supabase local
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

## Processo automático
- O trabalho está no **`TASKS.md`**, por ordem. Faz-se sempre a primeira tarefa `[ ]` que não esteja marcada como "em curso".
- O **construtor** trabalha num branch `auto/<tarefa>`, abre o PR e, no próprio PR, muda a caixa da tarefa para `[x]`.
- O **revisor** comenta e **faz merge sozinho** se a CI estiver verde e não houver 🔴 bloqueantes. Se houver, o construtor corrige no mesmo PR.
- **Nunca há merge automático** de PRs que alterem `RULES.md`, `CENARIOS.md`, `.github/` ou `.claude/`, nem do `TASKS.md` além de mudar caixas `[ ]` → `[x]`. Esses PRs são do Walter.
- **Ao fim de 3 revisões com bloqueantes no mesmo PR**, o PR recebe a label `precisa-walter` e tudo para até o Walter intervir.
- **Revisão final** (última tarefa do `TASKS.md`): testar a RLS com 2 utilizadores e confirmar que:
  - nenhuma ação de outro jogador é legível antes da resolução;
  - nenhuma pontuação de outro jogador é legível antes do dia 11.
