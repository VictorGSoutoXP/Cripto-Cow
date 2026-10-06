# Cripto Cow

MVP de doações com orçamento aberto, prestação de contas e ancoragem de hashes na Solana devnet. Campanhas, doações e liberações são demonstrativas; nenhum dinheiro real é movimentado.

## Rodar

Node.js 24.

```bash
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173`. Para configurar o ambiente, copie `.env.example` para `.env`. O painel local funciona sem senha; acesso remoto exige `ADMIN_PASSWORD`.

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

O banco local fica em `data/`, fora do Git. Valores são armazenados em centavos. Pedidos reservam saldo; a aprovação registra a saída numa transação atômica. O ledger aceita apenas novos registros.

## Hospedagem

O `render.yaml` prepara site e API para o Render gratuito, com banco persistente no Turso. Conecte o repositório e configure as credenciais seguindo [docs/deploy.md](docs/deploy.md).

## Solana

No painel, use uma Phantom configurada para devnet com [SOL de teste](https://faucet.solana.com/). “Registrar hash na Solana” envia um Memo com o identificador da campanha e o hash do histórico. A API confere transação, assinatura e conteúdo antes de publicar o link do Explorer.

Para conferir um histórico baixado:

```bash
node scripts/verify-ledger.js caminho-do-ledger.json
```

Pix, cartão, custódia, KYC, validação fiscal, devoluções e documentos privados ainda precisam de integração. Os níveis A/B não são simulados como verificados. Detalhes em [docs/mvp.md](docs/mvp.md).
