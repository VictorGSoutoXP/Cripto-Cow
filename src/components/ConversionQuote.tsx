import { money } from '../lib/api';
import type { DemoQuote } from '../types';

export function ConversionQuote({
  quote,
  network,
  equivalent,
}: {
  quote: DemoQuote | null;
  network: 'solana' | 'zcash';
  equivalent: string;
}) {
  const rate = quote?.rates[network];
  if (!rate) return <p role="status">Carregando a cotação...</p>;
  return (
    <div className="rule-box" aria-live="polite">
      <div>
        <strong>
          Você vai doar: {equivalent ? equivalent.replace('.', ',') : '—'} {rate.asset}
        </strong>
        <p>
          1 {rate.asset} ≈ {money(rate.rateCents)} · {rate.source}
        </p>
        {rate.quotedAt ? (
          <small>
            {rate.source === 'Coinbase spot' ? 'Consultado' : 'Cotação atualizada'} em{' '}
            {new Intl.DateTimeFormat('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Sao_Paulo',
            }).format(new Date(rate.quotedAt))}
            . Referência de mercado dos ativos reais, sem taxas de compra ou de rede. A doação usa
            valores fictícios ou moedas de teste, sem valor monetário.
          </small>
        ) : (
          <small>
            Cotação de mercado indisponível. Este cálculo usa uma taxa fictícia de treinamento e não
            representa um preço atual.
          </small>
        )}
      </div>
    </div>
  );
}
