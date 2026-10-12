# Escopo do MVP

A Cripto Cow demonstra o fluxo do documento de Doações Transparentes: criar uma campanha com orçamento, receber uma entrada, pedir uma liberação com evidência, revisar o pedido e acompanhar o histórico público.

## Fluxo

1. O participante cria uma conta com e-mail e senha, aceita as políticas e entra no próprio painel. A criação da campanha registra um rascunho associado à conta e o aceite das regras demonstrativas com data, versão, hash e textos associados.
2. A publicação libera a página pública, sem atribuir um selo de identidade.
3. O doador aceita a regra de liberação e a devolução proporcional da sobra. A doação aparece como anônima por padrão ou, se escolher pessoa ou empresa, com um nome fictício de 2 a 60 caracteres, o tipo, o valor e a data em público. Não há verificação de identidade. A entrada simulada recebe um identificador idempotente e um recibo.
4. O organizador informa uma evidência fictícia em versão pública. O pedido reserva saldo e orçamento, mas ainda não registra uma saída.
5. A moderação aprova ou recusa com justificativa, em acesso separado do participante. A aprovação verifica o saldo novamente e registra a saída; a recusa libera a reserva.
6. Uma denúncia gera protocolo privado para o painel. A suspensão depende da revisão e bloqueia novas doações e liberações.
7. O painel pode ancorar o hash do histórico na Solana devnet. Só transações confirmadas com o Memo e o assinante esperados aparecem no registro público.

## Integridade

Cada evento contém ID opaco, sequência, tipo, valor em centavos, categoria, referência, hash da evidência, data e hash do evento anterior. A serialização ordena as propriedades antes de calcular SHA-256.

SQLite impede atualização e exclusão da tabela de ledger por triggers. Alterações financeiras e de status ocorrem em transações. Isso protege a aplicação, mas um operador com acesso ao arquivo do banco ainda pode substituí-lo. A ancoragem externa permite comparar um prefixo do histórico com um hash já publicado.

A verificação no navegador recalcula os hashes com Web Crypto. A evidência tem um nonce público para permitir a conferência de seu conteúdo contra o hash registrado no ledger. O script de exportação confere a cadeia sem consultar a API. A compatibilidade com o hash ancorado não substitui a consulta da transação no Explorer nem prova que uma evidência é verdadeira.

O nome fictício e o tipo escolhido pelo doador ficam no banco fora do ledger financeiro imutável. Esses campos não integram os hashes financeiros e não são cobertos pela conferência do histórico ou pela ancoragem.

## Dados da demonstração

Os exemplos usam valores variados, doações anônimas e nomes fictícios de pessoas e empresas. Bancos novos recebem essa variedade na carga inicial. No ambiente existente, a atualização acrescenta oito doações demonstrativas por campanha original de forma idempotente: os 380 eventos anteriores permanecem como prefixo, com seus hashes e referências preservados. Não há remoção ou reescrita do histórico anterior. O saldo e o hash final passam a refletir as novas entradas.

## Termos e políticas

O site publica os termos da demonstração, a política de privacidade e as regras de transparência em texto. As minutas para doadores, organizadores e consentimentos preservam o conteúdo do documento jurídico do time e ficam identificadas como textos da operação futura. O aceite do MVP se refere aos textos atuais; mudanças de versão ou conteúdo exigem nova leitura e confirmação. Aceites antigos e o ledger existente são preservados. Veja [políticas e versionamento](politicas.md).

## Privacidade

O cadastro registra e-mail, nome de exibição, hash scrypt da senha e aceite das políticas. O e-mail não é verificado por mensagem e não comprova identidade. Campanhas e evidências usam dados fictícios; não são aceitos arquivos originais, documentos de identidade, CPF, CNPJ, cartões ou dados bancários. A identificação pública da doação é opcional; nomes de pessoas e empresas devem ser fictícios e são autodeclarados. O modo anônimo se refere à exibição pública e não elimina os dados técnicos tratados pela infraestrutura. Somente a versão pública da evidência aparece na campanha; o relato de denúncia fica restrito à moderação. O Memo de ancoragem contém identificador de campanha, quantidade de eventos e hash; a carteira assinante e a transação são públicas na rede.

## Limites

- Dinheiro: simulação, sem recebimento, custódia, Pix, cartão, fornecedor ou devolução reais.
- Identidade: sem KYC e sem coleta de beneficiários, saúde ou biometria.
- Evidências: nível C demonstrativo; sem consulta de NF-e/NFC-e ou confirmação de pagamento.
- Acesso: contas individuais com cookie HttpOnly e proteção de origem. Participantes acessam somente suas campanhas e solicitações; aprovação de despesas e denúncias são reservadas à moderação. O acesso administrativo sem senha é permitido apenas no loopback demonstrativo. Recuperação utiliza código privado; o perfil permite alterar senha e encerrar a conta. O e-mail não é verificado por mensagem. Veja [cadastro e permissões](contas.md).
- Infraestrutura: uma instância de API com SQLite local ou libSQL remoto no Turso. A hospedagem no Render exige banco remoto e senha administrativa. Sessões individuais ficam no banco e expiram após oito horas; sessões da moderação ficam em memória e também terminam ao reiniciar.
- Campanhas: a meta não encerra automaticamente a arrecadação. O prazo bloqueia novas doações. Encerramento com saldo ou pedidos pendentes é recusado, pois a devolução ainda não está integrada.
- Solana: ancoragem de hashes por Memo na devnet, sem contrato de custódia ou movimentação de tokens. O administrador paga somente a taxa da rede em SOL de teste.
- Carteiras: uma por rede no perfil, com prova de posse por assinatura e desafio de cinco minutos. Zcash suporta somente endereços transparentes testnet e pedidos ZIP 321, sem crédito no ledger ou verificação de pagamento. Detalhes em [carteiras e redes](carteiras-redes.md).

## Antes de operar com recursos reais

Integrar parceiro de pagamento e reconciliação; definir contas individuais para a equipe de moderação; verificar identidade; armazenar documentos privados com acesso controlado; validar evidências oficiais; implementar devoluções, retirada de consentimento e atendimento; revisar os termos e a política de privacidade com profissionais habilitados. Os PDFs são referências de produto e minutas, não validação jurídica.

## Referências técnicas

- [Hackathon Superteam Brasil](https://hackathon.superteam.com.br/)
- [Memo na Solana](https://github.com/solana-foundation/developer-content/blob/main/content/cookbook/transactions/add-memo.md)
- [SQLite no Node.js](https://nodejs.org/api/sqlite.html)
- [Imagens ilustrativas do Unsplash](https://unsplash.com/)
