---
description: Avança no Night Staff — corrige o PR bloqueado ou faz a próxima tarefa do TASKS.md
---
Avança no Night Staff:

1. `git checkout main && git pull`. Relê o CLAUDE.md (secção "Processo automático"), o RULES.md, o CENARIOS.md e o TASKS.md.
2. Se houver um PR aberto teu (branch `auto/...`) com um comentário do revisor com `verdict=block` para o último commit, ou com a CI a falhar, corrige-o nesse branch, faz push e pára.
3. Se houver um PR aberto teu à espera da revisão ou da CI, não comeces outra tarefa: diz-me isso e pára.
4. Senão, faz a primeira tarefa `[ ]` do TASKS.md que não esteja "em curso":
   - Branch `auto/<tarefa>-<nome>`. Cumpre a regra 7 do CLAUDE.md.
   - Testes para todos os critérios. `npm run lint` e `npm test` verdes.
   - No TASKS.md, muda só a caixa da tarefa para `[x]`.
   - Rebase sobre o `main`, push e abre o PR com o que mudou e as decisões.
5. Se uma regra for ambígua, não inventes: pára e pergunta-me.
