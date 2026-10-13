import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Copy,
  KeyRound,
  ShieldCheck,
  Unplug,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { linkSolanaWallet, solanaProvider } from '../lib/wallet';
import {
  phantomBrowseUrl,
  phantomDownloadUrl,
  zcashTestnetGuideUrl,
  zcashSigningGuideUrl,
  zcashSigningCommand,
} from '../lib/wallet-links';
import { Button } from '../components/ui';
import { Contributions } from '../components/Contributions';
import type { Overlay, ProfileWallet, WalletChallenge } from '../types';

type User = { id: string | null; name: string; email?: string };
export default function Profile({
  user,
  refresh,
  show,
  notify,
}: {
  user: User;
  refresh: () => void;
  show: (overlay: Overlay) => void;
  notify: (message: string) => void;
}) {
  const [wallets, setWallets] = useState<ProfileWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'password' | 'recovery' | 'close' | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    api<{ wallets: ProfileWallet[] }>('/profile')
      .then((data) => {
        if (active) setWallets(data.wallets);
      })
      .catch((err) => {
        if (active) setLoadError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/profile', { method: 'PATCH', body: JSON.stringify({ name }) });
      notify('Nome de exibição atualizado.');
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function chooseAction(value: typeof action) {
    setAction(value);
    setCurrentPassword('');
    setPassword('');
    setConfirmation('');
    setError('');
    setCloseConfirmed(false);
  }
  async function accountAction(event: React.FormEvent) {
    event.preventDefault();
    if (!action || busy) return;
    setError('');
    if (action === 'password' && password !== confirmation) {
      setError('As senhas não coincidem.');
      return;
    }
    if (action === 'close' && !closeConfirmed) {
      setError('Confirme o encerramento da conta.');
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ recoveryCode?: string }>(
        action === 'close' ? '/profile' : `/profile/${action}`,
        {
          method: action === 'close' ? 'DELETE' : 'POST',
          body: JSON.stringify(
            action === 'password' ? { currentPassword, password } : { password: currentPassword },
          ),
        },
      );
      if (result.recoveryCode) show({ type: 'recoveryCode', code: result.recoveryCode });
      if (action === 'close') {
        window.location.hash = '/painel';
        notify('Conta encerrada. Os registros públicos das campanhas foram preservados.');
      }
      chooseAction(null);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="profile-layout">
      <Contributions key={user.id} />
      <section className="profile-card">
        <span className="eyebrow small">SEU PERFIL</span>
        <h2>Uma conta, suas causas.</h2>
        <p className="muted">Seu e-mail é usado para entrar e fica fora do histórico público.</p>
        <form className="form-stack" onSubmit={saveName}>
          <label>
            Nome de exibição
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={60}
              required
              disabled={busy}
              autoComplete="nickname"
            />
          </label>
          <label>
            E-mail
            <input value={user.email ?? ''} readOnly type="email" />
          </label>
          <Button className="button primary" busy={busy}>
            Salvar nome
          </Button>
        </form>
      </section>
      <section className="profile-card profile-wallet-section">
        <span className="eyebrow small">CARTEIRAS DO PERFIL</span>
        <h2>Seu endereço. Sua assinatura.</h2>
        <p className="muted">
          Vincule uma carteira por rede. Você mantém as chaves; a assinatura comprova o vínculo com
          seu perfil.
        </p>
        {loading ? (
          <p role="status">Carregando seus vínculos...</p>
        ) : loadError ? (
          <div>
            <p role="alert" className="form-error">
              {loadError}
            </p>
            <Button className="button outline" onClick={() => setRevision((value) => value + 1)}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <Wallets wallets={wallets} onChange={setWallets} />
        )}
      </section>
      <section className="profile-card profile-security">
        <span className="eyebrow small">ACESSO E RECUPERAÇÃO</span>
        <h2>Cuide do seu acesso.</h2>
        <p className="muted">
          Seu código de recuperação permite escolher uma nova senha. Cada novo código substitui o
          anterior.
        </p>
        <div className="profile-actions">
          <button
            className="button outline"
            disabled={busy}
            onClick={() => chooseAction('password')}
          >
            <KeyRound size={16} />
            Alterar senha
          </button>
          <button
            className="button outline"
            disabled={busy}
            onClick={() => chooseAction('recovery')}
          >
            Gerar novo código
          </button>
          <button className="text-link" disabled={busy} onClick={() => chooseAction('close')}>
            Encerrar minha conta
          </button>
        </div>
        {action && (
          <form className="form-stack profile-action-form" onSubmit={accountAction}>
            <h3>
              {action === 'password'
                ? 'Escolha uma nova senha'
                : action === 'recovery'
                  ? 'Substituir código de recuperação'
                  : 'Encerrar sua conta'}
            </h3>
            {action === 'close' && (
              <p>
                O encerramento remove o cadastro, sessões e vínculos de carteira. As campanhas e seu
                histórico público permanecem sob acompanhamento da moderação. Uma nova conta não
                recupera o acesso às campanhas antigas.
              </p>
            )}
            <label>
              Senha atual
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                maxLength={128}
                required
                disabled={busy}
              />
            </label>
            {action === 'password' && (
              <>
                <label>
                  Nova senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={12}
                    maxLength={128}
                    required
                    disabled={busy}
                  />
                </label>
                <label>
                  Confirmar nova senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    minLength={12}
                    maxLength={128}
                    required
                    disabled={busy}
                  />
                </label>
              </>
            )}
            {action === 'close' && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={closeConfirmed}
                  onChange={(event) => setCloseConfirmed(event.target.checked)}
                  disabled={busy}
                  required
                />
                <span>Entendo que o encerramento é definitivo e quero encerrar minha conta.</span>
              </label>
            )}
            <div className="profile-actions">
              <Button className="button primary" busy={busy}>
                Confirmar {action === 'close' ? 'encerramento' : 'alteração'}
              </Button>
              <button
                type="button"
                className="button outline"
                disabled={busy}
                onClick={() => chooseAction(null)}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Wallets({
  wallets,
  onChange,
}: {
  wallets: ProfileWallet[];
  onChange: (wallets: ProfileWallet[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [connected, setConnected] = useState(solanaProvider()?.publicKey?.toString() ?? '');
  const [address, setAddress] = useState('');
  const [challenge, setChallenge] = useState<WalletChallenge | null>(null);
  const [signature, setSignature] = useState('');
  const [removing, setRemoving] = useState<'solana' | 'zcash' | null>(null);
  const [password, setPassword] = useState('');
  const [amount, setAmount] = useState('0.001');
  const [uri, setUri] = useState('');
  const [, checkProvider] = useState(0);
  const provider = solanaProvider();
  const canSignSolana = Boolean(provider?.signMessage);
  const phantomMobileLink = phantomBrowseUrl(window.location.origin);
  const solana = wallets.find((wallet) => wallet.network === 'solana');
  const zcash = wallets.find((wallet) => wallet.network === 'zcash');
  useEffect(() => {
    const changed = (key?: { toString: () => string } | null) =>
      setConnected(key?.toString() ?? '');
    const disconnected = () => setConnected('');
    provider?.on?.('accountChanged', changed);
    provider?.on?.('disconnect', disconnected);
    return () => {
      provider?.removeListener?.('accountChanged', changed);
      provider?.removeListener?.('disconnect', disconnected);
    };
  }, [provider]);
  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await task();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copiado.');
    } catch {
      setError('Selecione o conteúdo e copie manualmente.');
    }
  }
  return (
    <div className="wallet-grid">
      <article className="wallet-card">
        <div className="wallet-title">
          <Wallet />
          <h3>
            Solana <span className="network-tag">devnet</span>
          </h3>
        </div>
        <p>
          Assine uma mensagem na Phantom para comprovar a posse do endereço. O vínculo não cobra
          taxa.
        </p>
        {solana && (
          <>
            <div className="wallet-address">
              <CheckCircle2 size={16} />
              <code>{solana.address}</code>
            </div>
            <span className="wallet-state">
              Vínculo verificado ·{' '}
              {connected === solana.address
                ? 'mesma carteira conectada'
                : 'carteira vinculada desconectada'}
            </span>
          </>
        )}
        {connected && connected !== solana?.address && (
          <p className="wallet-state">
            A carteira conectada tem outro endereço. Vincule-a se quiser substituir o vínculo.
          </p>
        )}
        {canSignSolana ? (
          <Button
            className="button primary"
            busy={busy}
            onClick={() =>
              run(async () => {
                onChange(await linkSolanaWallet());
                setConnected(solanaProvider()?.publicKey?.toString() ?? '');
                setStatus('Carteira Solana vinculada ao perfil.');
              })
            }
          >
            {solana ? 'Conectar ou substituir Phantom' : 'Vincular Phantom'}
          </Button>
        ) : (
          <div className="wallet-next-step">
            <p>
              A Phantom não foi encontrada neste navegador. Instale a extensão para continuar aqui
              ou abra o perfil no app da Phantom no celular.
            </p>
            <a
              className="button primary"
              href={phantomDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instalar Phantom e continuar <ArrowUpRight size={15} />
            </a>
            {phantomMobileLink && (
              <a
                className="button outline"
                href={phantomMobileLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir perfil na Phantom (celular) <ArrowUpRight size={15} />
              </a>
            )}
            {phantomMobileLink && (
              <p>
                No navegador da Phantom, entre novamente na sua conta e toque em Vincular Phantom. O
                link abre o perfil; o vínculo só é concluído depois da sua assinatura.
              </p>
            )}
            <button
              className="text-link"
              disabled={busy}
              onClick={() => {
                checkProvider((value) => value + 1);
                const current = solanaProvider();
                setConnected(current?.publicKey?.toString() ?? '');
                setError('');
                setStatus(
                  current?.signMessage
                    ? 'Phantom encontrada. Agora clique em Vincular Phantom.'
                    : 'Phantom ainda não detectada. Após instalar e habilitar a extensão, recarregue esta página.',
                );
              }}
            >
              Já instalei — verificar Phantom
            </button>
          </div>
        )}
        {connected && (
          <button
            className="text-link"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await solanaProvider()?.disconnect?.();
                setConnected('');
                setStatus('Phantom desconectada. O vínculo permanece no perfil.');
              })
            }
          >
            <Unplug size={15} />
            Desconectar do navegador
          </button>
        )}
        {solana && (
          <button
            className="text-link"
            disabled={busy}
            onClick={() => {
              setRemoving('solana');
              setPassword('');
            }}
          >
            Remover vínculo Solana
          </button>
        )}
        <p className="wallet-caption">
          Configure a Phantom para devnet antes de ancorar o histórico de uma campanha.
        </p>
      </article>
      <article className="wallet-card">
        <div className="wallet-title">
          <ShieldCheck />
          <h3>
            Zcash <span className="network-tag">testnet</span>
          </h3>
        </div>
        <p>
          Vincule um endereço transparente de teste com uma assinatura de mensagem. Este fluxo não
          usa endereços protegidos.
        </p>
        <div className="wallet-next-step">
          <a
            className="text-link"
            href={zcashTestnetGuideUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Preparar carteira Zcash testnet <ArrowUpRight size={14} />
          </a>
          <p>
            Use uma carteira com endereço tm... e assinatura de mensagens, como zcash-cli em
            testnet. Preparar vínculo gera a mensagem que você assina na sua carteira.
          </p>
        </div>
        {zcash && (
          <>
            <div className="wallet-address">
              <CheckCircle2 size={16} />
              <code>{zcash.address}</code>
            </div>
            <span className="wallet-state">Vínculo verificado · endereço transparente</span>
          </>
        )}
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const value = await api<WalletChallenge>('/profile/wallets/challenge', {
                method: 'POST',
                body: JSON.stringify({ network: 'zcash', address }),
              });
              setChallenge(value);
              setSignature('');
            });
          }}
        >
          <label>
            Endereço Zcash testnet
            <input
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setChallenge(null);
                setSignature('');
              }}
              minLength={32}
              maxLength={100}
              placeholder="tm..."
              required
              disabled={busy}
            />
          </label>
          <Button className="button outline" busy={busy}>
            {zcash ? 'Preparar substituição' : 'Preparar vínculo'}
          </Button>
        </form>
        {challenge && (
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const result = await api<{ wallets: ProfileWallet[] }>('/profile/wallets/confirm', {
                  method: 'POST',
                  body: JSON.stringify({ id: challenge.id, signature: signature.trim() }),
                });
                onChange(result.wallets);
                setChallenge(null);
                setSignature('');
                setUri('');
                setStatus('Endereço Zcash verificado e vinculado.');
              });
            }}
          >
            <div className="wallet-next-step" role="status">
              <h4>Próximo passo: assinar na carteira Zcash</h4>
              <ol>
                <li>Copie a mensagem completa abaixo.</li>
                <li>Assine com o endereço {challenge.address} na sua carteira de teste.</li>
                <li>Cole a assinatura em Base64 e clique em Confirmar vínculo Zcash.</li>
              </ol>
              <p>
                Válido até{' '}
                {new Intl.DateTimeFormat('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'America/Sao_Paulo',
                }).format(new Date(challenge.expiresAt))}
                . Se expirar, prepare um novo vínculo.
              </p>
              <a
                className="text-link"
                href={zcashSigningGuideUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir instruções oficiais de assinatura <ArrowUpRight size={14} />
              </a>
            </div>
            <label>
              Mensagem para assinar
              <textarea value={challenge.message} readOnly rows={8} />
            </label>
            <button type="button" className="text-link" onClick={() => copy(challenge.message)}>
              <Copy size={15} />
              Copiar mensagem
            </button>
            <details>
              <summary>Comando para zcash-cli (Bash, Linux/macOS/WSL)</summary>
              <p>
                Com o nó e a carteira configurados em testnet, execute o comando no terminal Bash.
                Ele assina a mensagem com a chave que já está na sua carteira. Copie o resultado em
                Base64 para o campo abaixo. Nunca cole uma chave privada no site.
              </p>
              <pre className="wallet-signing-command">
                <code>{zcashSigningCommand(challenge.address, challenge.message)}</code>
              </pre>
              <button
                type="button"
                className="text-link"
                onClick={() => copy(zcashSigningCommand(challenge.address, challenge.message))}
              >
                <Copy size={15} /> Copiar comando de assinatura
              </button>
            </details>
            <label>
              Assinatura em Base64
              <textarea
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                maxLength={100}
                rows={2}
                required
                disabled={busy}
              />
            </label>
            <Button className="button primary" busy={busy}>
              Confirmar vínculo Zcash
            </Button>
          </form>
        )}
        {zcash && (
          <>
            <form
              className="form-stack wallet-request"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const result = await api<{ uri: string }>('/profile/wallets/zcash/request', {
                    method: 'POST',
                    body: JSON.stringify({ amount }),
                  });
                  setUri(result.uri);
                });
              }}
            >
              <label>
                Valor do pedido de teste em ZEC
                <input
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setUri('');
                  }}
                  inputMode="decimal"
                  maxLength={18}
                  required
                  disabled={busy}
                />
              </label>
              <Button className="button outline" busy={busy}>
                Gerar pedido de teste
              </Button>
            </form>
            {uri && (
              <div className="wallet-request-result">
                <code>{uri}</code>
                <button className="text-link" onClick={() => copy(uri)}>
                  <Copy size={15} />
                  Copiar pedido ZIP 321
                </button>
                <a className="text-link" href={uri}>
                  Abrir na carteira compatível <ArrowUpRight size={14} />
                </a>
                <p>
                  Pedido testnet para o seu endereço. Não credita campanhas nem confirma uma
                  transferência.
                </p>
              </div>
            )}
            <button
              className="text-link"
              disabled={busy}
              onClick={() => {
                setRemoving('zcash');
                setPassword('');
              }}
            >
              Remover vínculo Zcash
            </button>
          </>
        )}
      </article>
      {removing && (
        <form
          className="form-stack wallet-remove"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result = await api<{ wallets: ProfileWallet[] }>(
                `/profile/wallets/${removing}`,
                { method: 'DELETE', body: JSON.stringify({ password }) },
              );
              onChange(result.wallets);
              setRemoving(null);
              setPassword('');
              setUri('');
              setChallenge(null);
              setStatus('Vínculo removido do perfil.');
            });
          }}
        >
          <h3>Remover vínculo {removing === 'solana' ? 'Solana' : 'Zcash'}</h3>
          <label>
            Senha da conta
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              maxLength={128}
              required
              disabled={busy}
            />
          </label>
          <div className="profile-actions">
            <Button className="button primary" busy={busy}>
              Confirmar remoção
            </Button>
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => {
                setRemoving(null);
                setPassword('');
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {status && (
        <p role="status" className="wallet-feedback">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error wallet-feedback">
          {error}
        </p>
      )}
    </div>
  );
}
