import { useEffect, useState } from 'react';
import type { Campaign, Report, Overlay } from '../types';
import { api, money } from '../lib/api';
import { Button, ExternalLink } from '../components/ui';
import { statusLabel } from '../lib/status';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileCheck2,
  Flag,
  Plus,
  ShieldCheck,
  Wallet,
  Radio,
  LoaderCircle,
  Pause,
  Play,
  LogOut,
  Layers,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { anchorHistory } from '../lib/wallet';

export default function Admin({
  epoch,
  refresh,
  show,
  notify,
}: {
  epoch: number;
  refresh: () => void;
  show: (overlay: Overlay) => void;
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<{
    campaigns: Campaign[];
    reports: Report[];
    demo: boolean;
  } | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [id, setId] = useState('');
  const [anchoring, setAnchoring] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ campaigns: Campaign[]; reports: Report[]; demo: boolean }>('/admin')
      .then((value) => {
        if (active) {
          setData(value);
          setError('');
        }
      })
      .catch((err) => {
        if (active) {
          setData(null);
          if (!err.message.includes('Entre no painel')) setError(err.message);
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [epoch]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/session', { method: 'POST', body: JSON.stringify({ password }) });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api('/admin/session', { method: 'DELETE', body: '{}' });
      setData(null);
      refresh();
    } catch (err) {
      notify((err as Error).message);
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
  if (!data)
    return (
      <div className="page-width login-page">
        <div className="login-copy">
          <span className="eyebrow small">QUEM ORGANIZA TAMBÉM CUIDA</span>
          <h1>
            Boas causas.
            <br />
            <span>Contas em dia.</span>
          </h1>
          <p>
            Crie uma campanha, envie uma evidência e acompanhe as liberações. O painel reúne o fluxo
            de organização e revisão desta demonstração.
          </p>
          <div className="login-feature">
            <ShieldCheck size={22} />
            <span>Nenhuma saída sem evidência analisada.</span>
          </div>
          <div className="login-feature">
            <Layers size={22} />
            <span>Cada decisão deixa um registro.</span>
          </div>
        </div>
        <form className="login-card form-stack" onSubmit={login}>
          <span className="login-icon">
            <Wallet size={29} />
          </span>
          <h2>Entre no painel.</h2>
          <p>
            No acesso local, você pode experimentar sem senha. Para acesso remoto, use a senha
            configurada no servidor.
          </p>
          <label>
            Senha do painel
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Opcional na demonstração local"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button className="button primary full" busy={busy}>
            Entrar na demonstração <ArrowRight size={17} />
          </Button>
          <small>Use dados fictícios. Não envie documentos pessoais.</small>
        </form>
      </div>
    );
  const campaign = data.campaigns.find((item) => item.id === id) ?? data.campaigns[0];
  const pending = data.campaigns.flatMap((item) =>
    item.expenses.filter((expense) => expense.status === 'pending'),
  );
  const reports = data.reports.filter((report) => report.status === 'pending');
  return (
    <div className="page-width admin-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow small">PAINEL DA DEMONSTRAÇÃO</span>
          <h1>Cuidar também é prestar contas.</h1>
          <p>Organização e revisão em um único ambiente de testes.</p>
        </div>
        <div className="admin-actions">
          <button className="button outline" onClick={logout}>
            <LogOut size={16} /> Sair
          </button>
          <Button
            className="button primary"
            disabled={!data.demo}
            onClick={() => show({ type: 'create' })}
          >
            <Plus size={17} /> Nova campanha
          </Button>
        </div>
      </div>
      <div className="admin-summary">
        <div>
          <span>Campanhas</span>
          <strong>{data.campaigns.length}</strong>
        </div>
        <div>
          <span>Liberações aguardando análise</span>
          <strong>{pending.length}</strong>
        </div>
        <div>
          <span>Denúncias pendentes</span>
          <strong>{reports.length}</strong>
        </div>
        <div>
          <span>Saldo demonstrativo</span>
          <strong>{money(data.campaigns.reduce((sum, item) => sum + item.balance, 0))}</strong>
        </div>
      </div>
      <div className="admin-panel">
        <div className="section-row">
          <h2>Suas campanhas</h2>
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
        </div>
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
              ) : campaign.status === 'active' ? (
                <button
                  className="button outline"
                  disabled={!data.demo}
                  onClick={() => show({ type: 'status', campaign, status: 'frozen' })}
                >
                  <Pause size={16} /> Suspender para análise
                </button>
              ) : campaign.status === 'frozen' ? (
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
              Ancoragem real na devnet: configure a Phantom para Solana devnet e use SOL de teste
              para a taxa. Somente o hash é registrado; nenhum valor é transferido para a campanha.
            </p>
            <ExternalLink href="https://faucet.solana.com/">Obter SOL de teste</ExternalLink>
          </>
        )}
      </div>
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
                  {data.campaigns.find((item) => item.id === expense.campaignId)?.shortTitle} ·{' '}
                  {money(expense.amount)}
                </p>
                <button className="text-link" onClick={() => show({ type: 'proof', expense })}>
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
    </div>
  );
}
