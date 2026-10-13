# Retomada do projeto

**Atualização de 13/10/2026:** cadastro, login e design foram mesclados e publicados pelo PR #7. A evolução seguinte acrescenta escolha SOL/devnet e ZEC/testnet, destinatários por campanha, confirmação pela API e recibos cripto em totais separados. Leia [contribuições cripto](doacoes-cripto.md) para configuração, verificações realizadas e a transferência de teste ainda necessária para o vídeo. Os itens anteriores abaixo preservam o registro da entrega inicial.

Registro de 12/10/2026. O usuário autorizou a continuidade sem novas perguntas; as decisões abaixo foram adotadas para concluir a implementação do MVP.

## O que está pronto no código

- Nova identidade institucional em azul e branco, com logotipo próprio e página inicial reorganizada.
- Cadastro e login individuais, senhas com scrypt, sessões no banco e painel restrito às campanhas do participante.
- Recuperação por código privado, edição do nome, troca da senha, geração de outro código e encerramento do cadastro.
- Moderação separada para aprovações, suspensão de campanhas e análise de denúncias.
- Carteiras por perfil com assinatura de desafio de cinco minutos, uso único e bloqueio de apropriação de vínculos.
- Solana/Phantom: prova Ed25519 e exigência do vínculo antes de preparar uma ancoragem individual.
- Zcash: prova de posse de endereço transparente testnet por assinatura secp256k1 e pedido de teste ZIP 321.
- Políticas `mvp-1.4`, documentação e migração aditiva de tabelas. Campanhas, aceites e ledger existentes são preservados.

## Decisões adotadas

| Tema                     | Escolha desta entrega                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Marca                    | Manter o nome existente Cripto Cow e um símbolo próprio de vaca                                      |
| Referência institucional | Azul, branco, hierarquia editorial e informação organizada; referência visual UNESCO                 |
| Lobby                    | Página inicial pública; painel individual com navegação de perfil                                    |
| Identidade               | E-mail e senha; a posse do e-mail não é comprovada nem usada para atribuir uma identidade verificada |
| Recuperação              | Código privado entregue uma vez, sem integração de envio de e-mail                                   |
| Carteiras                | Externas e sem custódia, uma por rede, com prova de posse                                            |
| Redes                    | Solana devnet e Zcash testnet como integrações independentes                                         |
| Dinheiro                 | Manter doações e liberações simuladas; pedidos Zcash não geram crédito no ledger                     |

## Verificações

A suíte final local contém 90 testes. Build, formatação e auditoria devem permanecer aprovados no CI da branch antes da publicação.

Build e testes do projeto verificam autenticação, recuperação, isolamento entre usuários, privacidade do perfil, assinatura de carteiras, expiração e repetição de desafios, permissões de moderação, integridade financeira e libSQL HTTP. A auditoria encontrou uma falha nas dependências de desenvolvimento `concurrently/shell-quote`; as versões compatíveis foram corrigidas e a auditoria passou.

No navegador local foram conferidos página inicial em desktop/celular, cadastro e apresentação do código privado, painel, navegação do perfil, aviso quando a Phantom está ausente, vínculo Zcash com assinatura de um endereço de teste e geração de URI ZIP 321. Os dados e a chave utilizados nessa conferência são fictícios e ficam fora do ambiente publicado. As prévias de revisão ficam em `artifacts/`, fora do Git.

## Pendências operacionais para o retorno

1. **Publicação:** revisar o conjunto e publicar a branch aprovada em `main`; o Render acompanha essa branch após o CI. Conferir cadastro, recuperação, sessões e isolamento no ambiente hospedado.
2. **Demonstração Solana:** obter SOL de teste para uma carteira e registrar uma ancoragem confirmada no Explorer. A tentativa automática desta entrega consultou a devnet correta e preparou a ancoragem, mas o airdrop retornou erro interno; nenhuma ancoragem foi apresentada como confirmada. `npm run verify:devnet` permite repetir o teste com carteira efêmera e banco temporário quando o faucet estiver disponível.
3. **Preferência visual:** revisar o símbolo da vaca e a interpretação institucional. A mensagem incompleta sobre o logotipo não foi utilizada como especificação adicional.
4. **Lobby após o login:** avaliar posteriormente se precisa de uma área própria além da página inicial e do painel.
5. **Zcash futuro:** definir se a próxima fase exigirá endereços protegidos, leitura de notas com chave de visualização e conciliação. O fluxo entregue usa endereço transparente de teste e não deve ser apresentado como doação protegida confirmada.
6. **Operação futura:** definir envio/verificação de e-mail, canal de atendimento, retenção, identidades individuais da equipe de moderação e os requisitos de pagamentos reais. Nenhum desses pontos é tratado como já implantado.

## Como conferir ao retornar

`npm ci`, `npm run check`, `npm run format:check` e `npm run dev`. Em **Meu painel**, crie uma conta e guarde o código privado; em **Perfil e carteiras**, confira os vínculos. Leia [contas](contas.md), [carteiras e redes](carteiras-redes.md), [design](design.md) e [checklist](checklist-evolucao.md).
