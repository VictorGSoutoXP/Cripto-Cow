import { Store } from './store.js';
import { createApp } from './app.js';
import { readConfig } from './config.js';

const config = readConfig();
const store = await Store.open(config.database);
const app = createApp(store, config);
const server = app.listen(config.port, config.host, () => {
  console.log(
    `Cripto Cow disponível na porta ${config.port}. Banco: ${config.database.url ? 'Turso' : 'SQLite local'}.`,
  );
});

function shutdown() {
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
