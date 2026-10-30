# Night Staff — Regras (v9)

> Fonte da verdade do jogo. O motor (`engine/`) implementa exatamente isto.
> Agentes: **não alterem este ficheiro**. Se uma regra for ambígua, parem e perguntem ao Walter.

## 1. Formato: salas e partidas
- **Contas:** qualquer pessoa cria conta com o email (registo aberto). Um jogador pode estar em **várias salas ao mesmo tempo**. Os pontos, as quotas e a visibilidade são sempre **por sala**.
- **Sala:** quem a cria é o **admin**. A sala tem um **código** curto (6 caracteres, sem letras ambíguas) que se partilha com os amigos.
- Uma sala tem **uma partida de cada vez**: 9 noites e depois a resolução. Quando a partida acaba, **a sala acabou**. Para voltar a jogar, cria-se uma sala nova ou o admin **reinicia** a sala.

### 1.1 Sala com pessoas
| Fase | O que acontece |
|---|---|
| 📝 **Lobby** | Entra-se com o código e pode-se sair. O admin pode **expulsar** qualquer outro jogador (nunca a si próprio). Quem é expulso sai da sala e, com o código, pode voltar a entrar. Sem ações |
| ▶️ **Começar** | Só o admin, com **3 ou mais** jogadores. A partir daí a lista de jogadores fica fixa |
| 🌙 **Noites 1–9** | A **noite 1 abre no momento em que o admin carrega em Começar** e fecha às 23:59 desse dia. Cada noite seguinte é o dia seguinte, com escolha até às 23:59 e resolução às 00:00 |
| 🏆 **Resolução** | Depois da noite 9: ranking final e Funcionário do Mês. A sala fica acabada |

- **Expulsar** só existe no lobby, antes de Começar: com a partida a decorrer a lista de jogadores é fixa. Também não existe nas salas contra bots.
- **Reiniciar** (só o admin, com a sala acabada): nova partida na mesma sala e com o mesmo código. Volta ao lobby com os mesmos jogadores, e qualquer um pode sair ou entrar até o admin carregar em Começar.
- O admin escolhe a hora de começar. Se começar perto da meia-noite, a noite 1 fica curta.

### 1.2 Sala contra bots
- Joga-se **sozinho contra bots**: o admin escolhe quantos (entre **2 e 11**). Ninguém mais entra.
- O tempo **não segue o relógio**. A noite só acaba quando o jogador carrega em **⏭️ Passar o dia**: os bots escolhem as suas ações **ao calhas**, sempre dentro das regras (quotas, alvos e sem atacar o mesmo alvo duas noites seguidas), e a noite é resolvida logo.
- Se o jogador não escolheu nada, fica com `STAY`, como sempre.
- Depois da noite 9 há resolução e a sala acaba. Pode-se reiniciar, como as outras.
- O jogador pode **apagar a sala** a qualquer momento, a meio ou acabada: é só dele e não afeta mais ninguém. Apaga-se tudo o que era da sala. Nas salas com pessoas isto não existe.
- As regras do jogo (§2–§5) são as mesmas.

### 1.3 Pontos
- Em cada partida, todos começam com um **salário de 50 pontos** e quotas completas. Os pontos podem descer abaixo de 0 ("sem salário"). Cada partida tem o seu vencedor.
- **Noite 9 a dobrar:** todos os movimentos de pontos da última noite contam a dobrar, incluindo o bónus de casa. Calcula-se normalmente e multiplica-se cada movimento por 2.
- Escala de pontos: **10** por ataque. Bónus de casa: **2**.
- Fuso horário: **Europe/Lisbon** em tudo.

## 2. Ações (1 por noite)
| Código | Nome na app | Significado | Quota por partida | Onde fica o jogador |
|---|---|---|---|---|
| `STAY` | 🏠 Folga | Ficar em casa | ∞ | Em casa |
| `DEFEND` | 🛡️ Segurança | Defender | 2 | Em casa |
| `ATTACK` | 🗡️ Visita surpresa | Atacar `alvo` | 3 | Fora |
| `BOMB` | 🔥 Despedimento coletivo | Bomba em `alvo` | 1 | Fora |
| `VANISH` | 🫥 Desaparecer | Sair de casa sem atacar ninguém | 2 | Fora |

- O prazo para escolher é até às **23:59**. Até lá, pode-se mudar a escolha.
- Quem não escolher fica com `STAY`.
- Não se pode escolher a si próprio como alvo.
- **Não se pode atacar a mesma pessoa duas noites seguidas:** o alvo de uma Visita surpresa ou de um Despedimento coletivo não pode ser o mesmo da Visita ou do Despedimento do próprio jogador na noite anterior. Uma noite sem ataque pelo meio volta a permitir.
- Não se pode escolher uma ação com a quota esgotada. Isto é validado ao submeter.
- A quota gasta-se sempre que a ação é escolhida, aconteça o que acontecer.

## 3. Resolução (00:00, tudo em simultâneo)
Para cada jogador **T** que foi alvo de pelo menos um ataque ou bomba, sejam:
- **N** = os atacantes normais em T
- **B** = os bombistas em T

Aplica-se o **primeiro** caso que se verificar:

1. **T está fora** (escolheu `ATTACK`, `BOMB` ou `VANISH`):
   - **Assalto à casa vazia:** se B estiver vazio, T perde **5** e os atacantes de N dividem **5** em partes iguais, arredondado para baixo. Não há sorteio nem perdedores.
   - Se houver bomba (B não vazio), **a bomba leva tudo**: os atacantes de N ficam com 0.
   - **A bomba acerta na mesma** ("num Despedimento coletivo ninguém escapa, esteja onde estiver"): se B não estiver vazio, T perde **10** e os bombistas dividem **10** em partes iguais, arredondado para baixo.
2. **T escolheu `DEFEND`:**
   - Cada atacante de N perde **5**.
   - Cada bombista de B perde **10**.
   - T ganha **10 por cada atacante** (N + B).
   - Todos os atacantes de T ficam **apanhados** (§4).
3. **T está em casa sem defesa (`STAY`):**
   - **B vazio e |N| = 1:** o atacante ganha **10** e T perde **10**.
   - **B vazio e |N| ≥ 2:** **sorteio** entre N. O vencedor ganha **10** e T perde **10**. Cada um dos outros atacantes de N perde **10** ("morre").
   - **B com 1 ou mais bombistas:** não há sorteio.
     - T perde **10** e cada atacante de N perde **10** ("morre").
     - Bolo = `10 + 10 × |N|`, dividido em partes iguais por B e arredondado para baixo.
     - O resto da divisão perde-se.
     - Uma bomba sozinha num alvo dá **+10**, como um ataque normal.

**Bónus de casa:** quem escolheu `STAY` ou `DEFEND` e **não foi alvo** de nenhum ataque ou bomba ganha **+2**.

**Sorteio:** é determinístico a partir de uma `seed` guardada por noite, para se poder reproduzir e auditar.

## 4. Visibilidade
- **Antes da resolução:** ninguém vê as ações dos outros, nem na app nem através da API.
- **Público** (todos veem, depois da resolução):
  - Quem estava **em casa** e quem estava **fora**. Nunca a ação.
  - Quem foi **apanhado**: "🚨 Carla foi apanhada a meio de uma visita". Sem dizer em que casa, para não revelar quem se defendeu.
  - Nada mais: nem quem foi atacado, nem defesas, sorteios, bombas, assaltos, bónus ou contagens.
- **Privado** (só o próprio vê):
  - O que lhe aconteceu nessa noite: foi atacado, assaltado ou bombardeado (sem saber por quem), ganhou ou perdeu um sorteio, apanhou alguém (e quem), ganhou o bónus.
  - Os seus pontos e movimentos. O ranking completo só é revelado na resolução, depois da noite 9.
- O **histórico** de todas as noites anteriores fica sempre consultável, com as mesmas regras.

## 5. Fim da partida (resolução)
- Não há ações. A app mostra o ranking final, o vencedor (🏆 **Funcionário do Mês**) e o histórico completo.
- **Desempate:**
  1. Mais **ataques bem-sucedidos** na partida.
  2. **Confronto direto** (como no futebol): mais ataques bem-sucedidos **contra os outros jogadores empatados**. Com 3 ou mais empatados, contam só os ataques entre eles (mini-liga).
  3. Menos pontos perdidos.
  4. Se continuar empatado, há **sorteio** com uma seed guardada para a partida (reprodutível). Há sempre um único Funcionário do Mês.

  **Ataque bem-sucedido** = Visita surpresa que rendeu pontos (atacante único ou vencedor do sorteio), ou Despedimento coletivo que rendeu pontos. Conta "contra X" quando X foi o alvo.

## 6. Em aberto (decidir depois do primeiro teste)
- O defensor ganha +10 **por atacante** ou +10 fixo? Por agora fica por atacante.
- Os números (10 / 5 / 2 / salário / quotas) ajustam-se com base no simulador e no primeiro jogo real.
- Ideia para a v4: ação **Vigiar** (2 por partida), para ver se o alvo saiu de casa nessa noite.
