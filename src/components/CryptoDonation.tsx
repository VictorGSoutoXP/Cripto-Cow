import { useEffect, useState } from 'react';
import { Buffer } from 'buffer';
import { api, ApiError } from '../lib/api';
import { solanaProvider } from '../lib/wallet';
import { signedAnchorSignature } from '../lib/anchor-pending';
import { useLegalManifest } from '../lib/legal';
import { Button, Modal, ExternalLink } from './ui';
import { LegalAcceptance } from './forms';
import type { Campaign, CryptoPayment, PaymentMethods } from '../types';

const keyFor = (id: string) => `cripto-cow:payment:${id}`;
function pending(id: string) {
  try {
    const raw = sessionStorage.getItem(keyFor(id));
    if (!raw) return null;
    const saved = JSON.parse(raw) as CryptoPayment;
    return saved.campaignId === id && saved.token && saved.id ? saved : null;
  } catch {
    return null;
  }
}
export function CryptoDonation({
  campaign,
  network,
  onBack,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  network: 'solana' | 'zcash';
  onBack: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [methods, setMethods] = useState<PaymentMethods | null>(null);
  const [intent, setIntent] = useState<CryptoPayment | null>(() => pending(campaign.id));
  const [amount, setAmount] = useState(network === 'solana' ? '0.01' : '0.001');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const [txid, setTxid] = useState(intent?.txid ?? '');
  const legal = useLegalManifest();
  const consent = legal.manifest?.acceptance.donor;
  const method = methods?.methods.find((item) => item.network === network);
  useEffect(() => {
    let active = true;
    api<PaymentMethods>(`/campaigns/${campaign.id}/payment-methods`)
      .then((result) => active && setMethods(result))
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [campaign.id]);
  function keep(payment: CryptoPayment) {
    // Save before asking the wallet to sign; refreshing must never pay twice.
    sessionStorage.setItem(keyFor(campaign.id), JSON.stringify(payment));
    setIntent(payment);
  }
  async function prepare(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!consent || !accepted) throw new Error('Leia e aceite as condições antes de continuar.');
      let payer: string | undefined;
      if (network === 'solana') {
        const provider = solanaProvider();
        if (!provider)
          throw new Error(
            'Use o navegador da Phantom ou instale a extensão. Selecione Solana devnet e obtenha SOL de teste.',
          );
        payer = (await provider.connect()).publicKey.toString();
      }
      const prepared = await api<CryptoPayment>(`/campaigns/${campaign.id}/crypto-payments`, {
        method: 'POST',
        body: JSON.stringify({
          network,
          amount: amount.replace(',', '.'),
          payer,
          requestKey: crypto.randomUUID(),
          accepted,
          termsVersion: consent.version,
          termsHash: consent.hash,
        }),
      });
      keep(prepared);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TERMS_CHANGED') {
        setAccepted(false);
        legal.reload();
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(payment: CryptoPayment, transactionId: string) {
    const result = await api<CryptoPayment>(`/crypto-payments/${payment.id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ token: payment.token, txid: transactionId.trim() }),
    });
    keep({ ...result, token: payment.token });
    onSaved();
  }
  async function paySolana() {
    if (!intent || intent.txid || intent.status === 'confirmed') return;
    setBusy(true);
    setError('');
    try {
      const provider = solanaProvider();
      if (!provider) throw new Error('Abra este pedido na Phantom com Solana devnet selecionada.');
      const account = (await provider.connect()).publicKey.toString();
      if (account !== intent.payer)
        throw new Error('Conecte a mesma carteira usada para preparar este pedido.');
      const { Transaction, SystemProgram, TransactionInstruction, PublicKey } =
        await import('@solana/web3.js');
      const transaction = new Transaction({
        feePayer: new PublicKey(account),
        recentBlockhash: intent.blockhash!,
      }).add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(account),
          toPubkey: new PublicKey(intent.receiver),
          lamports: BigInt(intent.units),
        }),
        new TransactionInstruction({
          programId: new PublicKey(intent.memoProgram!),
          keys: [{ pubkey: new PublicKey(account), isSigner: true, isWritable: false }],
          data: Buffer.from(intent.memo!, 'utf8'),
        }),
      );
      const signed = await provider.signTransaction(transaction);
      const bytes = signed.serialize();
      const signature = await signedAnchorSignature(bytes);
      const sent = { ...intent, txid: signature };
      keep(sent);
      setTxid(signature);
      await api(`/crypto-payments/${intent.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          token: intent.token,
          transaction: Buffer.from(bytes).toString('base64'),
        }),
      });
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1800));
        try {
          await confirm(sent, signature);
          return;
        } catch (err) {
          if (!(err instanceof ApiError) || err.code !== 'CONFIRMATION_PENDING') throw err;
        }
      }
      setError(
        'Pagamento enviado. Clique em Conferir confirmação para atualizar o recibo; não envie outro pagamento.',
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (!intent) return;
    setBusy(true);
    setError('');
    try {
      await confirm(intent, intent.txid ?? txid);
    } catch (err) {
      setError((err as Error).message);
      setCanRetry(
        err instanceof ApiError &&
          ['TRANSACTION_EXPIRED', 'TRANSACTION_FAILED'].includes(err.code ?? ''),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        intent?.status === 'confirmed'
          ? 'Contribuição confirmada na rede.'
          : 'Apoiar com cripto de teste'
      }
      description="Somente Solana devnet e Zcash testnet. Nunca envie moedas de mainnet."
      onClose={onClose}
    >
      {intent ? (
        <div className="form-stack">
          <strong>
            {intent.amount} {intent.asset} · {intent.chain}
          </strong>
          <p>
            {intent.status === 'confirmed'
              ? 'O recibo foi adicionado ao histórico verificável. Esse valor não altera o saldo demonstrativo em reais.'
              : 'Confira o valor exato e o destinatário. A contribuição vai diretamente à carteira da campanha, sem custódia ou liberação pela plataforma.'}
          </p>
          <label>
            Destinatário da campanha<code className="payment-address">{intent.receiver}</code>
          </label>
          {intent.status !== 'confirmed' && intent.network === 'solana' && !intent.txid && (
            <Button className="button primary" busy={busy} onClick={paySolana}>
              Autorizar {intent.amount} SOL na Phantom
            </Button>
          )}
          {intent.status !== 'confirmed' && intent.network === 'zcash' && (
            <>
              <p>
                Envie exatamente {intent.amount} ZEC de teste. O valor inclui uma pequena fração de
                teste para identificar este pedido. Depois, cole o TXID fornecido pela carteira.
              </p>
              <ExternalLink href={intent.uri!}>Abrir pedido na carteira Zcash</ExternalLink>
              <Button
                className="button outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(intent.uri!);
                  } catch {
                    setError('Copie o pedido no campo abaixo.');
                  }
                }}
              >
                Copiar pedido Zcash
              </Button>
              <textarea aria-label="Pedido Zcash" readOnly value={intent.uri} rows={3} />
              <label>
                TXID do pagamento
                <input
                  value={txid}
                  onChange={(event) => setTxid(event.target.value)}
                  maxLength={64}
                  autoComplete="off"
                />
              </label>
            </>
          )}
          {intent.txid && (
            <label>
              Transação<code className="payment-address">{intent.txid}</code>
            </label>
          )}
          {intent.status !== 'confirmed' && (
            <Button
              className="button primary"
              busy={busy}
              disabled={!(intent.txid ?? txid)}
              onClick={check}
            >
              Conferir confirmação
            </Button>
          )}
          {intent.status === 'confirmed' && (
            <>
              <p role="status">Pagamento de teste confirmado e registrado uma única vez.</p>
              {intent.explorerUrl && (
                <ExternalLink href={intent.explorerUrl}>
                  Ver transação na Solana Explorer
                </ExternalLink>
              )}
              <code className="payment-address">Recibo: {intent.id}</code>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {(intent.status === 'confirmed' ||
            canRetry ||
            (intent.network === 'solana' && !intent.txid)) && (
            <Button
              className="button outline"
              onClick={() => {
                sessionStorage.removeItem(keyFor(campaign.id));
                setIntent(null);
                setTxid('');
                setError('');
                setCanRetry(false);
              }}
            >
              {intent.network === 'solana' && !intent.txid
                ? 'Cancelar pedido ainda não autorizado'
                : 'Preparar outra contribuição'}
            </Button>
          )}
          <p className="privacy-note">
            Guarde este pedido neste navegador. A confirmação pode ser retomada após atualizar a
            página. Endereços e transações são públicos; este fluxo Zcash usa endereço transparente.
          </p>
        </div>
      ) : (
        <form className="form-stack" onSubmit={prepare}>
          <strong>
            {campaign.shortTitle} ·{' '}
            {network === 'solana' ? 'SOL / Solana devnet' : 'ZEC / Zcash testnet'}
          </strong>
          {!methods ? (
            <p role="status">Conferindo o destinatário...</p>
          ) : !method?.available ? (
            <p role="alert">
              A campanha ainda não tem carteira disponível nesta rede. O organizador deve
              configurá-la no painel.
            </p>
          ) : (
            <>
              {method.demoReceiver && (
                <p>
                  Esta campanha usa uma carteira demonstrativa do projeto, somente para moedas de
                  teste.
                </p>
              )}
              <label>
                Valor em {network === 'solana' ? 'SOL' : 'ZEC'} de teste
                <input
                  aria-label="Valor em cripto de teste"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  maxLength={20}
                  required
                />
              </label>
              <label>
                Destinatário<code className="payment-address">{method.receiver}</code>
              </label>
              <p>
                As moedas vão diretamente ao endereço acima. Não entram no orçamento demonstrativo
                em reais e não ficam retidas para aprovação de despesas.
              </p>
              <LegalAcceptance
                legal={legal}
                role="donor"
                accepted={accepted}
                onAccepted={setAccepted}
                busy={busy}
              />
              <Button className="button primary" busy={busy} disabled={!accepted || !consent}>
                Preparar contribuição de teste
              </Button>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
      {!intent && (
        <Button className="button outline" disabled={busy} onClick={onBack}>
          Voltar às formas de contribuição
        </Button>
      )}
    </Modal>
  );
}
