# Pitch da Cripto Cow

[Produto](https://cripto-cow.onrender.com/) · [Código](https://github.com/VictorGSoutoXP/Cripto-Cow) · [Roteiro da demo](hackathon.md) · [Critérios, dados e impacto](avaliacao-hackathon.md)

## Apresentação em português

Fala para aproximadamente dois a três minutos. Faça uma pausa depois da pergunta inicial e use a demonstração em um vídeo separado, conforme os formatos da [FAQ da Colosseum](https://colosseum.com/hackathon).

Você já doou para uma causa e depois ficou sem saber o que aconteceu com aquele dinheiro?

Na Pesquisa Doação Brasil 2024, apenas 33% dos entrevistados percebem clareza no uso dos recursos pelas ONGs.

A campanha mostra a meta. Mas o doador precisa entender também o orçamento, as despesas e o que foi entregue. Para quem organiza, prestar contas costuma significar juntar comprovantes e responder às mesmas perguntas em canais diferentes.

A Cripto Cow reúne esse caminho em um lugar: uma plataforma de doações com orçamento aberto, evidências de despesas e histórico verificável. Nosso foco inicial são campanhas comunitárias e pequenas organizações que precisam mostrar a destinação dos recursos com clareza.

No protótipo, a pessoa escolhe uma campanha, consulta suas regras e registra uma contribuição simulada. Ela pode aparecer como anônima ou usar uma identificação fictícia de pessoa ou empresa. O organizador solicita uma despesa, apresenta a evidência e aguarda a revisão. O pedido reserva saldo; a aprovação registra a saída. Assim, o doador acompanha a relação entre o plano da campanha e o que foi registrado.

Cada evento financeiro recebe uma impressão digital ligada à anterior. Qualquer pessoa pode baixar o histórico e conferir se essa sequência foi alterada. Integramos a Solana devnet para registrar uma referência externa desse histórico por uma transação assinada pela carteira. A blockchain recebe o hash, sem expor documentos pessoais. Isso ajuda a verificar a integridade dos registros; a análise das evidências continua necessária.

Já temos um MVP publicado, código aberto, painel de revisão e políticas acessíveis no próprio site. Os dados são demonstrativos e os pagamentos são simulados.

Nosso próximo passo é validar o fluxo com organizadores e doadores: medir o tempo para prestar contas, a proporção de despesas documentadas e se a clareza do histórico aumenta a disposição de apoiar outra campanha. A distribuição começa pelas próprias organizações, que compartilham as campanhas com sua comunidade. A receita ainda será validada, com a hipótese de oferecer ferramentas de gestão e prestação de contas às organizações. Para operar com dinheiro real, precisamos integrar um parceiro de pagamentos e concluir a revisão das regras dessa operação.

Cripto Cow. Quem doa acompanha. Quem realiza presta contas.

## Presentation in English

Have you ever donated to a cause and then wondered what happened to the money?

In the Brazil Giving Survey 2024, only 33% of respondents perceive clarity about how NGOs use their funds.

A campaign shows its fundraising goal. But donors also need to understand the budget, the expenses, and what was delivered. For organizers, accountability often means collecting receipts and answering the same questions across different channels.

Cripto Cow brings that journey into one place: a donation platform with open budgets, spending evidence, and a verifiable history. Our initial target is community campaigns and small organizations that need a clear way to explain how funds are used.

In our prototype, a donor selects a campaign, reads its rules, and records a simulated contribution. They can remain anonymous or choose a fictional individual or company identity. An organizer requests an expense, provides evidence, and waits for review. The request reserves funds; approval records the outflow. Donors can follow how the campaign's plan connects to its recorded spending.

Each financial event receives a digital fingerprint linked to the previous one. Anyone can download the history and verify whether that sequence has been changed. We integrated Solana devnet to anchor an external reference to that history through a wallet-signed transaction. Only the hash and campaign reference go onchain, without personal documents. This supports record integrity; reviewing the evidence remains necessary.

We have a published MVP, an open-source repository, a review dashboard, and policies available inside the app. The data is fictional and payments are simulated.

Our next step is to validate the workflow with organizers and donors. We plan to measure reporting time, the share of documented expenses, and whether a clearer history increases willingness to support another campaign. Distribution starts with organizations sharing campaigns within their existing communities. Revenue is still a hypothesis: management and accountability tools for organizations. Real donations will require a payment partner and completion of the review of the rules for that operation.

Cripto Cow. Donors follow the journey. Organizers show the results.

## Versão de trinta segundos

A Cripto Cow ajuda quem doa a acompanhar o destino dos recursos. A campanha apresenta o orçamento, o organizador registra evidências e cada movimentação entra em um histórico verificável. Integramos a Solana devnet para ancorar hashes desse histórico. O MVP já está publicado, com código aberto e pagamentos simulados. Agora queremos validar o fluxo com campanhas comunitárias antes de integrar doações reais. Cripto Cow: quem doa acompanha; quem realiza presta contas.

## Apoio visual para a apresentação

Para o slide do problema, use **“APENAS 33%”**, seguido de **“percebem clareza no uso dos recursos pelas ONGs”**. Identifique a fonte como **IDIS/Ipsos, Pesquisa Doação Brasil 2024, p. 70** e inclua o [link do relatório](https://www.idis.org.br/wp-content/uploads/2025/08/Pesquisa-Doacao-Brasil-2024_IDIS.pdf#page=70). É uma medida de percepção dos entrevistados.

| Parte         | Tela ou slide                    | Mensagem                                                      |
| ------------- | -------------------------------- | ------------------------------------------------------------- |
| Problema      | Pergunta inicial e uma campanha  | O doador precisa acompanhar a destinação dos recursos.        |
| Usuário       | Campanha e orçamento             | Começamos por campanhas comunitárias e pequenas organizações. |
| Produto       | Pedido, evidência e histórico    | Conectar orçamento, revisão e prestação de contas.            |
| Solana        | Verificação e fluxo de ancoragem | Hashes permitem conferir a integridade do histórico.          |
| Execução      | Site e repositório públicos      | O protótipo está disponível para uso e colaboração.           |
| Próximo passo | Plano de validação               | Testar com usuários e preparar a integração de pagamentos.    |

## Perguntas da banca

**O dinheiro passa pela blockchain?** No MVP, os valores são simulados. A integração Solana registra hashes do histórico em devnet; não transfere os valores das doações.

**O que a blockchain garante?** Uma transação confirmada oferece uma referência externa para comparar o histórico. Isso não comprova identidade, autenticidade de um recibo ou entrega de uma causa. Esses pontos exigem análise e controles próprios.

**Já existe uma transação confirmada para mostrar?** Confira o link publicado no Explorer antes da gravação. A integração implementada não substitui essa comprovação. Sem uma assinatura confirmada disponível, mostre o fluxo e descreva a ancoragem como pendente.

**Por que uma organização adotaria o produto?** A hipótese é reduzir o esforço de prestar contas e facilitar a consulta pelos apoiadores. Entrevistas e testes com organizações ainda precisam validar essa hipótese.

**Vocês têm usuários, receita ou parceiros?** O site e o código estão publicados. Os exemplos não representam usuários reais, receita ou parcerias. Apresente esses resultados apenas depois de coletá-los.

**Como pretendem distribuir e sustentar o produto?** Começar com organizações que já têm uma comunidade de apoiadores e testar ferramentas de gestão e prestação de contas como proposta de receita. Esse modelo ainda será validado; o MVP não cobra taxa.

**As políticas já autorizam receber dinheiro real?** Os termos vigentes cobrem a demonstração. As minutas para uma operação futura estão separadas e dependem das decisões, integrações e revisão do time.

Antes de gravar, inclua a experiência real dos integrantes na introdução ou no encerramento. Use somente resultados e transações que o time possa comprovar. A apresentação não substitui o vídeo de demonstração nem conclui a inscrição no evento.
