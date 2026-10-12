# Checklist de evolução da Cripto Cow

Lista de Victor Souto de 11/10/2026. Implementação local concluída em 12/10/2026 na branch `codex/evolucao-perfis-carteiras`. Validação e pendências operacionais estão em [retomada](retomada.md).

## Entregas

| Pedido                              | Entrega implementada                                                                                                          | Situação                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Design com referência institucional | Azul e branco, tipografia editorial, símbolo vetorial próprio da vaca e favicon                                               | Implementado; validar a preferência visual ao retornar                                        |
| Lobby                               | Página inicial com proposta, campanha em destaque, indicadores demonstrativos, etapas, busca, filtros e entrada para cadastro | Implementado em desktop e celular                                                             |
| Login                               | Cadastro individual, e-mail e senha, sessão persistente, saída e recuperação por código privado                               | Implementado e testado                                                                        |
| Carteira por perfil                 | Uma carteira por rede, assinatura de desafio, prazo, uso único, substituição e remoção com senha                              | Implementado e testado                                                                        |
| Solana + Zcash                      | Solana devnet para ancoragem; Zcash testnet para prova de posse e pedido ZIP 321                                              | Implementado no escopo demonstrativo; transação Solana real ainda sem evidência nesta entrega |
| Documentação                        | Execução, acesso, permissões, design, redes, políticas e pontos de retomada                                                   | Atualizada                                                                                    |

## 1. Acesso e perfis

- [x] Cadastro com e-mail, nome de exibição, senha e aceite versionado.
- [x] Hash scrypt da senha; cookie HttpOnly, SameSite e Secure em produção.
- [x] Sessões individuais no banco, validade de oito horas e revogação na saída.
- [x] Recuperação com código privado, rotação e revogação das sessões anteriores.
- [x] Edição do nome, troca de senha, novo código e encerramento da conta.
- [x] Separação entre organizador individual e moderação.
- [x] Isolamento das campanhas e bloqueio de aprovação de despesas pelo organizador.
- [x] Preservação do ledger e de campanhas existentes.
- [x] Credenciais incorretas, indisponibilidade e sessão encerrada tratados separadamente.
- [ ] Publicar e conferir o ambiente hospedado após revisão.

O e-mail não é verificado por mensagem e não há recuperação por e-mail. O cadastro entrega um código privado para recuperação. Campanhas e evidências continuam fictícias. [Detalhes de contas](contas.md).

## 2. Carteiras

- [x] Carteiras externas, sem armazenar chaves privadas.
- [x] Uma carteira Solana e um endereço Zcash transparente testnet por perfil.
- [x] Desafio vinculado a conta, domínio, rede e endereço, com nonce e validade de cinco minutos.
- [x] Verificação Ed25519 para Solana e secp256k1 para mensagens Zcash.
- [x] Bloqueio de repetição, assinatura inválida e vínculo pertencente a outra conta.
- [x] Substituição mediante nova prova e remoção mediante senha.
- [x] Distinção entre Phantom conectada e endereço persistido no perfil.
- [x] Troca de conta na Phantom não altera o vínculo automaticamente.
- [x] Preparação de ancoragem individual exige o endereço vinculado.

[Carteiras e redes](carteiras-redes.md) descreve os formatos suportados e seus limites.

## 3. Design e lobby

- [x] Direção institucional em azul e branco, identidade própria Cripto Cow.
- [x] Logotipo vetorial da vaca, assinatura da marca e favicon consistentes.
- [x] Página inicial reorganizada em proposta, iniciativas e informação pública.
- [x] Busca, filtro acessível e resposta para lista vazia.
- [x] Navegação entre campanhas e perfil/carteiras.
- [x] Conferência visual em desktop e celular, foco visível e movimento reduzido.

O lobby foi interpretado como a página inicial pública. A revisão da preferência visual e uma eventual área de lobby após o login ficam registradas para o retorno, em [design](design.md).

## 4. Redes

- [x] Preservar o fluxo Solana de Memo, assinatura, envio, confirmação e retomada.
- [x] Validar RPC como devnet e exigir carteira vinculada para organizadores individuais.
- [x] Acrescentar script de verificação real com carteira efêmera e banco temporário.
- [x] Implementar Zcash com validação de endereço testnet, prova de posse e URI ZIP 321.
- [x] Testar assinaturas comprimidas/não comprimidas, mensagens alteradas, valores inválidos e precisão de oito casas.
- [x] Indicar no produto que pedidos Zcash não confirmam pagamentos nem creditam campanhas.
- [ ] Registrar uma ancoragem Solana real confirmada: o airdrop da devnet retornou erro interno na tentativa desta entrega.

Solana e Zcash são integrações independentes. Não foram acrescentados ponte, conversão, custódia, recebimento em mainnet ou conciliação com o saldo demonstrativo em BRL. O suporte Zcash atual é transparente, sem sigilo de transações; endereços protegidos exigem outra implementação.

## 5. Conferência e documentação

- [x] README e documentos de acesso, design, carteiras e hospedagem atualizados.
- [x] Políticas atuais em `mvp-1.4`, preservando aceites históricos.
- [x] Documentar hipóteses adotadas e os limites do MVP.
- [x] Testes de cadastro, recuperação, permissões, carteira, ledger e libSQL.
- [x] Build, formatação e auditoria de dependências.
- [x] Cadastro e geração de pedido Zcash conferidos no navegador com dados locais fictícios.
- [ ] Revisão e publicação do conjunto no ambiente remoto.

Os pontos restantes estão concentrados em [retomada](retomada.md); não são apresentados como funcionalidades prontas ou provas já obtidas.
