# Avaliação da Cripto Cow para o hackathon

Revisão de 09/10/2026 com base no código, na documentação e nos endpoints públicos. É uma avaliação interna; a banca decide a pontuação. [Pitch](pitch.md) · [Escopo](mvp.md) · [Produto](https://cripto-cow.onrender.com/)

## Critérios

| Critério          | Situação atual                 | Evidência e próximo passo                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funcionalidade    | Demonstrada no escopo do MVP   | Campanhas, orçamento, contribuições simuladas, reserva de saldo, revisão e histórico verificável. A base publicada passou por build e 72 testes. Falta comprovar uma transação de ancoragem no Explorer e integrar pagamentos para uma operação real.                                  |
| Impacto potencial | Hipótese fundamentada          | Transparência e prestação de contas são o foco. Falta validar adoção, benefício aos usuários e o segmento que o time consegue atender. Uma estimativa do setor não é receita prevista nem mercado capturável pelo produto.                                                             |
| Originalidade     | Diferenciação a demonstrar     | A proposta conecta orçamento, evidência, revisão e histórico verificável para campanhas comunitárias. Doações com blockchain já existem; comparar esse fluxo com alternativas e testar se ele resolve uma necessidade específica.                                                      |
| UX                | Fluxo demonstrativo disponível | A consulta pública e a contribuição simulada dispensam carteira. A ancoragem exige Phantom, devnet e SOL de teste. Validar compreensão com usuários e testar o acesso ao painel em seus próprios navegadores; o sucesso em um teste isolado não resolve relatos de dificuldade.        |
| Composabilidade   | Inicial                        | Integra carteira, RPC e Memo da Solana. Exporta o ledger para conferência independente. Ainda não há pagamentos com tokens, programa próprio, multisig ou integração com protocolos de doação e financiamento.                                                                         |
| Plano de negócio  | Em validação                   | Há um segmento inicial e uma hipótese de ferramentas de gestão para organizações. Faltam entrevistas, pilotos, disposição a pagar, custos de operação, plano de aquisição e experiência real dos integrantes na apresentação. O MVP prova execução técnica, não viabilidade econômica. |

A avaliação não equivale a atender completamente todos os critérios. No momento da consulta pública, as três campanhas tinham 404 eventos financeiros válidos e nenhuma ancoragem confirmada. Dados e organizações da demo são fictícios; não representam tração.

## Evidência para o problema

A [Pesquisa Doação Brasil 2024, IDIS/Ipsos](https://www.idis.org.br/wp-content/uploads/2025/08/Pesquisa-Doacao-Brasil-2024_IDIS.pdf#page=70) informa, na página 70:

- **33%** percebem clareza no uso de recursos pelas ONGs.
- **30%** concordam, nos dois maiores níveis da escala, que a maioria das ONGs é confiável.

Os outros 70% incluem respostas neutras. O estudo não mede sofrimento, fraude ou proporção de doações auditadas. Não sustenta “70% estão sofrendo” nem “97% das doações não são verificadas”. A metodologia da página 10 restringe o universo a adultos das classes A, B e C, com renda familiar acima de um salário mínimo.

A estimativa de **R$ 24,3 bilhões em doações institucionais em 2024**, na página 53, dimensiona o setor; não é o TAM da Cripto Cow.

## Diferenciação

A [Giveth](https://docs.giveth.io/about-giveth) já oferece doações com blockchain. Por isso, evitar dizer que a Cripto Cow inventou doações transparentes ou que é a primeira plataforma desse tipo. Nosso recorte é o acompanhamento do orçamento até a revisão de despesas, com uma referência externa para conferir a integridade do histórico. A relevância desse recorte precisa ser validada com organizadores e doadores.

## ONU, ODS e UNESCO

A meta [16.6 dos ODS da ONU](https://sdgs.un.org/goals/goal16) trata de instituições eficazes, responsáveis e transparentes. Nossa interpretação é que o foco da Cripto Cow em prestação de contas dialoga com esse objetivo. Isso é uma relação temática; ainda não há impacto medido pelos indicadores oficiais.

A [UNESCO atua na agenda do ODS 4, de educação](https://www.unesco.org/sdg4education2030/en). Uma futura campanha educacional poderia estabelecer metas próprias, como recursos entregues e atividades realizadas, com evidências e revisão. Essa aplicação ainda precisa de um piloto. Não há parceria, certificação ou endosso da UNESCO ou da ONU.

Fala opcional para explicar essa relação:

> “Queremos facilitar a prestação de contas de campanhas comunitárias. Esse propósito dialoga com o ODS 16, que inclui transparência institucional. Vamos medir o resultado em pilotos com organizações, começando pela documentação das despesas e pela compreensão dos doadores.”

## Prioridades para a apresentação

1. Preparar uma ancoragem devnet confirmada, usando a carteira do responsável, e conferir sua assinatura no Explorer. Não apresentar uma tentativa pendente como concluída.
2. Testar o fluxo e o login nos navegadores dos integrantes. Registrar dificuldades e correções, sem expor senhas.
3. Entrevistar organizadores e doadores; relatar tamanho da amostra, perguntas e resultados reais.
4. Escolher um piloto e um comprador inicial. Estimar custos de pagamentos, suporte, análise de evidências e infraestrutura; testar a proposta de cobrança.
5. Explicar quais integrações do ecossistema seriam úteis ao fluxo. Candidatas futuras são pagamentos com stablecoins e controle de aprovações por multisig; são planos, não funcionalidades atuais.
6. Apresentar a experiência real do time e quem ficará responsável por produto, engenharia, operação e revisão jurídica.
