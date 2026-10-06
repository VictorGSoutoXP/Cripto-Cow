import { useEffect, useState } from 'react';
import { ArrowUpRight, CircleCheck, LockKeyhole, Menu, X, LoaderCircle } from 'lucide-react';
import { api } from './lib/api';
import { Logo, Button } from './components/ui';
import { CampaignForm, DonationForm, ExpenseForm, ReportForm } from './components/forms';
import { Proof, Decision, About } from './components/overlays';
import Home from './pages/Home';
import CampaignPage from './pages/CampaignPage';
import Admin from './pages/Admin';
import type { Campaign, Overlay } from './types';

type View = 'home' | 'transparency' | 'admin' | 'campaign';

function useRoute() {
  const read = () => {
    const parts = window.location.hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'campanha' && parts[1]) return { view: 'campaign' as View, id: parts[1] };
    return {
      view:
        parts[0] === 'transparencia'
          ? ('transparency' as View)
          : parts[0] === 'painel'
            ? ('admin' as View)
            : ('home' as View),
      id: '',
    };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const change = () => {
      setRoute(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [demo, setDemo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState('');
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ campaigns: Campaign[]; demo: boolean }>('/campaigns')
      .then((data) => {
        if (active) {
          setCampaigns(data.campaigns);
          setDemo(data.demo);
          setError('');
        }
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [epoch]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const refresh = () => setEpoch((value) => value + 1);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Logo />
          <nav className={menu ? 'navigation open' : 'navigation'} aria-label="Navegação principal">
            <a
              onClick={() => setMenu(false)}
              className={route.view === 'home' || route.view === 'campaign' ? 'active' : ''}
              href="#/"
            >
              Explorar causas
            </a>
            <a
              onClick={() => setMenu(false)}
              className={route.view === 'transparency' ? 'active' : ''}
              href="#/transparencia"
            >
              Transparência
            </a>
            <button
              onClick={() => {
                setMenu(false);
                setOverlay({ type: 'info' });
              }}
            >
              Como funciona <ArrowUpRight size={14} />
            </button>
          </nav>
          <div className="header-actions">
            <span className="network-indicator">
              <i /> Solana devnet
            </span>
            <a href="#/painel" className="button header-button">
              Meu painel <ArrowUpRight size={16} />
            </a>
            <button
              className="icon-button mobile-menu"
              aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <div className="demo-bar">
        <div>
          <span className="demo-pill">MVP</span>
          {demo
            ? 'Um protótipo de um futuro mais transparente. Campanhas e valores demonstrativos.'
            : 'Pagamentos desativados. Este protótipo ainda não recebe dinheiro real.'}
          <span className="demo-bar-right">
            <LockKeyhole size={12} /> Nenhum dinheiro real é movimentado
          </span>
        </div>
      </div>
      <main>
        {loading ? (
          <div className="loading-state">
            <LoaderCircle className="spin" /> Carregando as causas...
          </div>
        ) : error ? (
          <div className="empty-state">
            <h2>Não conseguimos carregar as campanhas.</h2>
            <p>{error}</p>
            <Button className="button primary" onClick={refresh}>
              Tentar novamente
            </Button>
          </div>
        ) : route.view === 'home' ? (
          <Home
            campaigns={campaigns}
            onCreate={() => {
              window.location.hash = '/painel';
              setNotice('Entre no painel para criar sua campanha demonstrativa.');
            }}
            onInfo={() => setOverlay({ type: 'info' })}
          />
        ) : route.view === 'admin' ? (
          <Admin epoch={epoch} refresh={refresh} show={setOverlay} notify={setNotice} />
        ) : (
          <CampaignPage
            campaignId={route.id || campaigns[0]?.id}
            campaigns={campaigns}
            transparency={route.view === 'transparency'}
            epoch={epoch}
            show={setOverlay}
            notify={setNotice}
            demo={demo}
          />
        )}
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            <Logo />
            <p>
              Confiança se constrói.
              <br />
              Transparência também.
            </p>
          </div>
          <div className="footer-links">
            <a href="#/">Explorar causas</a>
            <a href="#/transparencia">Registro público</a>
            <button onClick={() => setOverlay({ type: 'info' })}>Sobre o protótipo</button>
          </div>
          <div className="footer-note">
            <span>Construído para conectar pessoas e causas.</span>
            <span>
              Cripto Cow · MVP 2026 <span className="solana-symbol">≋</span> Solana
            </span>
          </div>
        </div>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <CircleCheck size={19} />
          <span>{notice}</span>
          <button className="icon-button" aria-label="Fechar aviso" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {overlay?.type === 'donation' && (
        <DonationForm
          campaign={overlay.campaign}
          onClose={() => setOverlay(null)}
          onSaved={refresh}
        />
      )}
      {overlay?.type === 'create' && (
        <CampaignForm
          onClose={() => setOverlay(null)}
          onSaved={() => {
            refresh();
            setNotice('Campanha criada. Publique-a após revisar as informações no painel.');
          }}
        />
      )}
      {overlay?.type === 'expense' && (
        <ExpenseForm
          campaign={overlay.campaign}
          onClose={() => setOverlay(null)}
          onSaved={() => {
            refresh();
            setNotice(
              'Evidência enviada para análise. O saldo foi reservado, sem registrar saída.',
            );
          }}
        />
      )}
      {overlay?.type === 'report' && (
        <ReportForm
          campaignId={overlay.campaignId}
          expense={overlay.expense}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.type === 'proof' && (
        <Proof
          expense={overlay.expense}
          onClose={() => setOverlay(null)}
          onReport={() =>
            setOverlay({
              type: 'report',
              campaignId: overlay.expense.campaignId,
              expense: overlay.expense,
            })
          }
        />
      )}
      {overlay?.type === 'info' && <About onClose={() => setOverlay(null)} />}
      {overlay && ['decision', 'status', 'reportDecision'].includes(overlay.type) && (
        <Decision
          overlay={overlay}
          onClose={() => setOverlay(null)}
          onSaved={() => {
            refresh();
            setNotice('Decisão registrada no painel.');
          }}
        />
      )}
    </div>
  );
}
