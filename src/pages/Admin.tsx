import { useEffect, useRef, useState } from 'react';
import type { Campaign, Report, Overlay } from '../types';
import { api, ApiError, money } from '../lib/api';
import { Button, ExternalLink } from '../components/ui';
import { statusLabel } from '../lib/status';
import {
  ArrowUpRight,
  Check,
  FileCheck2,
  Flag,
  Plus,
  ShieldCheck,
  Radio,
  LoaderCircle,
  Pause,
  Play,
  LogOut,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { anchorHistory } from '../lib/wallet';
import AccountAccess from '../components/AccountAccess';
import Profile from './Profile';

export default function Admin({
  epoch,
  refresh,
  show,
  notify,
  profile = false,
}: {
  epoch: number;
  refresh: () => void;
  show: (overlay: Overlay) => void;
  notify: (message: string) => void;
  profile?: boolean;
}) {
  const [data, setData] = useState<{
    campaigns: Campaign[];
    reports: Report[];
    demo: boolean;
    user: { id: string | null; name: string; email?: string; role: 'admin' | 'organizer' };
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [revision, setRevision] = useState(0);
  const hadSession = useRef(false);
  const [id, setId] = useState('');
  const [anchoring, setAnchoring] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setUnavailable(false);
    api<NonNullable<typeof data>>('/admin')
      .then((value) => {
        if (active) {
          setData(value);
          hadSession.current = true;
          setError('');
        }
      })
      .catch((err) => {
        if (active) {
          setData(null);
          if (err instanceof ApiError && err.status === 401) {
            if (hadSession.current)
              setError('Sua sessão terminou. Entre novamente para continuar.');
            hadSession.current = false;
          } else {
            setUnavailable(true);
            setError(err.message);
          }
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [epoch, revision]);
  async function logout() {
    setBusy(true);
    try {
      await api('/auth/session', { method: 'DELETE', body: '{}' });
      hadSession.current = false;
      setError('');
      setData(null);
      refresh();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function anchor(campaign: Campaign) {
    setAnchoring(true);
    try {
      await anchorHistory(campaign.id);
      refresh();
      notify('Hash confirmado na Solana devnet. A transação já está no registro público.');
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setAnchoring(false);
    }
  }

  if (loading)
    return (
      <div className="loading-state">
        <LoaderCircle className="spin" /> Abrindo seu painel...
      </div>
    );
  if (!data && unavailable)
    return (
      <div className="empty-state">
        <h2>Não conseguimos abrir seu painel.</h2>
        <p role="alert">{error}</p>
        <Button className="button primary" onClick={() => setRevision((value) => value + 1)}>
          Tentar novamente
        </Button>
      </div>
    );
  if (!data)
    return (
      <AccountAccess
        notice={error}
        onSignedIn={(code) => {
          if (code) show({ type: 'recoveryCode', code });
          setLoading(true);
          setRevision((value) => value + 1);
        }}
      />
    );
  const moderating = data.user.role === 'admin';
  const showingProfile = profile && !moderating;
  const campaign = data.campaigns.find((item) => item.id === id) ?? data.campaigns[0];
  const pending = data.campaigns.flatMap((item) =>
    item.expenses.filter((expense) => expense.status === 'pending'),
  );
  const reports = data.reports.filter((report) => report.status === 'pending');
  return (
    <div className="page-width admin-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow small">
            {moderating ? 'PAINEL DA MODERAÇÃO' : `OLÁ, ${data.user.name}`}
          </span>
          <h1>
            {showingProfile ? 'Seu perfil. Suas conexões.' : 'Cuidar também é prestar contas.'}
          </h1>
          <p>
            {moderating
              ? 'Revise campanhas, solicitações e denúncias da demonstração.'
              : 'Organize suas campanhas e acompanhe a análise das solicitações.'}
          </p>
        </div>
        <div className="admin-actions">
          <Button className="button outline" onClick={logout} busy={busy}>
            <LogOut size={16} /> Sair
          </Button>
          <Button
            className="button primary"
            disabled={!data.demo || busy}
            onClick={() => show({ type: 'create' })}
          >
            <Plus size={17} /> Nova campanha
          </Button>
        </div>
      </div>
      {!moderating && (
        <nav className="panel-navigation" aria-label="Navegação do painel">
          <a href="#/painel" aria-current={!showingProfile ? 'page' : undefined}>
            Minhas campanhas
          </a>
          <a href="#/perfil" aria-current={showingProfile ? 'page' : undefined}>
            Perfil e carteiras
          </a>
        </nav>
      )}
      {showingProfile ? (
        <Profile user={data.user} refresh={refresh} show={show} notify={notify} />
      ) : (
        <>
          <div className={`admin-summary${moderating ? '' : ' participant'}`}>
            <div>
              <span>Campanhas</span>
              <strong>{data.campaigns.length}</strong>
            </div>
            <div>
              <span>Liberações aguardando análise</span>
              <strong>{pending.length}</strong>
            </div>
            {moderating && (
              <div>
                <span>Denúncias pendentes</span>
                <strong>{reports.length}</strong>
              </div>
            )}
            <div>
              <span>Saldo demonstrativo</span>
              <strong>{money(data.campaigns.reduce((sum, item) => sum + item.balance, 0))}</strong>
            </div>
          </div>
          <div className="admin-panel">
            <div className="section-row">
              <h2>{moderating ? 'Campanhas para acompanhar' : 'Suas campanhas'}</h2>
              {campaign && (
                <select
                  aria-label="Selecionar campanha no painel"
                  value={campaign?.id ?? ''}
                  onChange={(event) => setId(event.target.value)}
                >
                  {data.campaigns.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.shortTitle}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {!campaign && (
              <div className="admin-empty">
                <Plus size={25} />
                <strong>Sua primeira causa começa aqui.</strong>
                <p>Use “Nova campanha” para criar um rascunho demonstrativo.</p>
              </div>
            )}
            {campaign && (
              <>
                <div className="admin-campaign">
                  <img src={campaign.image} alt="" />
                  <div>
                    <span className={`status-badge ${campaign.status}`}>
                      <i />
                      {statusLabel[campaign.status]}
                    </span>
                    <h3>{campaign.shortTitle}</h3>
                    <p>
                      {campaign.organization} · {campaign.location}
                    </p>
                  </div>
                  <a href={`#/campanha/${campaign.id}`} className="text-link">
                    Abrir campanha <ArrowUpRight size={15} />
                  </a>
                </div>
                <div className="admin-money">
                  <div>
                    <span>Saldo</span>
                    <strong>{money(campaign.balance)}</strong>
                  </div>
                  <div>
                    <span>Reservado para análise</span>
                    <strong>{money(campaign.pending)}</strong>
                  </div>
                  <div>
                    <span>Disponível para solicitar</span>
                    <strong>{money(campaign.balance - campaign.pending)}</strong>
                  </div>
                </div>
                <div className="admin-toolbar">
                  <Button
                    className="button primary"
                    disabled={campaign.status !== 'active' || !data.demo}
                    onClick={() => show({ type: 'expense', campaign })}
                  >
                    <FileCheck2 size={17} /> Solicitar liberação
                  </Button>
                  <Button
                    className="button outline"
                    busy={anchoring}
                    onClick={() => anchor(campaign)}
                    disabled={campaign.status === 'draft'}
                  >
                    <Radio size={17} /> Registrar hash na Solana
                  </Button>
                  {campaign.status === 'draft' ? (
                    <button
                      className="button outline"
                      disabled={!data.demo}
                      onClick={() => show({ type: 'status', campaign, status: 'active' })}
                    >
                      <Play size={16} /> Publicar demonstração
                    </button>
                  ) : moderating && campaign.status === 'active' ? (
                    <button
                      className="button outline"
                      disabled={!data.demo}
                      onClick={() => show({ type: 'status', campaign, status: 'frozen' })}
                    >
                      <Pause size={16} /> Suspender para análise
                    </button>
                  ) : moderating && campaign.status === 'frozen' ? (
                    <button
                      className="button outline"
                      disabled={!data.demo}
                      onClick={() => show({ type: 'status', campaign, status: 'active' })}
                    >
                      <Play size={16} /> Retomar campanha
                    </button>
                  ) : null}
                </div>
                <p className="privacy-note">
                  Ancoragem real na devnet: configure a Phantom para Solana devnet e use SOL de
                  teste para a taxa. Somente o hash é registrado; nenhum valor é transferido para a
                  campanha.
                </p>
                <ExternalLink href="https://faucet.solana.com/">Obter SOL de teste</ExternalLink>
              </>
            )}
          </div>
          {moderating ? (
            <div className="admin-panel">
              <div className="section-row">
                <h2>Liberações para revisar</h2>
                <span className="count-pill">{pending.length}</span>
              </div>
              {pending.length === 0 ? (
                <div className="admin-empty">
                  <CheckCircle2 size={25} />
                  <strong>Tudo em dia por aqui.</strong>
                  <p>Os novos pedidos aparecerão aqui com sua evidência.</p>
                </div>
              ) : (
                pending.map((expense) => (
                  <div className="review-row" key={expense.id}>
                    <span className="proof-icon">
                      <FileText size={23} />
                    </span>
                    <div>
                      <h3>{expense.title}</h3>
                      <p>
                        {data.campaigns.find((item) => item.id === expense.campaignId)?.shortTitle}{' '}
                        · {money(expense.amount)}
                      </p>
                      <button
                        className="text-link"
                        onClick={() => show({ type: 'proof', expense })}
                      >
                        Conferir evidência <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <div className="review-actions">
                      <button
                        className="button outline"
                        onClick={() => show({ type: 'decision', expense, approved: false })}
                      >
                        Recusar
                      </button>
                      <button
                        className="button primary"
                        onClick={() => show({ type: 'decision', expense, approved: true })}
                      >
                        <Check size={16} /> Aprovar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="admin-panel">
              <h2>Solicitações enviadas</h2>
              {data.campaigns.flatMap((item) => item.expenses).length === 0 ? (
                <p className="muted">
                  As solicitações de liberação das suas campanhas aparecerão aqui para
                  acompanhamento.
                </p>
              ) : (
                data.campaigns
                  .flatMap((item) => item.expenses)
                  .map((expense) => (
                    <div className="review-row" key={expense.id}>
                      <FileCheck2 size={23} />
                      <div>
                        <h3>{expense.title}</h3>
                        <p>
                          {money(expense.amount)} ·{' '}
                          {expense.status === 'pending'
                            ? 'Aguardando moderação'
                            : expense.status === 'approved'
                              ? 'Aprovada'
                              : 'Recusada'}
                        </p>
                        {expense.reason && <p>{expense.reason}</p>}
                        <button
                          className="text-link"
                          onClick={() => show({ type: 'proof', expense })}
                        >
                          Conferir evidência <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}
          {moderating && (
            <div className="admin-panel">
              <div className="section-row">
                <h2>Denúncias para analisar</h2>
                <span className="count-pill">{reports.length}</span>
              </div>
              {reports.length === 0 ? (
                <div className="admin-empty">
                  <ShieldCheck size={25} />
                  <p>Nenhuma denúncia pendente.</p>
                </div>
              ) : (
                reports.map((report) => (
                  <div className="report-row" key={report.id}>
                    <Flag size={20} />
                    <div>
                      <strong>
                        {data.campaigns.find((item) => item.id === report.campaignId)?.shortTitle}
                      </strong>
                      <p>{report.reason}</p>
                      <small>
                        Protocolo: {report.id}
                        {report.expenseId ? ` · Gasto: ${report.expenseId}` : ''}
                      </small>
                    </div>
                    <button
                      className="button outline"
                      onClick={() => show({ type: 'reportDecision', report })}
                    >
                      Registrar análise
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
