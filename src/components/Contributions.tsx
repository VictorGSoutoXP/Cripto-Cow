import { useEffect, useState } from 'react';
import { ArrowUpRight, Heart, RefreshCw } from 'lucide-react';
import { api, date, money } from '../lib/api';
import { Button } from './ui';

type CoinTotal = { units: string; amount: string; count: number };
type Receipt = {
  id: string;
  kind: 'brl' | 'virtual' | 'testnet';
  campaignId: string;
  campaignTitle: string;
  createdAt: string;
  confirmedAt: string | null;
  status: 'simulated' | 'pending' | 'confirmed';
  network: 'solana' | 'zcash' | null;
  asset: 'BRL' | 'SOL' | 'ZEC';
  amount: number | string;
  brlReferenceCents: number | null;
  ledgerId: string | null;
  txid: string | null;
};
type Summary = {
  totals: {
    brl: { cents: number; count: number };
    virtual: { solana: CoinTotal; zcash: CoinTotal };
    testnet: { solana: CoinTotal; zcash: CoinTotal };
  };
  pendingCount: number;
  total: number;
  offset: number;
  limit: number;
  history: Receipt[];
};
const coin = (amount: string) => amount.replace(/\.?0+$/, '').replace('.', ',');
const countLabel = (count: number) => `${count} ${count === 1 ? 'doação' : 'doações'}`;
const mode = (kind: Receipt['kind']) =>
  kind === 'brl' ? 'Reais fictícios' : kind === 'virtual' ? 'Cripto fictícia' : 'Rede de teste';

export function Contributions() {
  const [data, setData] = useState<Summary | null>(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<Summary>(`/profile/contributions?offset=${offset}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [offset, revision]);
  return (
    <section className="profile-card profile-contributions" aria-labelledby="contributions-title">
      <div className="contribution-heading">
        <div>
          <span className="eyebrow small">
            <Heart size={14} /> SEU APOIO
          </span>
          <h2 id="contributions-title">Minhas contribuições</h2>
        </div>
        <Button
          className="button outline"
          busy={loading}
          onClick={() => {
            setOffset(0);
            setRevision((value) => value + 1);
          }}
        >
          <RefreshCw size={16} /> Atualizar contribuições
        </Button>
      </div>
      <p className="muted">
        Veja quanto você já doou com esta conta. Os totais são históricos, separados por moeda e
        modalidade; não representam saldo disponível.
      </p>
      {loading ? (
        <p role="status">Carregando suas contribuições...</p>
      ) : error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : (
        data && (
          <>
            <div className="contribution-totals">
              <article>
                <h3>Reais fictícios</h3>
                <strong>{money(data.totals.brl.cents)}</strong>
                <small>
                  {countLabel(data.totals.brl.count)}{' '}
                  {data.totals.brl.count === 1 ? 'simulada' : 'simuladas'}
                </small>
              </article>
              {(['virtual', 'testnet'] as const).map((kind) => (
                <article key={kind}>
                  <h3>{kind === 'virtual' ? 'Cripto fictícia' : 'Cripto de teste confirmada'}</h3>
                  {(['solana', 'zcash'] as const).map((network) => (
                    <div className="contribution-coin" key={network}>
                      <strong>
                        {coin(data.totals[kind][network].amount)}{' '}
                        {network === 'solana' ? 'SOL' : 'ZEC'}
                      </strong>
                      <small>{countLabel(data.totals[kind][network].count)}</small>
                    </div>
                  ))}
                  <small>
                    {kind === 'virtual'
                      ? 'Simulação, sem envio à blockchain'
                      : 'Solana devnet · Zcash testnet'}
                  </small>
                </article>
              ))}
            </div>
            {data.pendingCount > 0 && (
              <p role="status" className="contribution-note">
                {data.pendingCount} pedido(s) de cripto aguardando confirmação. Esses valores ainda
                não entram nos totais.
              </p>
            )}
            <h3>Histórico de contribuições</h3>
            {data.total === 0 ? (
              <p className="muted">
                Você ainda não tem contribuições vinculadas a esta conta. Entre antes de doar para
                acompanhar seu apoio aqui.
              </p>
            ) : (
              <ul className="contribution-history">
                {data.history.map((receipt) => (
                  <li key={`${receipt.kind}:${receipt.id}`}>
                    <div>
                      <a href={`#/campanha/${encodeURIComponent(receipt.campaignId)}`}>
                        {receipt.campaignTitle}
                        <ArrowUpRight size={15} />
                      </a>
                      <small>
                        {date(receipt.confirmedAt ?? receipt.createdAt)} · {mode(receipt.kind)}
                      </small>
                      <small className="contribution-reference">Recibo: {receipt.id}</small>
                      {receipt.brlReferenceCents !== null && (
                        <small>Referência da conversão: {money(receipt.brlReferenceCents)}</small>
                      )}
                      {receipt.txid && (
                        <small className="contribution-reference">Transação: {receipt.txid}</small>
                      )}
                    </div>
                    <div className="contribution-value">
                      <strong>
                        {receipt.asset === 'BRL'
                          ? money(Number(receipt.amount))
                          : `${coin(String(receipt.amount))} ${receipt.asset}`}
                      </strong>
                      <span className={`contribution-state ${receipt.status}`}>
                        {receipt.status === 'pending'
                          ? 'Aguardando confirmação'
                          : receipt.status === 'confirmed'
                            ? 'Confirmada na rede de teste'
                            : 'Simulada'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.total > data.limit && (
              <div className="profile-actions contribution-pagination">
                <Button
                  className="button outline"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - data.limit))}
                >
                  Anteriores
                </Button>
                <span>
                  {offset + 1}–{Math.min(offset + data.limit, data.total)} de {data.total}
                </span>
                <Button
                  className="button outline"
                  disabled={offset + data.limit >= data.total}
                  onClick={() => setOffset(offset + data.limit)}
                >
                  Próximas
                </Button>
              </div>
            )}
          </>
        )
      )}
      <p className="muted contribution-note">
        O vínculo com sua conta é privado, mesmo quando você doa anonimamente no histórico público.
        Doações antigas ou realizadas sem login não são atribuídas automaticamente. Adicionar saldo
        ou converter moedas não conta como doação.
      </p>
    </section>
  );
}
