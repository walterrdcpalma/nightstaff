# TASKS.md — Night Staff

> Backlog por ordem. O construtor faz a primeira `[ ]` que não esteja "em curso" (CLAUDE.md, "Processo automático").
> Cada tarefa = 1 PR. "Feito" = critérios abaixo + `npm test` e lint verdes.
> Só o Walter acrescenta ou muda tarefas. O construtor só muda `[ ]` → `[x]`.

- [x] **T0 — Motor:** `engine/` com `resolveNight`, `validateAction`, `rng` e testes (PR #1).
- [x] **T1 — Simulador + cenários** *(em curso: agente local, branch `feat/sim`)*
  - Cada cenário do `CENARIOS.md` vira um teste permanente.
  - `sim/` com bots aleatórios e "espertos" (que leem o histórico). `npm run sim` corre 1000 ciclos.
  - Relatório no PR: média de acertos por ciclo, pontos finais (média e dispersão), frequência de sorteios e bombas, % de jogadores com 0 ou menos. Correr com 3, 5, 8 e 12 jogadores.
- [x] **T2 — Ciclo e ranking no motor** (funções puras)
  - `cyclePhase(startDate, today)` → `{ phase: 'PREP' | 'NIGHT' | 'RESULTS', day, night? }`, com datas `YYYY-MM-DD` em hora de Lisboa (RULES.md §1).
  - `finalRanking(ledger)` com desempate (RULES.md §5) e vitória partilhada.
  - Testes: limites de cada fase, mudança de hora (fim de março e fim de outubro), empates.
- [x] **T2b — Regras v3 no motor e no simulador**
  - `resolveNight`: atacar quem defende custa 5 (bomba 10); bomba num alvo fora acerta (T −10, os bombistas dividem 10); a noite 9 conta a dobrar. A função tem de saber o número da noite.
  - Salário: constante `SALARY = 50`. Os pontos do jogador são `SALARY + soma do ledger`.
  - Ranking: desempate pela ordem do RULES.md §5 (ataques bem-sucedidos, confronto direto/mini-liga, pontos perdidos, sorteio com a seed do ciclo). Nunca há vitória partilhada. O ledger tem de guardar o alvo de cada ataque bem-sucedido.
  - Todos os testes atualizados. O `CENARIOS.md` v3 (noites 1 a 5 e cenários extra A, B e C) passa.
  - Simulador e relatório atualizados para as regras v3 ("sem salário" em vez de "0 ou menos"), com o relatório na descrição do PR.
- [x] **T2c — Regras v4 (assalto à casa vazia) no motor e no simulador**
  - `resolveNight`, caso "T está fora" (RULES.md §3.1): sem bomba, T −5 e os atacantes dividem 5 (arredondado para baixo). Com bomba, os atacantes ficam com 0. Uma Visita que rendeu pontos conta como ataque bem-sucedido contra T (desempate).
  - O bot esperto passa a ter em conta que assaltar casas vazias rende pontos.
  - Todos os testes atualizados. O `CENARIOS.md` v4 passa (incluindo o cenário extra D).
  - Relatório do simulador v4 na descrição do PR. Assinalar se a viragem na última noite continuar perto de 0%.
- [x] **T3 — Supabase: schema e RLS**
  - `supabase/` com `npx supabase init`. Migrações para as tabelas do CLAUDE.md.
  - RLS exatamente como no CLAUDE.md. Validação de quota, alvo e prazo **na BD** (função ou trigger), usando as mesmas regras do `validateAction`.
  - Testes de RLS com 2 utilizadores no Supabase local (Docker): não ver ações de outros antes da resolução, nem pontos de outros antes do dia 11, e só entrar ou sair com `status = prep`.
- [x] **T4 — Resolução automática**
  - Edge Function `resolve-night`, que usa o `engine/` (imports `.ts`), grava `ledger` e `nights` e faz as transições de ciclo do CLAUDE.md.
  - `pg_cron` de hora a hora. Idempotente: correr 2 vezes não duplica nada.
  - Uma ação inválida não pode bloquear a noite: é registada e tratada como `STAY`, com log visível.
  - Teste: simular um ciclo inteiro (preparação, 9 noites, resolução, novo ciclo) no Supabase local.
- [x] **T5 — Web: base e "Hoje"**
  - `web/` com Vite, React, Tailwind e neobrutalism.dev, com o tema do CLAUDE.md.
  - Login por magic link. Ecrã Hoje: fase atual, escolha da ação com os nomes da app, quotas restantes, contagem até às 23:59. No dia de preparação, botão para entrar ou sair.
- [ ] **T6 — Web: "Manhã" e "Bairro/Histórico"**
  - Resumo da noite (RULES.md §4) e histórico com uma casa por jogador e a janela acesa ou apagada, por noite.
- [ ] **T7 — Web: pontos e resolução**
  - Os meus pontos e movimentos durante o ciclo. No dia 11, ranking final e 🏆 Funcionário do Mês.
- [ ] **T8 — Revisão final de segurança**
  - Repetir os testes de RLS com o web real. Confirmar que nenhuma chave `service_role` aparece no `web/` nem no bundle.
