# Cadastro, login e acesso

O painel oferece **Entrar** e **Criar conta**. O cadastro pede nome de exibição, e-mail, senha de 12 a 128 caracteres, confirmação da senha e aceite das políticas atuais. Ao concluir, o participante entra automaticamente no próprio painel. O e-mail é normalizado com remoção de espaços nas pontas e conversão para letras minúsculas.

O cadastro fornece um código privado de recuperação, exibido uma vez. **Esqueci minha senha** permite definir outra senha com e-mail e esse código; a recuperação substitui o código anterior e encerra as sessões anteriores. **Perfil e carteiras** permite editar o nome, alterar a senha, gerar outro código, vincular carteiras e encerrar a conta. O e-mail não é confirmado por mensagem nem pode ser alterado pela interface; não constitui comprovação de identidade. As campanhas, doações e evidências continuam demonstrativas.

## Permissões

| Ação                                                  | Participante cadastrado        | Moderação                                                    |
| ----------------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| Consultar campanhas publicadas e doar na demonstração | Sim, inclusive sem login       | Sim                                                          |
| Consultar rascunhos no painel                         | Somente os próprios            | Todos                                                        |
| Criar campanha                                        | Sim                            | Sim                                                          |
| Publicar rascunho                                     | Somente o próprio              | Qualquer rascunho                                            |
| Solicitar despesas e ancorar o histórico              | Somente nas próprias campanhas | Qualquer campanha, respeitando o estado e as regras do fluxo |
| Aprovar ou recusar despesas                           | Não                            | Sim                                                          |
| Suspender ou retomar campanhas publicadas             | Não                            | Sim                                                          |
| Consultar e analisar denúncias privadas               | Não                            | Sim                                                          |

Todo cadastro recebe a função de organizador; o formulário não permite escolher uma função administrativa. A API confere as permissões em cada operação. O nome de perfil, o e-mail e o identificador do responsável não são publicados junto da campanha ou no ledger pelo cadastro. Os campos públicos da campanha e das doações continuam conforme as escolhas feitas nos respectivos formulários.

Campanhas anteriores ao cadastro individual continuam sob acesso da moderação. Elas não são atribuídas automaticamente a um participante. A instalação cria as tabelas novas sem reescrever campanhas, aceites ou eventos financeiros existentes.

Encerrar uma conta exige a senha atual e confirmação na interface. Remove o cadastro, o código de recuperação, as sessões e os vínculos de carteira, preservando campanhas, seus aceites e o ledger. A moderação acompanha as campanhas preservadas. Um novo cadastro com o mesmo e-mail recebe outro identificador e não herda essas campanhas.

## Sessões e armazenamento

- As contas ficam em `users`, com hash scrypt da senha, salt aleatório, dados mínimos de perfil e registro do aceite.
- As sessões individuais ficam em `user_sessions`. O banco guarda somente o hash do token aleatório, o identificador da conta e sua validade.
- O código de recuperação tem 192 bits aleatórios. `user_recovery` guarda somente seu hash; gerar outro código ou recuperar a conta invalida o anterior.
- O cookie `elo_session` usa HttpOnly, SameSite=Strict e Secure em produção, com validade de oito horas.
- A sessão individual pode continuar após reiniciar a API, dentro de sua validade. Sair revoga o token no banco. Entrar novamente no mesmo navegador substitui a sessão anterior.
- O acesso da moderação usa `ADMIN_PASSWORD`; no loopback demonstrativo sem senha configurada, é possível deixar o campo vazio. Suas sessões continuam em memória e terminam também quando o servidor reinicia.
- Cadastro, entrada de participante e entrada da moderação compartilham um limite de dez tentativas por IP por minuto, além do limite geral de alterações. O servidor mantém a proteção de origem.

## API

| Método e rota               | Função                                                  |
| --------------------------- | ------------------------------------------------------- |
| `POST /api/auth/register`   | Criar conta, registrar aceite e iniciar sessão          |
| `POST /api/auth/session`    | Entrar com e-mail e senha                               |
| `DELETE /api/auth/session`  | Sair e revogar a sessão atual                           |
| `GET /api/admin`            | Carregar perfil, campanhas e dados permitidos do painel |
| `POST /api/admin/session`   | Entrar na moderação com a senha administrativa          |
| `DELETE /api/admin/session` | Rota compatível de saída                                |

Rotas do perfil: `GET/PATCH/DELETE /api/profile`, `POST /api/profile/password`, `POST /api/profile/recovery`; recuperação sem sessão em `POST /api/auth/recovery`. Operações sensíveis exigem senha atual ou o código privado e estão sujeitas ao limite de tentativas. [Carteiras e redes](carteiras-redes.md) descreve os desafios de assinatura e pedidos de teste.

O cadastro exige `accepted`, `termsVersion` e `termsHash` do aceite `account` retornado por `/api/legal`. Aceites ausentes ou desatualizados não criam a conta. Senhas e tokens nunca são retornados no JSON do perfil. Uma sessão ausente ou expirada retorna `401` com `SESSION_REQUIRED`; tentativa de operar recursos alheios ou moderar sem permissão retorna `403`.

## Conferência da entrega

Os testes em `tests/accounts.test.js` verificam cadastro, aceite, senhas, duplicidade de e-mail, rotação e revogação de sessão, persistência após reiniciar, expiração, separação entre usuários, acesso da moderação, proteção de origem e limite de tentativas. O cadastro, a atualização da página, a saída e a entrada devem ser conferidos também no navegador antes de publicar.
