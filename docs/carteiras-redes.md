# Carteiras e redes de teste

O perfil aceita **uma carteira Solana** e **um endereço transparente Zcash testnet**. São carteiras externas: o participante guarda suas chaves e o servidor recebe somente endereço e assinatura de mensagem. A aplicação não cria uma carteira custodial.

## Prova de posse

1. O usuário entra na própria conta e solicita o vínculo em **Perfil e carteiras**.
2. A API gera um desafio com endereço, rede, identificador da conta, domínio, nonce, validade de cinco minutos e declaração de que a assinatura não autoriza pagamentos.
3. A carteira assina a mensagem completa. A API verifica a assinatura e associa o endereço ao perfil.
4. O desafio é consumido; outra conta não pode usá-lo. Um endereço já vinculado a outro perfil não é transferido automaticamente.

Preparar outro desafio para a mesma rede substitui o anterior. Vincular outro endereço exige nova prova. Remover um vínculo exige a senha atual. Desconectar a Phantom do navegador preserva o vínculo no perfil; trocar a conta da Phantom não altera automaticamente o vínculo. Não são guardadas chaves privadas, frases de recuperação ou assinaturas de mensagem no registro permanente do perfil.

## Solana

O navegador usa `signMessage` na Phantom e o servidor verifica Ed25519. Essa assinatura não cobra taxa. A preparação de uma ancoragem por um organizador exige que a carteira assinante esteja vinculada ao seu perfil. A moderação mantém o acesso de ancoragem anterior para campanhas demonstrativas existentes.

A transação de ancoragem contém somente o Memo do histórico: identificador da campanha, quantidade de eventos e hash. O RPC é validado como devnet. A taxa utiliza SOL de teste. Pedidos pendentes conservam a assinatura para retomada; somente transações confirmadas e verificadas aparecem no histórico público. Alterar ou remover o vínculo não apaga uma transação já publicada.

Referências oficiais: [Phantom: assinatura de mensagem](https://docs.phantom.com/solana/signing-a-message), [Solana: mensagens e autenticação](https://solana.com/docs/frontend/messages-and-auth).

## Zcash

O vínculo usa **endereços P2PKH transparentes da testnet iniciados por `tm`**, com validação Base58Check. A aplicação verifica localmente assinaturas compactas secp256k1 compatíveis com `zcash-cli -testnet signmessage`. A carteira deve oferecer essa função; não há uma conexão automática com a Phantom para Zcash.

Na interface, copie a mensagem preparada, assine-a com a carteira correspondente e cole a assinatura em Base64. Os comandos oficiais podem ser consultados em [signmessage](https://zcash.github.io/rpc/signmessage.html) e [verifymessage](https://zcash.github.io/rpc/verifymessage.html). O formato da assinatura segue [o código oficial de verificação](https://github.com/zcash/zcash/blob/master/src/rpc/misc.cpp), com o prefixo `Zcash Signed Message`.

Após o vínculo, o perfil gera um **pedido de teste ZIP 321** para seu próprio endereço, com valor em ZEC de teste e até oito casas decimais. Esse pedido pode ser copiado ou aberto em uma carteira compatível. Não é uma confirmação de transferência, não altera saldo de campanha e não entra no ledger de doações em reais. O fluxo não permite endereços mainnet, endereços de script, Sapling ou Unified Addresses; um endereço transparente não oferece sigilo de transações.

Referências oficiais: [ZIP 321: pedidos por URI](https://zips.z.cash/zip-0321), [prefixos de rede no Zcash](https://github.com/zcash/zcash/blob/master/src/chainparams.cpp). Verificação secp256k1 pela biblioteca [noble-curves](https://github.com/paulmillr/noble-curves), declarada e fixada nas dependências do projeto.

## Decisão de escopo

Solana e Zcash são integrações independentes do MVP. Não existe ponte, conversão de ativos, custódia, recebimento de dinheiro real ou conciliação de pagamentos cripto com o saldo demonstrativo em BRL. A Solana fornece ancoragem do histórico; Zcash fornece prova de posse de endereço de teste e pedidos padronizados de teste. Pagamentos reais e suporte a endereços protegidos precisam de um escopo próprio.

Os testes cobrem assinaturas inválidas, desafio de outra conta, expiração, reutilização, carteira pertencente a outro perfil, substituição, remoção com senha, mensagens Zcash comprimidas e não comprimidas e precisão dos pedidos. Uma assinatura comprovada não é verificação de identidade nem comprova o saldo de uma carteira.
