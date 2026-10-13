# Contribuições SOL e ZEC em redes de teste

Em **Apoiar esta causa**, o participante escolhe simular em R$, enviar SOL na Solana devnet ou enviar ZEC em endereço transparente da Zcash testnet. A confirmação consultada pela API gera um recibo e um evento `crypto_donation` no histórico verificável. O site nunca envia moedas de mainnet.

## Destinatários

O organizador vincula e verifica suas carteiras em **Perfil e carteiras** e seleciona quais usar em **Meu painel → Receber contribuições de teste**. A API permite configurar somente endereços vinculados à conta responsável pela campanha. Alterações valem para novos pedidos; pedidos anteriores conservam o destinatário original.

As três campanhas fictícias originais usam os endereços demonstrativos públicos em `shared/demo-payment-receivers.json`. São exclusivamente para tokens de teste; as chaves de teste ficam fora do repositório, no ambiente local de preparação. Não são carteiras de custódia de participantes. Campanhas novas não recebem automaticamente esses endereços.

## Fluxo Solana

1. Escolher SOL, conferir devnet, valor e destinatário; aceitar as políticas vigentes.
2. Conectar a Phantom para preparar o pedido; depois autorizar uma transação com transferência nativa de SOL e Memo único.
3. O navegador guarda a assinatura antes do envio. A API guarda o mesmo identificador antes de transmitir, de modo que a recuperação não autorize outro pagamento.
4. A API aceita somente as duas instruções esperadas, assinatura válida, pagador, destinatário, valor e blockhash correspondentes. Confirma o resultado em RPC devnet antes de creditar o recibo.
5. Consultar o recibo e o Solana Explorer. Se estiver pendente, usar **Conferir confirmação**, sem pagar novamente. Transação expirada sem confirmação permite preparar outra contribuição.

Não é necessário vincular a carteira doadora ao perfil; esse vínculo continua obrigatório para configurar um destinatário próprio ou ancorar como organizador.

## Fluxo Zcash

1. Escolher ZEC, conferir testnet e destinatário `tm…`.
2. Preparar um pedido ZIP 321. O valor final inclui uma fração aleatória inferior a 0,0001 ZEC de teste, exibida antes do envio. O valor exato identifica o pedido sem depender de memo protegido. Não é taxa da plataforma.
3. Abrir/copiar o pedido em uma carteira compatível com Zcash testnet e pagar exatamente o valor informado.
4. Colar o TXID e conferir a confirmação. O servidor usa lightwalletd com TLS, exige `chainName = test`, transação posterior à preparação, inclusão no bloco da cadeia consultada e exatamente uma saída P2PKH com destinatário e valor esperados.
5. A API decodifica o prefixo transparente V4/V5/V6, consultando o nó para as partes protegidas. Não valida todas as regras de consenso como um nó completo nem oferece doações protegidas. A consulta permite pagamentos de uma origem protegida para a saída transparente, mas o destinatário e o valor ficam públicos.

Um TXID pode ser usado somente uma vez em todo o site por rede. Pagamentos divididos, com múltiplos pedidos na mesma transação, para outro destinatário ou com valor diferente não são conciliados automaticamente. Moedas não reconhecidas permanecem no endereço receptor; a plataforma não pode reverter a transferência.

## Contabilidade e segurança

- SOL e ZEC têm totais separados em unidades inteiras, sem conversão para BRL e sem cotação inventada. Não aumentam o saldo disponível para despesas demonstrativas em reais.
- A transferência vai diretamente ao destinatário. Aprovação de evidência, regra da sobra e liberação em BRL não retêm, liberam ou devolvem os tokens. Não existe escrow ou contrato de pagamentos nesta entrega.
- Pedidos e recibos persistem no Turso. O banco guarda somente o hash do código secreto de acesso ao pedido. O código e o recibo pendente ficam em `sessionStorage`; não os compartilhe ou remova antes de confirmar. Fechar a sessão do navegador pode remover o acesso local ao pedido; mantenha o TXID.
- Confirmação e inclusão no ledger usam a mesma transação de banco, com restrição única por rede/TXID. Erros e confirmações repetidas não duplicam o histórico.
- O `evidenceHash` do evento compromete rede, valor, destinatário, transação e dados do recibo. A exportação do ledger inclui os recibos para conferência independente.
- Confirmação é uma fotografia da cadeia consultada, com pelo menos um bloco para Zcash e compromisso `confirmed` para Solana. Não há monitoramento contínuo de reorganizações. RPC e lightwalletd são fontes confiadas, não provas independentes de consenso.
- O fluxo cripto publica endereço, moeda, valor, rede e transação. Não inclui nome do doador. “Sem nome” não equivale a privacidade de blockchain.

## Configuração e verificação

`SOLANA_RPC_URL` continua apontando para devnet. `ZCASH_LIGHTWALLETD` usa `testnet.zec.rocks:443` por padrão e aceita outro servidor TLS `host:porta`; a identificação de testnet é sempre conferida. Nenhuma chave privada ou seed é enviada ao servidor.

`npm run verify:payment-networks` consulta dados reais das duas redes sem assinar ou pagar. Esse comando confere uma transação existente da Zcash e não a apresenta como contribuição do projeto. Os testes automatizados usam fixtures controladas para sucesso, pendência, expiração, transação incorreta, isolamento e repetição.

Na preparação desta entrega, as consultas reais passaram, mas o airdrop Solana retornou erro interno. Ainda é necessário realizar contribuições completas com carteiras financiadas com moedas de teste e conferir os recibos nas duas redes antes de afirmar que essa demonstração foi gravada ou comprovada.

Referências: [transações Solana](https://solana.com/docs/core/transactions), [ZIP 321](https://zips.z.cash/zip-0321), [lightwallet protocol](https://github.com/zcash/lightwallet-protocol), [ZIP 225](https://zips.z.cash/zip-0225), [ZIP 229](https://zips.z.cash/zip-0229).
