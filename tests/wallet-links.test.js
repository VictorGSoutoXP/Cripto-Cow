import test from 'node:test';
import assert from 'node:assert/strict';
import { phantomBrowseUrl, zcashSigningCommand } from '../src/lib/wallet-links.ts';

test('link da Phantom abre somente o perfil público, sem propagar credenciais, query ou desafio', () => {
  const link = new URL(
    phantomBrowseUrl('https://cripto-cow.onrender.com/private?token=secret#challenge'),
  );
  assert.equal(link.origin, 'https://phantom.com');
  assert.equal(
    decodeURIComponent(link.pathname.slice('/ul/browse/'.length)),
    'https://cripto-cow.onrender.com/#/perfil',
  );
  assert.equal(link.searchParams.get('ref'), 'https://cripto-cow.onrender.com');
  assert.equal(link.href.includes('secret'), false);
  assert.equal(link.href.includes('challenge'), false);
});

test('atalho móvel recusa origens locais, sem HTTPS ou com credenciais na URL', () => {
  for (const origin of [
    'http://cripto-cow.onrender.com',
    'http://127.0.0.1:3002',
    'https://localhost',
    'https://dev.localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://user:password@example.test',
    'javascript:alert(1)',
    'not a url',
  ])
    assert.equal(phantomBrowseUrl(origin), null);
});

test('comando Zcash preserva a mensagem multilinha como literal Bash e fixa testnet', () => {
  const message = "Site: example.test\nNonce: abc'$(echo injected)`x`\nNao autoriza pagamentos.";
  const command = zcashSigningCommand('tmTestAddress', message);
  assert.equal(
    command,
    "zcash-cli -testnet signmessage 'tmTestAddress' 'Site: example.test\nNonce: abc'\\''$(echo injected)`x`\nNao autoriza pagamentos.'",
  );
  assert.equal(command.includes('-testnet signmessage'), true);
});
