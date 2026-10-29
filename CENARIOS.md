# Night Staff — Cenários de aceitação (regras v5)

> Calculados à mão a partir do `RULES.md` v5 e confirmados pelo Walter.
> Agentes: cada cenário tem de virar um teste. Se o motor der um resultado diferente, **o motor está errado** (ou o `RULES.md` é ambíguo → perguntar).
> Os resultados são **movimentos** de pontos. Os pontos finais são `50 (salário) + movimentos`.

## Cenário principal: um ciclo, noites 1 a 5

**Jogadores:** Ana, Bruno, Carla, Duarte, Eva, Filipe, Gil, Helena.

### Noite 1 — Básico
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
- Carla **−5**, Duarte **+10**: Duarte defendeu, por isso o ataque custa metade. **Carla aparece como apanhada** (público, sem dizer onde). Só o Duarte sabe que a apanhou.
- Eva **+5**, Filipe **−5**: Filipe estava fora, por isso foi **assalto à casa vazia** (metade).
- Filipe **+10**, Gil **−10**: ataque normal.
- Filipe fica com **+5** no total da noite.
- Helena **+2**: em casa e ninguém a atacou.
- Duarte **não** ganha bónus: foi atacado.

### Noite 2 — Sorteio, ataques cruzados e ação por defeito
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
- Duarte e Eva assaltaram a casa vazia um do outro: cada um ganha +5 e perde −5. Ficam com **0** no total da noite.
- Filipe **+2**: defendeu sem ser atacado, ganha o bónus e a defesa fica gasta.
- Gil **+2**: fica em Folga por defeito e ninguém o atacou.
- **O público não vê nada disto:** só que Ana, Bruno, Carla, Duarte e Eva estavam fora. Cada um vê em privado o seu resultado (a Helena sabe que foi atacada, mas não por quem).

### Noite 3 — Bombas
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
- Duarte **−10**, Helena **+10**: bomba contra defesa custa 10. **Duarte aparece como apanhado.**
- Eva **+10**, Filipe **−10**: bomba sozinha conta como ataque normal.
- Ninguém ganha bónus.

### Noite 4 — Várias bombas, arredondamento e defesa contra 2 ataques
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
- Ana **−5**, Eva **−5**, Duarte **+20**: +10 por cada atacante. **Ana e Eva aparecem como apanhadas.**
- Ninguém ganha bónus.

### Totais após 4 noites (com o sorteio da noite 2 = Bruno)
| | Ana | Bruno | Carla | Duarte | Eva | Filipe | Gil | Helena |
|---|---|---|---|---|---|---|---|---|
| Movimentos | +25 | −4 | −19 | +20 | +10 | −13 | −28 | +8 |
| Pontos (50 + movimentos) | 75 | 46 | 31 | 70 | 60 | 37 | 22 | 58 |

### Noite 5 — Validação (o `validateAction` tem de rejeitar)
- Ana tenta **Atacar** → rejeitado: já usou os 3 ataques (noites 1, 2 e 4).
- Duarte tenta **Segurança** → rejeitado: já usou as 2 defesas (noites 1 e 4).
- Ana tenta **Bomba** → rejeitado: já usou a bomba (noite 3).
- Gil tenta **Atacar Gil** → rejeitado: não pode ser alvo de si próprio.
- Gil tenta **Atacar Filipe** → rejeitado: atacou o Filipe na noite anterior (noite 4).
- Bruno tenta **Atacar Filipe** → rejeitado: a Reunião da noite 4 foi no Filipe, e conta como ataque.
- Gil tenta **Atacar Ana** → aceite: só usou 1 ataque e a Ana não foi o seu alvo na noite 4.
- Ana tenta **Desaparecer** → aceite: ainda não usou nenhum dos 2.

## Cenário extra A — Bomba num alvo fora (noite 1, 4 jogadores)
| Jogador | Ação |
|---|---|
| Ana | Bomba em Bruno |
| Bruno | Ataca Carla |
| Carla | Ataca Bruno |
| Duarte | Bomba em Bruno |

**Resultado:**
- Bruno **−10**: estava fora, mas a bomba acerta na mesma.
- Ana **+5**, Duarte **+5**: os 10 são divididos pelos 2 bombistas.
- Carla **0**: também assaltou a casa do Bruno, mas a bomba leva tudo.
- Bruno **+5**, Carla **−5**: o Bruno assaltou a casa vazia da Carla, e nessa casa não havia bomba.
- No total da noite: Bruno **−5**, Ana **+5**, Duarte **+5**, Carla **−5**.
- Ninguém ganha bónus, porque ninguém ficou em casa.

## Cenário extra D — Assalto em grupo (noite 1, 5 jogadores)
| Jogador | Ação |
|---|---|
| Ana | Ataca Eva |
| Bruno | Ataca Eva |
| Carla | Ataca Eva |
| Duarte | Folga |
| Eva | Ataca Duarte |

**Resultado:**
- Eva estava fora, por isso a casa dela foi assaltada por 3: Eva **−5**. Ana, Bruno e Carla ganham **+1** cada (5 ÷ 3, arredondado para baixo). Os 2 de resto perdem-se.
- Eva **+10**, Duarte **−10**: Duarte estava em casa sem defesa.
- No total da noite: Eva **+5**.
- Ninguém ganha bónus.

## Cenário extra E — Desaparecer (noite 1, 4 jogadores)
| Jogador | Ação |
|---|---|
| Ana | Desaparecer |
| Bruno | Ataca Ana |
| Carla | Ataca Duarte |
| Duarte | Folga |

**Resultado:**
- Ana **−5**, Bruno **+5**: a Ana estava fora, por isso foi assalto à casa vazia.
- Carla **+10**, Duarte **−10**: ataque normal.
- Ninguém ganha bónus.
- **Público:** Ana, Bruno e Carla fora; Duarte em casa; ninguém apanhado.

## Cenário extra F — Desaparecer não tem alvo (validação)
- Desaparecer com alvo → rejeitado.
- Terceiro Desaparecer no mesmo ciclo → rejeitado (quota de 2).
- Atacar na noite 2 o mesmo alvo atacado na noite 1 → rejeitado. Atacar esse alvo na noite 3, se a noite 2 foi Desaparecer → aceite.

## Cenário extra B — Noite 9 a dobrar (noite 9, 5 jogadores)
| Jogador | Ação |
|---|---|
| Ana | Ataca Bruno |
| Bruno | Folga |
| Carla | Ataca Duarte |
| Duarte | Segurança |
| Eva | Folga |

**Resultado** (tudo ×2):
- Ana **+20**, Bruno **−20**.
- Carla **−10**, Duarte **+20**.
- Eva **+4**: bónus de casa a dobrar.

## Cenário extra C — Desempates
**C1. Confronto direto:**
- Ana e Bruno acabam com os mesmos pontos e com 3 ataques bem-sucedidos cada.
- Ana acertou **2 vezes no Bruno** e o Bruno acertou **1 vez na Ana**.
- → **Ganha a Ana**, pelo confronto direto.

**C2. Mini-liga com 3 empatados:**
- Ana, Bruno e Carla empatados em pontos e em ataques bem-sucedidos.
- Ataques bem-sucedidos entre eles: Ana→Bruno 1, Bruno→Carla 2, Carla→Ana 1.
- Os ataques contra jogadores fora do empate não contam.
- → **Ganha o Bruno** (2), contra Ana 1 e Carla 1.

**C3. Bomba conta como ataque:** uma Reunião de emergência que rendeu pontos no Bruno conta como 1 ataque bem-sucedido contra o Bruno. Isto vale para cada bombista.

**C4. Sorteio:**
- Dois jogadores empatados em tudo: pontos, ataques bem-sucedidos, confronto direto e pontos perdidos.
- → O ranking tem **exatamente um** 1.º lugar. Com a mesma seed do ciclo, o vencedor é sempre o mesmo. Com seeds diferentes, os dois conseguem ganhar.
