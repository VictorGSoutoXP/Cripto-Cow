# Publicar a Cripto Cow

O Render serve o site e a API no mesmo endereço HTTPS. O Turso guarda campanhas e movimentações em um banco libSQL, preservando os dados quando o servidor reinicia.

## 1. Criar o banco

Entre no [Turso](https://turso.tech/) e escolha o plano gratuito. Crie um banco chamado `cripto-cow` com o motor **libSQL**, pelo painel ou pela CLI.

Se preferir a [CLI oficial](https://docs.turso.tech/quickstart), depois de instalar:

```bash
turso auth login
turso db create cripto-cow
turso db show cripto-cow --url
turso db tokens create cripto-cow
```

O comando de criação usa libSQL quando `--tursodb` é omitido. No Windows, a CLI oficial usa WSL. Você também pode criar o banco e obter a URL e o token pelo painel do Turso.

Guarde a URL em `TURSO_DATABASE_URL` e o token com permissão de leitura e escrita em `TURSO_AUTH_TOKEN`. Cole os valores diretamente no Render; não publique o token em mensagens, no Git ou no código do navegador. [Credenciais do banco](https://docs.turso.tech/sdk/ts/quickstart)

## 2. Publicar no Render

1. Envie o código e o arquivo `render.yaml` para o GitHub.
2. Entre no [Render](https://dashboard.render.com/), abra **New → Blueprint** e conecte o repositório.
3. Escolha a branch que contém este MVP e confirme o plano **Free**.
4. Preencha `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` quando o Render solicitar e aplique o Blueprint.

O [Blueprint](https://render.com/docs/blueprint-spec) configura Node.js 24, instala as dependências, gera o site e inicia a API. O Render fornece a porta e o endereço público. As próximas publicações automáticas aguardam os testes do GitHub passarem.

| Variável             | Configuração                                             |
| -------------------- | -------------------------------------------------------- |
| `TURSO_DATABASE_URL` | URL do banco libSQL                                      |
| `TURSO_AUTH_TOKEN`   | Token de acesso ao banco                                 |
| `ADMIN_PASSWORD`     | Gerada pelo Render                                       |
| `DEMO_MODE`          | `true`, mantém doações demonstrativas                    |
| `SEED_DEMO`          | `true`, preenche um banco vazio com campanhas de exemplo |
| `SOLANA_RPC_URL`     | `https://api.devnet.solana.com`                          |

Acesse o endereço HTTPS exibido pelo Render. Para entrar no painel da Cripto Cow, use a senha de `ADMIN_PASSWORD`, disponível na aba **Environment** do serviço. Você pode substituí-la por uma senha própria de 16 a 200 caracteres nessa mesma aba.

## 3. Conferir

Abra `/api/health` no endereço publicado e confirme que o serviço está disponível. Faça uma doação demonstrativa, atualize a página e confira a movimentação no histórico. Após reiniciar o serviço pelo Render, o histórico deve continuar no Turso.

O SQLite em `data/` continua disponível para desenvolvimento local. No Render, o banco remoto é obrigatório. O servidor não inicia sem URL, token e senha do painel. Para usar Turso localmente, copie `.env.example` para `.env` e preencha as duas variáveis do banco.

## Plano gratuito

O Render suspende o serviço após 15 minutos sem tráfego. O primeiro acesso depois disso pode levar cerca de um minuto. Arquivos locais são descartados ao reiniciar, por isso os dados ficam no Turso. O plano oferece 750 horas gratuitas por workspace ao mês e limites de tráfego e build. [Limites do Render](https://render.com/docs/free)

O Turso também tem limites de uso no plano gratuito. Confira o consumo nos dois painéis antes da apresentação. [Planos do Turso](https://turso.tech/pricing)
