# Night Staff — Cenários de aceitação

> Calculados à mão a partir do `RULES.md` e confirmados pelo Walter.
> Agentes: cada cenário tem de virar um teste. Se o motor der um resultado diferente, **o motor está errado** (ou o `RULES.md` é ambíguo → perguntar).

**Jogadores:** Ana, Bruno, Carla, Duarte, Eva, Filipe, Gil, Helena. Todos começam com 0.

## Noite 1 — Básico
| Jogador | Ação |
|---|---|
| Ana | Ataca Bruno |
| Bruno | Folga |
| Carla | Ataca Duarte |
| Duarte | Segurança |
| Eva | Ataca Filipe |
| Filipe | Ataca Gil |
| Gil | Folga |
| Helena | Folga |

**Resultado:**
- Ana **+10**, Bruno **−10**: ataque normal.
- Carla **−10**, Duarte **+10**: Duarte defendeu e **Carla fica revelada**.
- Eva **0**: Filipe estava fora, por isso o ataque falha.
- Filipe **+10**, Gil **−10**: ataque normal.
- Helena **+2**: em casa e ninguém a atacou.
- Duarte **não** ganha bónus: foi atacado.

## Noite 2 — Sorteio, ataques cruzados e ação por defeito
| Jogador | Ação |
|---|---|
| Ana | Ataca Helena |
| Bruno | Ataca Helena |
| Carla | Ataca Helena |
| Duarte | Ataca Eva |
| Eva | Ataca Duarte |
| Filipe | Segurança |
| Gil | *(não escolheu)* |
| Helena | Folga |

**Resultado** (assumindo que o sorteio dá **Bruno**):
- Bruno **+10**, Helena **−10**.
- Ana **−10**, Carla **−10**: perderam o sorteio e "morreram".
- Duarte **0**, Eva **0**: estavam os dois fora, por isso os dois ataques falham.
- Filipe **+2**: defendeu sem ser atacado, ganha o bónus e a defesa fica gasta.
- Gil **+2**: fica em Folga por defeito e ninguém o atacou.
- O resumo mostra "3 atacantes na Helena, houve sorteio", **sem nomes**.

## Noite 3 — Bombas
| Jogador | Ação |
|---|---|
| Ana | Bomba em Gil |
| Bruno | Ataca Gil |
| Carla | Ataca Gil |
| Duarte | Bomba em Helena |
| Eva | Bomba em Filipe |
| Filipe | Folga |
| Gil | Folga |
| Helena | Segurança |

**Resultado:**
- Gil **−10**, Bruno **−10**, Carla **−10**.
- Ana **+30**: bolo = 10 + 10 × 2, sem sorteio.
- Duarte **−20**, Helena **+10**: bomba contra defesa. **Duarte fica revelado.**
- Eva **+10**, Filipe **−10**: bomba sozinha conta como ataque normal.
- Ninguém ganha bónus.

## Noite 4 — Várias bombas, arredondamento e defesa contra 2 ataques
| Jogador | Ação |
|---|---|
| Ana | Ataca Duarte |
| Bruno | Bomba em Filipe |
| Carla | Bomba em Filipe |
| Duarte | Segurança |
| Eva | Ataca Duarte |
| Filipe | Folga |
| Gil | Ataca Filipe |
| Helena | Bomba em Filipe |

**Resultado:**
- Filipe **−10**, Gil **−10**.
- Bruno, Carla e Helena **+6** cada: bolo = 10 + 10 × 1 = 20, dividido por 3 e arredondado para baixo. Os 2 de resto perdem-se.
- Ana **−10**, Eva **−10**, Duarte **+20**: +10 por cada atacante. **Ana e Eva ficam reveladas.**
- Ninguém ganha bónus.

## Totais após 4 noites (com o sorteio da noite 2 = Bruno)
| Ana | Bruno | Carla | Duarte | Eva | Filipe | Gil | Helena |
|---|---|---|---|---|---|---|---|
| +20 | −4 | −24 | +10 | 0 | −8 | −28 | +8 |

## Noite 5 — Validação (o `validateAction` tem de rejeitar)
- Ana tenta **Atacar** → rejeitado: já usou os 3 ataques (noites 1, 2 e 4).
- Duarte tenta **Segurança** → rejeitado: já usou as 2 defesas (noites 1 e 4).
- Ana tenta **Bomba** → rejeitado: já usou a bomba (noite 3).
- Gil tenta **Atacar Gil** → rejeitado: não pode ser alvo de si próprio.
- Gil tenta **Atacar Ana** → aceite: só usou 1 ataque.
