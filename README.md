# Cripto Cow

[Abrir o site](https://cripto-cow.onrender.com) · [Painel](https://cripto-cow.onrender.com/#/painel) · [Termos e políticas](https://cripto-cow.onrender.com/#/politicas)

MVP de doações com orçamento aberto, prestação de contas e ancoragem de hashes na Solana devnet. Campanhas, doações e liberações são demonstrativas; nenhum dinheiro real é movimentado.

React, TypeScript e Vite cuidam da interface. A API usa Node.js 24 e Express, com SQLite local ou Turso/libSQL. Os valores ficam em centavos e cada evento financeiro recebe um hash SHA-256 encadeado ao anterior.

## Rodar

Node.js 24.

```bash
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173`. Para configurar o ambiente, copie `.env.example` para `.env`. O painel local funciona sem senha. No site publicado, use `ADMIN_PASSWORD`, disponível em **Environment** no Render.

```bash
npm run check
npm run build
npm start
```

O build é servido em `http://127.0.0.1:3001`.

## Estrutura

- `src/pages/`: campanhas, transparência e painel em React/TypeScript.
- `src/components/` e `src/lib/`: formulários, interface, API e carteira.
- `server/`: API Express, SQLite local ou Turso/libSQL e ledger com SHA-256.
- `tests/`: integridade, saldo, revisão, acesso e ancoragem.
- `scripts/`: verificação independente do histórico exportado.
- `shared/`: textos publicados de termos, privacidade e transparência.

O banco local fica em `data/`, fora do Git. Valores são armazenados em centavos. Pedidos reservam saldo; a aprovação registra a saída numa transação atômica. O ledger aceita apenas novos registros.

A demonstração tem valores variados e doações anônimas ou com nomes fictícios de pessoas e empresas. A atualização acrescenta oito exemplos por campanha original de forma idempotente, preservando os registros existentes. Nome e tipo são opcionais, públicos quando escolhidos e ficam fora dos hashes financeiros, sem verificação de identidade.

## Hospedagem

Site e API estão publicados no Render Free, com dados persistentes no Turso. `/api/health` verifica a conexão com o banco. O primeiro acesso após inatividade pode demorar enquanto o Render reativa o serviço. Configuração e manutenção em [docs/deploy.md](docs/deploy.md).

## Contribuir

Crie uma branch a partir de `main`, mantenha `.env` e `data/` fora do Git e abra um pull request com o que mudou e como foi conferido. Antes de enviar, rode `npm run check` e `npm run format:check`. Mudanças aprovadas em `main` são publicadas depois que o CI passa.

## Termos e políticas

Os textos ficam em `shared/legal-documents.json` e são exibidos no site, sem PDF. O aceite das regras atuais guarda data, versão, hash e regras da campanha. As minutas do documento do time ficam identificadas como textos para a operação futura. Atualizações e pontos pendentes estão em [docs/politicas.md](docs/politicas.md).

## Solana

No painel, use uma Phantom configurada para devnet com [SOL de teste](https://faucet.solana.com/). “Registrar hash na Solana” envia um Memo com o identificador da campanha e o hash do histórico. A API confere transação, assinatura e conteúdo antes de publicar o link do Explorer.

Se a conexão cair ou a confirmação demorar, clique novamente para retomar a mesma assinatura. Transações expiradas ou recusadas encerram a pendência e permitem preparar outra tentativa.

Para conferir um histórico baixado:

```bash
node scripts/verify-ledger.js caminho-do-ledger.json
```

O roteiro da demonstração, o resumo em inglês e a lista para submissão estão em [docs/hackathon.md](docs/hackathon.md). Uma ancoragem só conta como realizada depois de confirmada e publicada com seu link no Explorer.

Pix, cartão, custódia, KYC, validação fiscal, devoluções e documentos privados ainda precisam de integração. Os níveis A/B não são simulados como verificados. Detalhes em [docs/mvp.md](docs/mvp.md).
