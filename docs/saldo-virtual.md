# Saldo virtual e conversão demonstrativa

Em **Apoiar esta causa**, o simulador permite adicionar reais fictícios, converter para SOL/ZEC fictícios e registrar uma doação à campanha. Não exige cadastro, extensão ou carteira externa. Nenhum depósito ou compra é feito.

## Fluxo para a demonstração

1. Informar **R$ 500**, por exemplo, no único campo de valor e escolher SOL ou ZEC. O equivalente aparece automaticamente, junto com a fonte e o horário de consulta/atualização.
2. Se necessário, adicionar esse valor ao saldo fictício deste navegador. Não há cobrança.
3. Aceitar as políticas e clicar em **Doar R$ 500 fictícios em SOL/ZEC**. A API converte e registra a doação na mesma transação; não exige digitar SOL/ZEC nem repetir o valor em reais. O débito afeta apenas o valor escolhido, e a moeda calculada é doada diretamente, sem saldo cripto intermediário.
4. O recibo guarda o valor em reais, a referência usada e a quantidade fictícia doada. Aparece como **simulação, sem transferência na blockchain**. No perfil, a contribuição entra no total da moeda fictícia escolhida e mostra a referência em reais; não duplica o total doado em BRL.
5. Conferir os totais separados: simulador, contribuições confirmadas nas redes de teste e orçamento em reais.

**Usar meu saldo fictício em SOL ou ZEC** preserva a opção de converter e guardar moedas virtuais ou doar saldo convertido anteriormente. Crédito, conversão e doação continuam separados internamente para compatibilidade com operações pendentes antigas.

O valor em reais também pode preencher uma contribuição de rede. A API recalcula usando a referência exibida; a opção exige uma cotação de mercado válida e SOL/devnet ou ZEC/testnet que já estejam na carteira externa. O saldo fictício não financia a transferência nem suas taxas. Zcash mostra seu valor exato, incluindo a fração de identificação do pedido, antes do envio.

## Referência de preço

O servidor consulta [CoinGecko Simple Price](https://docs.coingecko.com/reference/simple-price), com os IDs `solana`/`zcash`, BRL e `include_last_updated_at=true`. Quando necessário, consulta [Coinbase Spot Price](https://docs.cdp.coinbase.com/coinbase-business/track-apis/prices) para SOL-BRL/ZEC-BRL, validando ativo, moeda e valor. A Coinbase não fornece horário do preço nessa resposta: a interface identifica o horário de consulta. O preço dos ativos reais é apenas referência de cálculo, sem taxas ou garantia de execução; tokens de teste não recebem valor econômico.

Consultas simultâneas compartilham uma requisição. O cache dura até cinco minutos; preços com mais de quinze minutos são recusados. Falhas ou dados inválidos resultam em **Exemplo fictício de treinamento**, com taxa didática fixa e sem horário de cotação de mercado. O fallback não é apresentado como preço atual.

Conversões e doações automáticas usam o identificador da referência exibida. Se ela mudar, não há débito: a interface carrega o cálculo novo e pede outro aceite. Cálculos usam centavos e unidades inteiras, arredondando para baixo em nove casas (SOL) ou oito casas (ZEC). `POST /api/demo-exchange/donate-brl` exige saldo BRL suficiente e registra o débito, recibo, ledger e vínculo privado com a conta atomicamente. Repetir a mesma operação recupera o recibo original mesmo após mudar a cotação.

## Persistência e separação

- Carteira virtual por sessão deste navegador, separada do login. Cookie `cow_demo_wallet`: HttpOnly, SameSite=Strict, Secure em produção, validade de oito horas. O banco guarda somente seu hash.
- Tabelas aditivas `demo_wallets`, `demo_operations` e `demo_crypto_donations` persistem no SQLite/Turso. Perder a sessão pode remover o acesso; valores fictícios não são resgatáveis.
- Operações são atômicas e idempotentes. Respostas incertas ficam em `sessionStorage` para conferir a mesma operação antes de iniciar outra.
- O saldo não pode ficar negativo. A API calcula valores e referências; não confia no saldo do navegador. Cada crédito permite R$ 1 a R$ 10.000 fictícios, até saldo BRL de R$ 100.000.
- Doação exige campanha ativa, prazo aberto, saldo suficiente e aceite vigente. Recebe evento `demo_crypto_donation` com hash do recibo; nunca recebe TXID ou confirmação na rede.
- Exportação e conferência no navegador verificam recibos fictícios. Doações são públicas; créditos e conversões ficam restritos à sessão.

## Verificação

Testes cobrem precisão, limites, referências antigas/indisponíveis, concorrência, retomada após mudança de preço, isolamento de sessões, saldo insuficiente, campanha suspensa, aceite e separação dos totais. Conferir no navegador crédito, conversão SOL/ZEC, recibo e persistência após atualizar.

As transferências confirmadas permanecem no fluxo separado de [moedas de teste](doacoes-cripto.md). Só apresente uma transferência pela blockchain como realizada depois da confirmação correspondente.
