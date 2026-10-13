# Saldo virtual e conversão demonstrativa

Em **Apoiar esta causa**, o simulador permite adicionar reais fictícios, converter para SOL/ZEC fictícios e registrar uma doação à campanha. Não exige cadastro, extensão ou carteira externa. Nenhum depósito ou compra é feito.

## Fluxo para a demonstração

1. Adicionar **R$ 50 fictícios**, por exemplo. O crédito afeta somente o saldo virtual deste navegador.
2. Escolher SOL ou ZEC e o valor em reais a converter. A tela mostra o equivalente, a fonte e o horário antes de confirmar.
3. Converter: reais são debitados e unidades fictícias da moeda escolhida são creditadas atomicamente.
4. Aceitar as políticas e doar o saldo fictício à campanha. O recibo aparece como **simulação, sem transferência na blockchain**.
5. Conferir os totais separados: simulador, contribuições confirmadas nas redes de teste e orçamento em reais.

O equivalente também pode preencher uma contribuição de rede. Essa opção exige SOL/devnet ou ZEC/testnet que já estejam na carteira externa; o saldo fictício não financia a transferência nem suas taxas. Zcash mostra seu valor exato, incluindo a fração de identificação do pedido, antes do envio.

## Referência de preço

O servidor consulta [CoinGecko Simple Price](https://docs.coingecko.com/reference/simple-price), com os IDs `solana`/`zcash`, BRL e `include_last_updated_at=true`. O preço dos ativos reais é apenas referência de cálculo; tokens de teste não recebem valor econômico.

Consultas simultâneas compartilham uma requisição. O cache dura até cinco minutos; preços com mais de quinze minutos são recusados. Falhas ou dados inválidos resultam em **Exemplo fictício de treinamento**, com taxa didática fixa e sem horário de cotação de mercado. O fallback não é apresentado como preço atual.

Conversões usam o identificador da referência exibida. Se ela mudar, não há débito: a interface carrega o cálculo novo e pede outra confirmação. Cálculos usam centavos e unidades inteiras, arredondando para baixo em nove casas (SOL) ou oito casas (ZEC).

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
