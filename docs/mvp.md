# Escopo do MVP

A Cripto Cow demonstra o fluxo do documento de Doações Transparentes: criar uma campanha com orçamento, receber uma entrada, pedir uma liberação com evidência, revisar o pedido e acompanhar o histórico público.

## Fluxo

1. O painel cria a campanha como rascunho e registra o aceite das regras demonstrativas.
2. A publicação libera a página pública, sem atribuir um selo de identidade.
3. O doador aceita a regra de liberação e a devolução proporcional da sobra. A entrada simulada recebe um identificador idempotente e um recibo.
4. O organizador informa uma evidência fictícia em versão pública. O pedido reserva saldo e orçamento, mas ainda não registra uma saída.
5. A revisão aprova ou recusa com justificativa. A aprovação verifica o saldo novamente e registra a saída; a recusa libera a reserva.
6. Uma denúncia gera protocolo privado para o painel. A suspensão depende da revisão e bloqueia novas doações e liberações.
7. O painel pode ancorar o hash do histórico na Solana devnet. Só transações confirmadas com o Memo e o assinante esperados aparecem no registro público.

## Integridade

Cada evento contém ID opaco, sequência, tipo, valor em centavos, categoria, referência, hash da evidência, data e hash do evento anterior. A serialização ordena as propriedades antes de calcular SHA-256.

SQLite impede atualização e exclusão da tabela de ledger por triggers. Alterações financeiras e de status ocorrem em transações. Isso protege a aplicação, mas um operador com acesso ao arquivo do banco ainda pode substituí-lo. A ancoragem externa permite comparar um prefixo do histórico com um hash já publicado.

A verificação no navegador recalcula os hashes com Web Crypto. A evidência tem um nonce público para permitir a conferência de seu conteúdo contra o hash registrado no ledger. O script de exportação confere a cadeia sem consultar a API. A compatibilidade com o hash ancorado não substitui a consulta da transação no Explorer nem prova que uma evidência é verdadeira.

## Privacidade

O protótipo usa dados fictícios e não aceita arquivos originais, documentos de identidade, cartões ou dados bancários. Doações são públicas sem nome. Somente a versão pública da evidência aparece na campanha; o relato de denúncia fica restrito ao painel. A ancoragem contém apenas identificador de campanha, quantidade de eventos e hash.

## Limites

- Dinheiro: simulação, sem recebimento, custódia, Pix, cartão, fornecedor ou devolução reais.
- Identidade: sem KYC e sem coleta de beneficiários, saúde ou biometria.
- Evidências: nível C demonstrativo; sem consulta de NF-e/NFC-e ou confirmação de pagamento.
- Acesso: sessão administrativa com cookie HttpOnly e proteção de origem. O acesso sem senha é permitido apenas no loopback em modo demonstrativo. Organização e moderação compartilham o painel de testes.
- Infraestrutura: uma instância de API com SQLite local ou libSQL remoto no Turso. A hospedagem no Render exige banco remoto e senha administrativa. Sessões em memória expiram após oito horas e são encerradas ao reiniciar.
- Campanhas: a meta não encerra automaticamente a arrecadação. O prazo bloqueia novas doações. Encerramento com saldo ou pedidos pendentes é recusado, pois a devolução ainda não está integrada.
- Solana: ancoragem de hashes por Memo na devnet, sem contrato de custódia ou movimentação de tokens. O administrador paga somente a taxa da rede em SOL de teste.

## Antes de operar com recursos reais

Integrar parceiro de pagamento e reconciliação; separar permissões de organizador e revisor; verificar identidade; armazenar documentos privados com acesso controlado; validar evidências oficiais; implementar devoluções, retirada de consentimento e atendimento; revisar os termos e a política de privacidade com profissionais habilitados. Os PDFs são referências de produto e minutas, não validação jurídica.

## Referências técnicas

- [Hackathon Superteam Brasil](https://hackathon.superteam.com.br/)
- [Memo na Solana](https://github.com/solana-foundation/developer-content/blob/main/content/cookbook/transactions/add-memo.md)
- [SQLite no Node.js](https://nodejs.org/api/sqlite.html)
- [Imagens ilustrativas do Unsplash](https://unsplash.com/)
