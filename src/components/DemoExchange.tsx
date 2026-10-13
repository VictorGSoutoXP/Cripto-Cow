import { useEffect, useState } from 'react';
import { api, ApiError, cents, money } from '../lib/api';
import { estimateCrypto } from '../lib/conversion';
import { useLegalManifest } from '../lib/legal';
import { LegalAcceptance } from './forms';
import { ConversionQuote } from './ConversionQuote';
import { Button, Modal } from './ui';
import type { Campaign, DemoWallet, DemoQuote, DemoCryptoDonation } from '../types';

type Network = 'solana' | 'zcash';
type Pending = {
  kind: 'credit' | 'convert' | 'donate' | 'donate-brl';
  input: Record<string, unknown>;
};
type Result = {
  wallet: DemoWallet;
  id: string;
  amount?: string;
  brlCents?: number;
  network?: Network;
  status?: 'simulated';
};
const pendingKey = 'cow-demo-operation';
function readPending(): Pending | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null');
    return data &&
      ['credit', 'convert', 'donate', 'donate-brl'].includes(data.kind) &&
      data.input?.requestKey
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
  onTransfer: (network: Network, brlAmount: string) => void;
}) {
  const [wallet, setWallet] = useState<DemoWallet | null>(null);
  const [quote, setQuote] = useState<DemoQuote | null>(null);
  const [amount, setAmount] = useState('50');
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
          if (state.brlCents > 0)
            setAmount((value) =>
              value === '50' ? (Math.min(state.brlCents, 1000000) / 100).toFixed(2) : value,
            );
        }
      })
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, []);
  const rate = quote?.rates[network];
  const estimated = estimateCrypto(amount, network, rate?.rateCents);
  let requiredCents = 0;
  try {
    requiredCents = cents(amount);
  } catch {
    /* Submission explains invalid input. */
  }
  const enoughBalance = Boolean(wallet && estimated && wallet.brlCents >= requiredCents);
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
        setMessage(
          'Saldo fictício adicionado. O equivalente já está calculado abaixo; nenhuma cobrança foi feita.',
        );
      if (operation.kind === 'convert')
        setMessage(
          `${result.amount} ${result.network === 'solana' ? 'SOL' : 'ZEC'} adicionados ao saldo fictício.`,
        );
      if (operation.kind === 'donate' || operation.kind === 'donate-brl') {
        setReceipt(result as unknown as DemoCryptoDonation);
        onSaved();
        setMessage('Doação fictícia registrada. Sem transferência na blockchain.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408) {
        sessionStorage.removeItem(pendingKey);
        setUnresolved(null);
        if (err.code === 'QUOTE_CHANGED') {
          setAccepted(false);
          setQuote(await api<DemoQuote>('/demo-exchange/quote').catch(() => null));
        }
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
    if (busy || unresolved) return;
    void execute({ kind, input: { ...input, requestKey: crypto.randomUUID() } });
  }
  const blocked = busy || Boolean(unresolved) || !wallet;
  const asset = network === 'solana' ? 'SOL' : 'ZEC';
  const acceptance = consent
    ? { accepted: true, termsVersion: consent.version, termsHash: consent.hash }
    : {};
  return (
    <Modal
      title="Quanto você quer doar?"
      description="Informe o valor em reais. O equivalente em SOL ou ZEC é calculado automaticamente."
      onClose={onClose}
      wide
    >
      <div className="form-stack demo-exchange">
        <p className="muted">
          Demonstração com dinheiro fictício. Entre na conta antes de doar para acompanhar seu apoio
          no perfil.
        </p>
        <div className="demo-wallet-balances" aria-label="Saldo virtual deste navegador">
          <div>
            <span>Reais fictícios</span>
            <strong>{money(wallet?.brlCents ?? 0)}</strong>
          </div>
          <div>
            <span>SOL fictício</span>
            <strong>{wallet?.balances.solana ?? '0.000000000'}</strong>
          </div>
          <div>
            <span>ZEC fictício</span>
            <strong>{wallet?.balances.zcash ?? '0.00000000'}</strong>
          </div>
        </div>
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (quote && consent && accepted && enoughBalance)
              operation('donate-brl', {
                amount,
                network,
                quoteId: quote.id,
                campaignId: campaign.id,
                ...acceptance,
              });
          }}
        >
          <label>
            Valor da doação em reais
            <input
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setReceipt(null);
              }}
              inputMode="decimal"
              maxLength={20}
              required
              disabled={blocked}
            />
          </label>
          <label>
            Moeda da doação
            <select
              value={network}
              onChange={(event) => {
                setNetwork(event.target.value as Network);
                setReceipt(null);
              }}
              disabled={blocked}
            >
              <option value="solana">SOL · Solana</option>
              <option value="zcash">ZEC · Zcash</option>
            </select>
          </label>
          <ConversionQuote quote={quote} network={network} equivalent={estimated} />
          <p className="privacy-note">
            Digite de R$ 1 a R$ 10.000 fictícios. A conversão e a doação acontecem juntas, sem
            precisar digitar uma quantidade em {asset}. Destino: {campaign.shortTitle}.
          </p>
          <Button
            type="button"
            className="button outline"
            disabled={blocked || !estimated}
            onClick={() => operation('credit', { amount })}
          >
            Adicionar {estimated ? money(requiredCents) : 'reais'} ao saldo fictício
          </Button>
          {!enoughBalance && estimated && <p>Adicione saldo fictício para cobrir esta doação.</p>}
          <LegalAcceptance
            legal={legal}
            role="donor"
            accepted={accepted}
            onAccepted={setAccepted}
            busy={busy}
          />
          <Button
            className="button primary"
            busy={busy}
            disabled={blocked || !accepted || !consent || !enoughBalance}
          >
            Doar {estimated ? money(requiredCents) : 'reais'} fictícios em {asset}
          </Button>
        </form>
        {message && <p role="status">{message}</p>}
        {!wallet && !error && <p role="status">Carregando seu saldo fictício...</p>}
        {receipt && (
          <div className="receipt">
            <strong>
              Recibo de simulação · {receipt.amount} {receipt.asset}
            </strong>
            {receipt.brlCents !== undefined && (
              <span>{money(receipt.brlCents)} fictícios convertidos e doados automaticamente.</span>
            )}
            <code>{receipt.id}</code>
            <p>
              Sem transferência na blockchain. Este valor não entra no saldo demonstrativo em reais
              da campanha.
            </p>
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
          Atualizar saldo e cotação
        </Button>
        <details>
          <summary>Usar meu saldo fictício em SOL ou ZEC</summary>
          <div className="form-stack">
            <p>
              Você já tem {wallet?.balances[network] ?? '0'} {asset} fictícios. Pode doar esse saldo
              ou converter o valor em reais informado acima e guardar a moeda para depois.
            </p>
            <Button
              className="button outline"
              disabled={blocked || !enoughBalance}
              onClick={() => {
                if (quote) operation('convert', { amount, network, quoteId: quote.id });
              }}
            >
              Converter e guardar {asset} fictício
            </Button>
            <Button
              className="button outline"
              disabled={
                blocked || !accepted || !consent || !wallet || wallet.units[network] === '0'
              }
              onClick={() => {
                if (wallet && consent)
                  operation('donate', {
                    campaignId: campaign.id,
                    network,
                    units: wallet.units[network],
                    ...acceptance,
                  });
              }}
            >
              Doar meu saldo fictício de {asset}
            </Button>
          </div>
        </details>
        <div className="rule-box">
          <div>
            <strong>Enviar moedas de teste pela blockchain</strong>
            <p>
              O equivalente pode preparar um envio com SOL de devnet ou ZEC de testnet que já
              estejam na sua carteira. O saldo fictício não compra nem financia moedas de teste.
            </p>
            <Button
              className="button outline"
              disabled={blocked || !estimated || rate?.basis !== 'market-reference'}
              onClick={() => onTransfer(network, amount)}
            >
              Doar este equivalente pela carteira de teste
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
