import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button } from './ui';
import type { Campaign, ProfileWallet } from '../types';

export function CampaignReceivers({
  campaign,
  onSaved,
}: {
  campaign: Campaign;
  onSaved: () => void;
}) {
  const [wallets, setWallets] = useState<ProfileWallet[]>([]);
  const [networks, setNetworks] = useState<('solana' | 'zcash')[]>(
    () => Object.keys(campaign.cryptoReceivers ?? {}) as ('solana' | 'zcash')[],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    api<{ wallets: ProfileWallet[] }>('/profile')
      .then((result) => active && setWallets(result.wallets))
      .catch((err) => active && setMessage(err.message));
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="campaign-receivers form-stack">
      <h3>Receber contribuições de teste</h3>
      <p>
        Escolha suas carteiras verificadas para esta campanha. As moedas vão diretamente a elas e
        ficam separadas do saldo demonstrativo em reais.
      </p>
      <a className="text-link" href="#/perfil">
        Vincular carteiras no perfil
      </a>
      {(['solana', 'zcash'] as const).map((network) => {
        const wallet = wallets.find((item) => item.network === network);
        return (
          <label className="checkbox" key={network}>
            <input
              type="checkbox"
              disabled={!wallet || busy}
              checked={networks.includes(network)}
              onChange={(event) =>
                setNetworks((current) =>
                  event.target.checked
                    ? [...current, network]
                    : current.filter((item) => item !== network),
                )
              }
            />
            <span>
              {network === 'solana' ? 'SOL / Solana devnet' : 'ZEC / Zcash testnet'}
              <small className="payment-address">
                {wallet?.address ?? 'Vincule uma carteira primeiro.'}
              </small>
            </span>
          </label>
        );
      })}
      <Button
        className="button outline"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          try {
            await api(`/campaigns/${campaign.id}/payment-receivers`, {
              method: 'PUT',
              body: JSON.stringify({ networks }),
            });
            setMessage('Destinatários salvos. Pedidos anteriores conservam o endereço original.');
            onSaved();
          } catch (err) {
            setMessage((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Salvar carteiras da campanha
      </Button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
