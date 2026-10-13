# Carteiras e redes de teste

**Atualização de 13/10/2026:** além dos vínculos descritos abaixo, campanhas podem receber contribuições de teste em SOL e ZEC com confirmação pela API e totais separados. O pedido genérico gerado no perfil continua sem conciliação; o pedido criado em uma campanha usa o fluxo de [contribuições cripto](doacoes-cripto.md). As limitações de pagamento dos parágrafos seguintes referem-se ao pedido genérico do perfil.

O perfil aceita **uma carteira Solana** e **um endereço transparente Zcash testnet**. São carteiras externas: o participante guarda suas chaves e o servidor recebe somente endereço e assinatura de mensagem. A aplicação não cria uma carteira custodial.

## Prova de posse

1. O usuário entra na própria conta e solicita o vínculo em **Perfil e carteiras**.
2. A API gera um desafio com endereço, rede, identificador da conta, domínio, nonce, validade de cinco minutos e declaração de que a assinatura não autoriza pagamentos.
3. A carteira assina a mensagem completa. A API verifica a assinatura e associa o endereço ao perfil.
4. O desafio é consumido; outra conta não pode usá-lo. Um endereço já vinculado a outro perfil não é transferido automaticamente.

Preparar outro desafio para a mesma rede substitui o anterior. Vincular outro endereço exige nova prova. Remover um vínculo exige a senha atual. Desconectar a Phantom do navegador preserva o vínculo no perfil; trocar a conta da Phantom não altera automaticamente o vínculo. Não são guardadas chaves privadas, frases de recuperação ou assinaturas de mensagem no registro permanente do perfil.

## Solana

Quando a assinatura de mensagens não está disponível, o perfil oferece **Instalar Phantom e continuar**, usando [o download oficial](https://phantom.com/download), e **Já instalei — verificar Phantom** para conferir novamente. No site HTTPS publicado, também aparece **Abrir perfil na Phantom (celular)**, seguindo [o deeplink Browse oficial](https://docs.phantom.com/phantom-deeplinks/other-methods/browse). O link leva ao perfil dentro do app; o participante precisa entrar na conta nesse navegador e tocar em **Vincular Phantom**. Abrir a página não conclui a prova de posse. O deeplink contém somente a origem pública e a rota do perfil, sem sessão, senha, assinatura ou desafio. Atalhos para localhost não são oferecidos.

O navegador usa `signMessage` na Phantom e o servidor verifica Ed25519. Essa assinatura não cobra taxa. A preparação de uma ancoragem por um organizador exige que a carteira assinante esteja vinculada ao seu perfil. A moderação mantém o acesso de ancoragem anterior para campanhas demonstrativas existentes.

A transação de ancoragem contém somente o Memo do histórico: identificador da campanha, quantidade de eventos e hash. O RPC é validado como devnet. A taxa utiliza SOL de teste. Pedidos pendentes conservam a assinatura para retomada; somente transações confirmadas e verificadas aparecem no histórico público. Alterar ou remover o vínculo não apaga uma transação já publicada.

Referências oficiais: [Phantom: assinatura de mensagem](https://docs.phantom.com/solana/signing-a-message), [Solana: mensagens e autenticação](https://solana.com/docs/frontend/messages-and-auth).

## Zcash

**Preparar carteira Zcash testnet** abre [o guia oficial da rede de teste](https://zcash.readthedocs.io/en/latest/rtd_pages/testnet_guide.html) antes de gerar o desafio. Depois de **Preparar vínculo**, a tela mostra imediatamente a próxima etapa, endereço, validade e link para [as instruções oficiais de assinatura](https://zcash.github.io/rpc/signmessage.html). A mensagem é assinada na carteira; a assinatura Base64 volta ao campo do site para confirmação. Esse fluxo exige uma carteira com endereço transparente testnet e assinatura de mensagens; abrir o guia ou um pedido ZIP 321 não comprova posse do endereço.

Um comando copiável para `zcash-cli -testnet signmessage` fica disponível em detalhes, identificado para Bash (Linux/macOS/WSL). Os argumentos ficam entre aspas simples com escape de apóstrofos para preservar exatamente a mensagem multilinha e evitar interpolação. O site não executa o comando nem solicita chaves. É necessário ter o nó/carteira em testnet prontos e possuir a chave do endereço informado. `tests/wallet-links.test.js` verifica URLs sem credenciais, recusa de origens locais e preservação literal do comando.

O vínculo usa **endereços P2PKH transparentes da testnet iniciados por `tm`**, com validação Base58Check. A aplicação verifica localmente assinaturas compactas secp256k1 compatíveis com `zcash-cli -testnet signmessage`. A carteira deve oferecer essa função; não há uma conexão automática com a Phantom para Zcash.

Na interface, copie a mensagem preparada, assine-a com a carteira correspondente e cole a assinatura em Base64. Os comandos oficiais podem ser consultados em [signmessage](https://zcash.github.io/rpc/signmessage.html) e [verifymessage](https://zcash.github.io/rpc/verifymessage.html). O formato da assinatura segue [o código oficial de verificação](https://github.com/zcash/zcash/blob/master/src/rpc/misc.cpp), com o prefixo `Zcash Signed Message`.

Após o vínculo, o perfil gera um **pedido de teste ZIP 321** para seu próprio endereço, com valor em ZEC de teste e até oito casas decimais. Esse pedido pode ser copiado ou aberto em uma carteira compatível. Não é uma confirmação de transferência, não altera saldo de campanha e não entra no ledger de doações em reais. O fluxo não permite endereços mainnet, endereços de script, Sapling ou Unified Addresses; um endereço transparente não oferece sigilo de transações.

Referências oficiais: [ZIP 321: pedidos por URI](https://zips.z.cash/zip-0321), [prefixos de rede no Zcash](https://github.com/zcash/zcash/blob/master/src/chainparams.cpp). Verificação secp256k1 pela biblioteca [noble-curves](https://github.com/paulmillr/noble-curves), declarada e fixada nas dependências do projeto.

## Decisão de escopo

Solana e Zcash são integrações independentes do MVP. Não existe ponte, conversão de ativos, custódia, recebimento de dinheiro real ou conciliação de pagamentos cripto com o saldo demonstrativo em BRL. A Solana fornece ancoragem do histórico; Zcash fornece prova de posse de endereço de teste e pedidos padronizados de teste. Pagamentos reais e suporte a endereços protegidos precisam de um escopo próprio.

Os testes cobrem assinaturas inválidas, desafio de outra conta, expiração, reutilização, carteira pertencente a outro perfil, substituição, remoção com senha, mensagens Zcash comprimidas e não comprimidas e precisão dos pedidos. Uma assinatura comprovada não é verificação de identidade nem comprova o saldo de uma carteira.
