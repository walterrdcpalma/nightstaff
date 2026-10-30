# CLAUDE.md — Night Staff

Webapp para jogar com amigos em **salas** (mínimo 3 jogadores), cada uma com uma partida de 9 noites de cada vez (RULES.md §1). Regras em **`RULES.md`**, que é a fonte da verdade. Objetivo: **a solução mais simples que funcione.** Não adicionar features, abstrações nem dependências que não sejam pedidas.

## Stack
- **Frontend:** React + Vite + TypeScript + Tailwind + **neobrutalism.dev** (componentes neo-brutalistas sobre shadcn/ui: contornos grossos, sombras duras, cores fortes). Instalar os componentes pela CLI do shadcn, como indicado em neobrutalism.dev. Sem fontes pixel; usar uma fonte sans-serif forte nos títulos.
- **Backend:** Supabase.
  - Postgres + Auth (magic link, registo aberto: qualquer pessoa cria conta com o email).
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
| `players` | id (= auth.users.id nas pessoas; apagar a conta apaga o jogador, por trigger), name (1 a 24 caracteres, sem espaços nas pontas), bot_room_id (só nos bots: a sua sala) | O próprio e quem partilha com ele uma sala ou a partida atual. Cada um cria e muda só o seu (nome escolhido no primeiro login), nunca um bot |
| `rooms` | id, code (6 caracteres sem 0/O/1/I/L, único), admin_id, kind: `people` \| `bots`, status: `lobby` \| `running` \| `finished`, created_at | Os jogadores da sala. Escrita só pelas funções da sala |
| `room_players` | room_id, player_id, joined_at (se o admin sair, passa a admin quem entrou há mais tempo) | Os jogadores da sala. Escrita só pelas funções da sala |
| `games` | id (= uma partida), room_id, start_date (dia da noite 1 = dia do Começar), status: `running` \| `finished`, seed (sorteio do desempate, RULES.md §5; preenchida pela resolve-night) | Quem a joga, e só se for a partida atual da sala |
| `game_players` | game_id, player_id (lista fixa, copiada da sala no Começar) | Quem joga a partida atual. Escrita só pelo `start_room` |
| `actions` | game_id, night, player_id, type, target_id; único (game_id, night, player_id) | **Só o próprio**, e só da partida atual |
| `nights` | game_id, night, seed (também escolhe as frases da história da manhã), resolved_at, summary jsonb | Quem joga a partida atual, depois de resolvida |
| `ledger` | id, game_id, night, player_id, delta, reason, target_id (alvo do próprio ataque, para o confronto direto; na `DEFENSE`, quem o jogador apanhou) | **Só o próprio** (também com a partida acabada), e só da partida atual |
| `rankings` | game_id, player_id, rank, points, successful_attacks | Quem jogou a partida atual, só quando `games.status = finished` |

- **RLS por sala e por partida:** a sala (código, lobby, jogadores) é de quem lá está agora. **Só se vê a partida atual** de cada sala (decisão do Walter: uma partida são as 9 rondas; o histórico do RULES.md §4 são as rondas da partida atual). A atual é a mais recente, enquanto a sala não volta ao lobby: Reiniciar acaba-a, e as partidas anteriores deixam de se ver para todos, também as minhas ações e o meu ledger delas. Não se entra a meio. Quem não está na sala não vê nada. As funções `is_room_member`, `is_game_player`, `shares_room` e `shares_game` (`security definer`) servem as políticas. Dentro da partida, as regras de visibilidade v5 não mudam.
- **Funções da sala** (`security definer`, para quem tem sessão; erros como códigos, ex.: `NO_NAME`, `ROOM_NOT_FOUND`, `ROOM_NOT_IN_LOBBY`, `NOT_ADMIN`, `TOO_FEW_PLAYERS`, `ROOM_NOT_FINISHED`, `NOT_PEOPLE_ROOM`):
  - `create_room()`: sala de pessoas em lobby; quem cria é o admin e o primeiro jogador.
  - `create_bots_room(n)`: sala contra bots (RULES.md §1.2) com n de 2 a 11 bots (`BOT_COUNT`), com nomes do staff ("Bot Rececionista"…). Os bots são `players` sem conta, com `bot_room_id`, e só existem nessa sala. Começa logo, sem lobby.
  - `join_room(code)`: só em lobby; numa sala contra bots dá `ROOM_NOT_FOUND`.
  - `leave_room(room)`: só em lobby. Se for o admin, o admin passa para quem entrou há mais tempo; se não sobrar ninguém, a sala é apagada.
  - `start_room(room)`: só o admin, só salas de pessoas, com 3 ou mais. Cria a partida com `start_date` = hoje (Lisboa): a noite 1 abre já e fecha às 23:59.
  - `restart_room(room)`: só o admin, com a sala acabada. Volta ao lobby, com o mesmo código e os mesmos jogadores; as partidas anteriores ficam na BD mas deixam de se ver. Numa sala contra bots, começa logo outra partida com os mesmos bots.
- **RLS em `actions`:**
  - Cada jogador só pode inserir, alterar e ler as suas próprias ações.
  - Só pode escrever na noite atual, até às 23:59 de Lisboa inclusive: fecha às 00:00. Numa sala contra bots, a noite atual é a seguinte à última resolvida, a qualquer hora (`night_is_open`).
  - Nada mais é exposto.
- Os pontos são `50 + soma do ledger`. Cada jogador só vê os seus. O ranking completo só na resolução, depois da noite 9: a `resolve-night` calcula-o no fim da partida (`finalRanking`) e grava-o em `rankings`, porque o ledger dos outros nunca chega ao browser.
- O `nights.summary` é **público** (RULES.md §4 v5): só `players` (casa/fora de cada um) e `caught` (apanhados, sem dizer onde). Nada de pontos, ataques recebidos, defesas, sorteios, bombas, assaltos ou bónus.
- O que aconteceu a cada jogador é **privado** e vem do seu próprio `ledger`. As razões chegam para isso: `VICTIM` (atacado em casa), `BOMBED`, `BURGLARY_VICTIM`, `ATTACK_DRAW_WON`/`ATTACK_LOST_DRAW` (sorteio), `DEFENSE` (uma linha por apanhado, com `target_id`) e `HOME_BONUS`.

## Resolução da noite
- O `pg_cron` corre **de hora a hora** e chama `resolve-night`.
- A função converte a hora para **Europe/Lisbon** e só resolve se a noite anterior ainda não estiver resolvida (idempotente). Isto evita problemas com a mudança de hora.
- Sem corpo (pg_cron), trata **todas as partidas a decorrer em salas de pessoas** (as salas contra bots ficam de fora). Uma partida com erro não impede as outras; a resposta é 500 com a lista de erros.
  - A noite N é o dia N da partida (a 1 é o dia do Começar) e resolve-se às 00:00 seguintes.
  - Depois da noite 9, `finish_game` acaba a partida e a sala (`finished`). Não há ciclos automáticos: só o admin começa ou reinicia.
- A lógica das datas é pura, no `engine/`: `nightOn` (noite de um dia), `nextStep` (próximo passo de uma partida, repetido até não haver nada a fazer) e `prepareNight` (ações inválidas → `STAY`, com log).
- **⏭️ Passar o dia** (salas contra bots): o web chama a mesma função com `{ room_id, night }` e o JWT do jogador (`supabase.functions.invoke`). Só o admin, só a noite aberta (`NIGHT_CHANGED` num duplo toque). Os bots que não escolheram jogam ao calhas (`randomTurn` do `sim/`, que usa o `randomBot`) e as ações ficam em `actions`; quem não escolheu fica com STAY; a noite resolve-se já e, depois da 9, a partida acaba. A função responde com CORS.
- A função usa a `service_role`, que **só existe na Edge Function** e nunca no `web/`.
- Escritas atómicas e idempotentes em SQL, executáveis só pela `service_role`: `apply_night` (noite + ledger) e `finish_game` (fim da partida e da sala + seed do desempate + `rankings`; recusa um ranking vazio).
- O `pg_cron` lê o URL e a chave de dois segredos do **Vault**, `project_url` e `service_role_key`, criados à mão pelo Walter em cada projeto.

## UI
- **Tema escuro**, "noite de bairro":
  - Fundo `#0B1020`, cartas `#151B33`.
  - Janela/ouro `#F5C542`, perigo `#E5484D`, defesa `#4C8DFF`.
- **Ecrãs:**
  - **As minhas salas** (ecrã inicial): código, estado e o que falta fazer em cada sala (as que estão à minha espera primeiro), **Criar sala**, **Entrar com código** e **Jogar contra bots** (de 2 a 11).
  - Primeiro login: o nome que os outros vão ver (cria o meu `players`). Depois, o botão com o meu nome no cabeçalho ("🪪 Walter", ao lado de Sair) abre o mesmo `NameForm`, já preenchido, com Guardar e Cancelar (`update` ao meu `players`); ao guardar, os ecrãs voltam a ler e o nome novo aparece logo.
  - Dentro de uma sala, as abas só com dados dessa sala:
    - Hoje: no lobby, o código grande (com Copiar), quem entrou, **Começar** para o admin (desligado com menos de 3) e Sair; a correr, escolha, quotas restantes e contagem até às 23:59; acabada, **Reiniciar** para o admin. Contra bots: sem contagem, com **⏭️ Passar o dia** por baixo da escolha.
    - Manhã, em **modo história** (T12): a noite contada uma cena de cada vez — abertura (quantos em casa e fora), uma cena por jogador (em casa ou fora, com uma frase), os 🚨 apanhados (sem dizer onde, só se houver) e, por fim, a minha noite (relatório privado, só do meu ledger). Seguinte (ou toque), Saltar e Ver outra vez; com `prefers-reduced-motion`, tudo visível e sem animação. As rondas anteriores da partida atual continuam consultáveis.
    - Bairro/Histórico: só casa/fora. Uma casa por jogador, com a janela acesa se o jogador estava em casa, por noite. Nunca mostra ações, ataques, defesas nem bombas.
    - Os meus pontos (durante a partida) e o ranking final (só na resolução).
- Textos em **português de Portugal**, com tom de narrador. Mobile-first.
- **Nomes na UI:** usar sempre os nomes da coluna "Nome na app" do `RULES.md` §2 (Folga, Segurança, Visita surpresa, Despedimento coletivo, Desaparecer). Os códigos (`STAY`, `DEFEND`...) ficam só no código. O vencedor chama-se **Funcionário do Mês**.
- **Convenções do `web/`:**
  - Um só `package.json`, o da raiz: o `npm ci` da CI instala tudo e o `npm run lint` também verifica o `web/` (`tsc -p web`).
  - O `components.json` do shadcn está na raiz. Os componentes vão para `web/src/components/ui/`: são gerados pela CLI e não se editam à mão. O ESLint ignora essa pasta, mas o `tsc` não.
  - Tema: as variáveis do neobrutalism.dev em `web/src/index.css`, com a paleta acima. Contornos e sombras claros (`#F4F1E8`), para se verem no fundo escuro. Títulos em Archivo Black.
  - A lógica pura de cada ecrã fica em `web/src/lib/` e testa-se no Vitest. O web importa o `engine/` por caminho relativo.
  - Leituras partilhadas em `web/src/lib/data.ts`: um erro lança e o ecrã mostra `LoadError` ("Espreitar outra vez"), nunca um estado vazio. Ecrãs em abas (Hoje, Manhã, Bairro, Pontos), sem router. O `useLoad` ignora respostas de leituras antigas.
  - História da manhã: frases em `web/src/lib/story.ts` (*em casa*, *fora* e *apanhado*, 10 ou mais cada, com `{nome}`, sem género). As de casa e fora **nunca revelam a ação** (lista `FORBIDDEN_WORDS`, testada). A frase de cada jogador sai da `nights.seed` e do id do jogador (`mulberry32`): toda a gente vê a mesma história. Animação só com CSS (`motion-safe:animate-scene-in`, em `index.css`).
  - Pontos: o ranking vem da tabela `rankings` (a RLS só a mostra com `status = finished`).
  - Ecrã inicial: As minhas salas (sem router: a sala escolhida é estado do `App`). Os ecrãs de uma sala recebem `roomId` e mostram a partida atual (a RLS só dá essa); o Manhã deixa escolher as rondas anteriores dela.
  - Ranking: quem ficou empatado em pontos mostra o critério do desempate, se os ataques bem-sucedidos chegaram; senão, "confronto direto, pontos perdidos ou sorteio" (sem o ledger dos outros não se distingue).
  - Hoje: o alvo da minha Visita ou Despedimento de ontem aparece bloqueado, com o motivo (`previousTarget` do `engine/`).
  - `web/.env.local` (fora do git) tem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, como no `web/.env.example`. Só a chave pública.
- **Auth:** registo aberto (`[auth] enable_signup = true`, login com `shouldCreateUser: true`). Não pôr `false` em `[auth.email]`, que desliga também o magic link. Uma conta nova não tem `players`: o nome pede-se no primeiro login, e sem nome as funções da sala dão `NO_NAME` (também para um bot, que nunca cria salas nem entra nelas).
  - O magic link volta para `window.location.origin`: o URL do site (dev e produção) tem de estar em *Site URL* / *Redirect URLs* no painel do Supabase. No local já está no `config.toml` (`http://localhost:5173`).

## Comandos
```
npm test            # vitest (engine + sim)
npm run sim         # simulação de N jogos com bots
npm run dev         # web (Vite)
npm run build       # build do web/
supabase start      # Supabase local (com o seed.sql: Walter + 3 jogadores de teste, na sala NSTAFF em lobby; o Walter é admin)
supabase stop --no-backup  # obrigatório depois de mudar o config.toml: com backup, o auth arranca com a config antiga
npm run test:db     # testes SQL (pgTAP) + uma sala inteira e uma partida contra bots na resolve-night (precisa do Supabase local; os e2e correm um de cada vez)
npm run demo [-- meio|terminado|lobby]  # limpa a BD LOCAL e cria uma sala de demonstração (por omissão: meio)
npm run demo:noite  # resolve já a noite atual; quem não escolheu joga com os bots
npm run demo:dia    # avança 1 dia (passagem de noite, fim da partida)
```

### Testar no browser com dados de demonstração
1. `npx supabase start` e `npm run demo` (ou `-- terminado` ou `-- lobby`). O script recusa correr se o `SUPABASE_URL` não for local. A `service_role` local só existe no script.
2. `npm run dev` e entrar como `walter@nightstaff.local`. O magic link chega ao Mailpit (http://127.0.0.1:54324).
3. O que ver (6 jogadores: Walter, Ana, Bruno, Carla, Duarte e Eva, numa sala de que o Walter é admin; as noites são jogadas pelos bots do `sim/` e resolvidas pela `resolve-night`):
   - **`meio`** (noite 5 a decorrer, o Walter ainda não escolheu):
     - **Hoje:** escolha, quotas já gastas e contagem até às 23:59.
     - **Manhã:** o relatório privado do Walter na noite 4 e as manchetes; as noites 1 a 3 com um toque. Pelos bots, há sorteio, um apanhado, bomba e assalto a uma casa vazia, cada um no relatório de quem o viveu.
     - **Bairro:** só as janelas (casa/fora) das noites 1 a 4.
     - **Pontos:** só os do Walter.
   - **`demo:noite`** resolve a noite 5 e abre a 6. Repetido, chega ao fim da partida. **`demo:dia`** passa um dia sem preencher escolhas.
   - **`terminado`** (sala acabada):
     - **Pontos:** 🏆 Funcionário do Mês e ranking final.
     - **Bairro:** as 9 noites.
     - **Hoje:** "Dia de resolução".
     - Não há partida seguinte: o Walter (admin) vê **Reiniciar** no Hoje, e a sala volta ao lobby.
   - **`lobby`**: uma sala em lobby com 5 jogadores (a Ana é admin); o script mostra o código para o Walter entrar em **Entrar com código**.

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
