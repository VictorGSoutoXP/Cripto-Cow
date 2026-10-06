# Apresentação para o hackathon

[Abrir a Cripto Cow](https://cripto-cow.onrender.com/) · [Escopo do MVP](mvp.md)

## Resumo em inglês

Cripto Cow is a donation transparency prototype for community campaigns. Donors can inspect the budget, follow each simulated contribution, and review public spending evidence. Expense requests reserve funds; approval creates an entry in an append-only ledger. Anyone can download the history and verify its SHA-256 chain independently. The app integrates Solana devnet to anchor ledger hashes through signed Memo transactions, without publishing personal documents onchain. Payments are simulated; custody, refunds, identity checks, and official evidence validation remain future integrations.

## Pitch curto em inglês

“Donating is easy. Understanding where the money went is harder. Cripto Cow connects campaign budgets, spending evidence, and a history that donors can verify themselves. Our prototype records simulated donations and reviewed expenses in a hash-linked ledger, with Solana devnet anchoring for an external reference. We want to help community organizations earn trust through clear, inspectable accounts. The next step is testing with organizers and donors, then integrating a payment partner for real transfers and refunds.”

## Demonstração em cinco minutos

Antes de gravar, abra o site para aguardar a inicialização do Render, entre no painel e prepare uma carteira Phantom em devnet com SOL de teste. Use uma campanha demonstrativa com saldo e orçamento disponíveis. Não mostre senhas, tokens ou dados pessoais na gravação. O roteiro abaixo serve para ensaio ou apresentação ao vivo; para envio, a [FAQ oficial da Colosseum](https://colosseum.com/hackathon) pede apresentação de dois a três minutos e vídeo de demonstração de no máximo três minutos.

| Tempo     | Mostrar                                                                  | Explicar                                                                                                                         |
| --------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:40 | Campanha, orçamento e regra da sobra                                     | O problema é acompanhar a destinação de uma doação. Os valores e organizações exibidos são fictícios.                            |
| 0:40–1:20 | “Apoiar esta causa”, aceite das regras e recibo                          | A contribuição é simulada e entra no histórico público sem nome do doador.                                                       |
| 1:20–2:20 | Painel, solicitação de liberação e evidência fictícia                    | O pedido reserva saldo e orçamento. A reserva ainda não é uma saída.                                                             |
| 2:20–3:00 | Conferência da evidência e aprovação com justificativa                   | A aprovação registra a saída; uma recusa libera a reserva. Organização e revisão compartilham o painel neste MVP.                |
| 3:00–3:50 | “Registro verificável”, conferência no navegador e download do histórico | Os hashes permitem detectar alterações no ledger. Eles não comprovam a veracidade da evidência.                                  |
| 3:50–4:40 | “Registrar hash na Solana” e, após confirmação, Explorer em devnet       | A carteira assina um Memo. A blockchain recebe somente o identificador da campanha, a quantidade de eventos e o hash.            |
| 4:40–5:00 | Limites do protótipo e próximo teste com usuários                        | Pagamentos e devoluções reais dependem de integração. Apresentar entrevistas e resultados somente quando houver dados coletados. |

Se a confirmação demorar, informe que a transação está pendente. No ensaio, retome a confirmação preservando a assinatura já enviada. Só apresente a ancoragem como concluída quando a API confirmar e o link do Explorer exibir a transação correspondente. Uma gravação anterior pode complementar a demo se mostrar uma transação real e verificável.

Para verificar um histórico exportado fora do site:

```bash
node scripts/verify-ledger.js caminho-do-ledger.json
```

**Pendência de demonstração:** registrar e conferir uma ancoragem real na Solana devnet. A integração está implementada, mas este documento não registra uma transação confirmada nem presume que ela já exista.

Para o vídeo de demo de até três minutos, use este corte do ensaio:

1. **0:00–0:25:** campanha, orçamento e explicação de que os valores são simulados.
2. **0:25–0:55:** contribuição demonstrativa e recibo.
3. **0:55–1:40:** pedido, evidência e aprovação; mostrar a reserva antes da saída.
4. **1:40–2:10:** verificação no navegador e exportação do histórico.
5. **2:10–2:45:** ancoragem e transação confirmada no Explorer, quando disponível.
6. **2:45–3:00:** limites atuais e próximo passo do produto.

No vídeo separado de apresentação, desenvolva o pitch com o problema, o usuário inicial, a solução, a diferença do produto e a distribuição planejada. Complete com a experiência real do time e validações realizadas, sem presumir parceiros, usuários ou receita.

## Preparação técnica

Estes itens são verificações do projeto para a apresentação, não uma declaração de inscrição concluída ou uma lista de exigências do evento.

- [x] O site publicado abre e o fluxo demonstrativo funciona.
- [x] A branch `main` contém o código publicado e instruções de execução.
- [ ] Uma transação devnet confirmada foi conferida no Explorer e preparada como evidência da integração, sem expor credenciais.
- [x] O histórico exportado passou pela verificação independente e `npm run check` passou na revisão final.
- [ ] O vídeo de demo foi cortado para no máximo três minutos.

## Dados e envio pelo time

Segundo as [regras oficiais da Colosseum](https://colosseum.com/legal/Crypto%20World%27s%20Fair%20Hackathon%20Rules.pdf), seções 5, 6 e 12, o encerramento é em **12 de outubro de 2026, às 23h59 PT**, cada integrante precisa de cadastro e o conteúdo da submissão deve ser em inglês. A [Superteam Brasil](https://hackathon.superteam.com.br/) informa o horário equivalente de **13 de outubro, às 3h59 de Brasília**. Cadastros, dados pessoais, consentimentos e envio final são preenchidos pelo time.

- [ ] Cada integrante concluiu o cadastro oficial na Colosseum; o cadastro na Superteam é separado.
- [ ] O time definiu seu responsável pelo envio e selecionou a trilha compatível com a integração Solana.
- [ ] O material enviado está em inglês, com tradução ou legendas para as telas em português; confirmar o idioma aceito para a interface com a organização.
- [ ] Nome, descrição, blockchains e ferramentas, integrantes, experiência, localização e logo foram preenchidos com informações reais.
- [ ] A URL pública e o link do repositório estão acessíveis para avaliação. A FAQ permite repositório privado com acesso concedido a `hackathon@colosseum.com`; repositório aberto é incentivado.
- [ ] O vídeo de apresentação tem dois a três minutos e o vídeo de demo tem no máximo três minutos, conforme a FAQ; os campos atuais do formulário foram conferidos.
- [ ] Estratégia de distribuição, validação de demanda e próximos passos foram preenchidos; os resultados relatados têm evidência.
- [ ] Trabalho anterior ao evento e componentes de terceiros foram descritos nos campos aplicáveis, conforme a FAQ e a seção 9 das regras.
- [ ] O responsável enviou o projeto e guardou a confirmação da plataforma antes do prazo.
- [ ] Se o time quiser concorrer também à Trilha Brasil, conferiu e realizou o envio separado indicado pela Superteam.

Os campos e formatos acima vêm da [FAQ oficial](https://colosseum.com/hackathon), na pergunta sobre o portal de submissão.

Inscrição e submissão: [Colosseum](https://colosseum.com/worldsfair). Apoio local e orientações da Trilha Brasil: [Superteam Brasil](https://hackathon.superteam.com.br/).
