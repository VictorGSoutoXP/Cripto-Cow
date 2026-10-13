import { useEffect, useState } from 'react';
import { api, ApiError, cents, money } from '../lib/api';
import { useLegalManifest } from '../lib/legal';
import { LegalAcceptance } from './forms';
import { Button, Modal } from './ui';
import type { Campaign, DemoWallet, DemoQuote, DemoCryptoDonation } from '../types';

type Network = 'solana' | 'zcash';
type Pending = { kind: 'credit' | 'convert' | 'donate'; input: Record<string, unknown> };
type Result = {
  wallet: DemoWallet;
  id: string;
  amount?: string;
  network?: Network;
  status?: 'simulated';
};
const pendingKey = 'cow-demo-operation';
function readPending(): Pending | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null');
    return data && ['credit', 'convert', 'donate'].includes(data.kind) && data.input?.requestKey
      ? data
      : null;
  } catch {
    return null;
  }
}
let opening: Promise<DemoWallet> | undefined;
function openWallet() {
  opening ??= api<DemoWallet>('/demo-exchange/wallet', { method: 'POST', body: '{}' }).finally(
    () => {
      opening = undefined;
    },
  );
  return opening;
}
function amountFromUnits(units: string, network: Network) {
  const precision = network === 'solana' ? 9 : 8;
  const value = BigInt(units)
    .toString()
    .padStart(precision + 1, '0');
  return `${value.slice(0, -precision)}.${value.slice(-precision)}`;
}
export function DemoExchange({
  campaign,
  onClose,
  onBack,
  onSaved,
  onTransfer,
}: {
  campaign: Campaign;
  onClose: () => void;
  onBack: () => void;
  onSaved: () => void;
  onTransfer: (network: Network, amount: string) => void;
}) {
  const [wallet, setWallet] = useState<DemoWallet | null>(null);
  const [quote, setQuote] = useState<DemoQuote | null>(null);
  const [deposit, setDeposit] = useState('50');
  const [convert, setConvert] = useState('50');
  const [network, setNetwork] = useState<Network>('solana');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [unresolved, setUnresolved] = useState<Pending | null>(readPending);
  const [receipt, setReceipt] = useState<DemoCryptoDonation | null>(null);
  const [accepted, setAccepted] = useState(false);
  const legal = useLegalManifest();
  const consent = legal.manifest?.acceptance.donor;
  useEffect(() => {
    let active = true;
    Promise.all([openWallet(), api<DemoQuote>('/demo-exchange/quote')])
      .then(([state, rates]) => {
        if (active) {
          setWallet(state);
          setQuote(rates);
        }
      })
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, []);
  const rate = quote?.rates[network];
  let estimated = '';
  try {
    if (rate)
      estimated = amountFromUnits(
        (
          (BigInt(cents(convert)) * 10n ** BigInt(network === 'solana' ? 9 : 8)) /
          BigInt(rate.rateCents)
        ).toString(),
        network,
      );
  } catch {
    /* Invalid input is explained on submit. */
  }
  async function execute(operation: Pending) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(operation));
      setUnresolved(operation);
      const result = await api<Result>(`/demo-exchange/${operation.kind}`, {
        method: 'POST',
        body: JSON.stringify(operation.input),
      });
      sessionStorage.removeItem(pendingKey);
      setUnresolved(null);
      setWallet(result.wallet);
      if (operation.kind === 'credit')
        setMessage('Reais fictícios adicionados. Nenhuma cobrança foi feita.');
      if (operation.kind === 'convert')
        setMessage(
          `${result.amount} ${result.network === 'solana' ? 'SOL' : 'ZEC'} adicionados ao saldo simulado. Nenhuma moeda foi criada na blockchain.`,
        );
      if (operation.kind === 'donate') {
        setReceipt(result as unknown as DemoCryptoDonation);
        onSaved();
        setMessage('Doação fictícia registrada. Ela não é uma transação confirmada na rede.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408) {
        sessionStorage.removeItem(pendingKey);
        setUnresolved(null);
        if (err.code === 'QUOTE_CHANGED')
          setQuote(await api<DemoQuote>('/demo-exchange/quote').catch(() => null));
        if (err.code === 'TERMS_CHANGED') {
          setAccepted(false);
          legal.reload();
        }
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function operation(kind: Pending['kind'], input: Record<string, unknown>) {
    if (unresolved) {
      setError('Confira a operação pendente antes de iniciar outra.');
      return;
    }
    void execute({ kind, input: { ...input, requestKey: crypto.randomUUID() } });
  }
  const blocked = busy || Boolean(unresolved) || !wallet;
  return (
    <Modal
      title="Experimente doar com SOL ou ZEC"
      description="Adicione reais fictícios, converta e doe no simulador. Sem cobrança e sem carteira obrigatória."
      onClose={onClose}
      wide
    >
      <div className="form-stack demo-exchange">
        <p className="muted">
          Para acompanhar suas doações no perfil, entre na conta antes de contribuir. O saldo
          fictício continua pertencendo a este navegador.
        </p>
        <div className="demo-wallet-balances" aria-label="Saldo virtual deste navegador">
          <div>
            <span>Reais fictícios</span>
            <strong>{money(wallet?.brlCents ?? 0)}</strong>
          </div>
          <div>
            <span>SOL simulado</span>
            <strong>{wallet?.balances.solana ?? '0.000000000'}</strong>
          </div>
          <div>
            <span>ZEC simulado</span>
            <strong>{wallet?.balances.zcash ?? '0.00000000'}</strong>
          </div>
        </div>
        <p className="privacy-note">
          Saldo fictício deste navegador. As moedas de teste na sua carteira continuam separadas.
        </p>
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            operation('credit', { amount: deposit });
          }}
        >
          <h3>1. Adicione reais fictícios</h3>
          <label>
            Valor fictício em reais
            <input
              value={deposit}
              onChange={(event) => setDeposit(event.target.value)}
              inputMode="decimal"
              maxLength={20}
              required
              disabled={blocked}
            />
          </label>
          <Button className="button outline" disabled={blocked}>
            Adicionar saldo fictício
          </Button>
        </form>
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (quote) operation('convert', { amount: convert, network, quoteId: quote.id });
          }}
        >
          <h3>2. Converta para SOL ou ZEC no simulador</h3>
          <label>
            Moeda para simular
            <select
              value={network}
              onChange={(event) => {
                setNetwork(event.target.value as Network);
                setReceipt(null);
              }}
              disabled={blocked}
            >
              <option value="solana">SOL · referência Solana</option>
              <option value="zcash">ZEC · referência Zcash</option>
            </select>
          </label>
          <label>
            Reais fictícios para converter
            <input
              value={convert}
              onChange={(event) => setConvert(event.target.value)}
              inputMode="decimal"
              maxLength={20}
              disabled={blocked}
              required
            />
          </label>
          {rate ? (
            <div className="rule-box">
              <div>
                <strong>
                  Equivalente simulado: {estimated || '—'} {rate.asset}
                </strong>
                <p>
                  Referência: 1 {rate.asset} = {money(rate.rateCents)} · {rate.source}
                </p>
                {rate.quotedAt ? (
                  <small>
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: 'America/Sao_Paulo',
                    }).format(new Date(rate.quotedAt))}{' '}
                    · preço do ativo real usado somente para este cálculo fictício. Moedas de teste
                    não têm valor monetário.
                  </small>
                ) : (
                  <small>
                    Taxa didática fixa. A cotação de mercado está indisponível; este exemplo não é
                    um preço atual.
                  </small>
                )}
              </div>
            </div>
          ) : (
            <p role="status">Carregando a referência de conversão...</p>
          )}
          <Button
            className="button primary"
            disabled={blocked || !rate || !estimated || !wallet?.brlCents}
            busy={busy}
          >
            Converter saldo fictício
          </Button>
        </form>
        <div className="form-stack">
          <h3>3. Doe o saldo simulado para {campaign.shortTitle}</h3>
          <p>
            Disponível: {wallet?.balances[network] ?? '0'} {network === 'solana' ? 'SOL' : 'ZEC'}{' '}
            fictícios. Este registro ficará identificado como simulação, sem TXID ou confirmação na
            blockchain.
          </p>
          <LegalAcceptance
            legal={legal}
            role="donor"
            accepted={accepted}
            onAccepted={setAccepted}
            busy={busy}
          />
          <Button
            className="button primary"
            disabled={blocked || !accepted || !consent || wallet?.units[network] === '0'}
            onClick={() => {
              if (consent && wallet)
                operation('donate', {
                  campaignId: campaign.id,
                  network,
                  units: wallet.units[network],
                  accepted: true,
                  termsVersion: consent.version,
                  termsHash: consent.hash,
                });
            }}
          >
            Doar saldo fictício de {network === 'solana' ? 'SOL' : 'ZEC'}
          </Button>
        </div>
        {message && <p role="status">{message}</p>}
        {!wallet && !error && <p role="status">Carregando seu saldo fictício...</p>}
        {receipt && (
          <div className="receipt">
            <strong>
              Recibo de simulação · {receipt.amount} {receipt.network === 'solana' ? 'SOL' : 'ZEC'}
            </strong>
            <code>{receipt.id}</code>
            <p>Registrado no histórico fictício da campanha. Sem transferência na rede.</p>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {unresolved && (
          <Button className="button outline" busy={busy} onClick={() => void execute(unresolved)}>
            Conferir operação pendente, sem repetir o crédito
          </Button>
        )}
        <Button
          className="button outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const [state, rates] = await Promise.all([
                openWallet(),
                api<DemoQuote>('/demo-exchange/quote'),
              ]);
              setWallet(state);
              setQuote(rates);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Atualizar saldos e referência
        </Button>
        <div className="rule-box">
          <div>
            <strong>Quer enviar moedas de teste pela blockchain?</strong>
            <p>
              Use SOL de devnet ou ZEC de testnet que já estejam na sua carteira. O saldo fictício
              acima não financia essa transferência.
            </p>
            <Button
              className="button outline"
              disabled={busy || Boolean(unresolved) || !estimated}
              onClick={() => onTransfer(network, estimated)}
            >
              Usar este valor em uma transferência de teste
            </Button>
          </div>
        </div>
        <Button className="button outline" disabled={busy} onClick={onBack}>
          Outras formas de contribuição
        </Button>
      </div>
    </Modal>
  );
}
