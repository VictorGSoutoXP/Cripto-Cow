import { useEffect, useState } from 'react';
import type { Campaign, LedgerEntry, Overlay } from '../types';
import { api, date, money } from '../lib/api';
import { Button, Progress, ExternalLink } from '../components/ui';
import { statusLabel } from '../lib/status';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Copy,
  Download,
  FileCheck2,
  Flag,
  Heart,
  LockKeyhole,
  ShieldCheck,
  Sprout,
  Users,
  CircleArrowOutUpRight,
  Radio,
  LoaderCircle,
  Pause,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { verifyInBrowser } from '../lib/verify';

export default function CampaignPage({
  campaignId,
  campaigns,
  transparency,
  epoch,
  show,
  notify,
  demo,
}: {
  campaignId: string;
  campaigns: Campaign[];
  transparency: boolean;
  epoch: number;
  show: (overlay: Overlay) => void;
  notify: (message: string) => void;
  demo: boolean;
}) {
  const [id, setId] = useState(campaignId);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(transparency ? 'budget' : 'timeline');
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(12);
  const [checking, setChecking] = useState(false);
  useEffect(() => setId(campaignId), [campaignId]);
  useEffect(() => {
    setTab(transparency ? 'budget' : 'timeline');
  }, [transparency]);
  useEffect(() => {
    let active = true;
    setError('');
    if (!id) {
      setError('Não há campanhas publicadas.');
      return;
    }
    api<Campaign>(`/campaigns/${id}`)
      .then((data) => active && setCampaign(data))
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [id, epoch]);
  useEffect(() => {
    setLimit(12);
    setFilter('all');
  }, [id, tab]);

  async function check() {
    if (!campaign) return;
    setChecking(true);
    try {
      const result = await verifyInBrowser(campaign.ledger);
      for (const anchor of campaign.anchors) {
        const prefix = await verifyInBrowser(campaign.ledger.slice(0, anchor.count));
        if (prefix.root !== anchor.root)
          throw new Error('Um hash registrado na Solana não corresponde a este histórico.');
      }
      notify(
        `${result.count} registros conferidos no seu navegador. Histórico íntegro${campaign.anchors.length ? ' e compatível com o hash ancorado.' : '. Ainda sem ancoragem na Solana.'}`,
      );
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  if (error)
    return (
      <div className="page-width empty-state">
        <h2>{error}</h2>
        <a href="#/" className="text-link">
          Voltar às causas <ArrowRight size={17} />
        </a>
      </div>
    );
  if (!campaign || campaign.id !== id)
    return (
      <div className="loading-state">
        <LoaderCircle className="spin" /> Carregando a campanha...
      </div>
    );
  const timeline = [...campaign.ledger]
    .reverse()
    .filter((entry) =>
      filter === 'all'
        ? [
            'donation',
            'release',
            'expense_requested',
            'expense_rejected',
            'campaign_created',
            'campaign_frozen',
            'campaign_active',
          ].includes(entry.type)
        : entry.type === filter,
    );
  const percentage = Math.round((campaign.raised / campaign.goal) * 100);
  return (
    <div className="page-width campaign-page">
      <div className="breadcrumb">
        <a href="#/">Explorar causas</a>
        <ChevronRight size={14} />
        <span>{transparency ? 'Transparência' : campaign.shortTitle}</span>
      </div>
      {transparency && (
        <div className="transparency-header">
          <div>
            <span className="eyebrow small">UM HISTÓRICO QUE VOCÊ PODE CONFERIR</span>
            <h1>O caminho de cada doação.</h1>
            <p>Orçamento, gastos e comprovantes. Tudo no mesmo lugar.</p>
          </div>
          <label className="campaign-select">
            Escolha uma causa
            <select value={id} onChange={(event) => setId(event.target.value)}>
              {campaigns.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.shortTitle}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="campaign-layout">
        <div className="campaign-main">
          {!transparency && (
            <div className="campaign-cover">
              <img src={campaign.image} alt={`Imagem ilustrativa de ${campaign.shortTitle}`} />
              <span className="tag">{campaign.category}</span>
            </div>
          )}
          <div className="campaign-title">
            <div className="section-row">
              <span className="eyebrow small">
                {campaign.category.toUpperCase()} · {campaign.location.toUpperCase()}
              </span>
              <span className={`status-badge ${campaign.status}`}>
                <i />
                {statusLabel[campaign.status]}
              </span>
            </div>
            <h1>{transparency ? campaign.shortTitle : campaign.title}</h1>
            <div className="organizer">
              <span className="organizer-avatar">
                <Sprout size={19} />
              </span>
              <div>
                <strong>{campaign.organization}</strong>
                <span>Organização fictícia · identidade não verificada</span>
              </div>
            </div>
            <p>{campaign.description}</p>
            {campaign.status === 'frozen' && (
              <div className="warning-box">
                <Pause size={20} />
                <div>
                  <strong>Liberações e doações suspensas durante a análise.</strong>
                  <p>{campaign.statusReason}</p>
                </div>
              </div>
            )}
          </div>
          <div className="campaign-stat-grid">
            <div>
              <span>Total arrecadado</span>
              <strong>{money(campaign.raised)}</strong>
            </div>
            <div>
              <span>Saídas com evidência</span>
              <strong>{money(campaign.released)}</strong>
            </div>
            <div>
              <span>Saldo da campanha</span>
              <strong>{money(campaign.balance)}</strong>
            </div>
          </div>
          <div className="detail-tabs" role="tablist" aria-label="Dados da campanha">
            {[
              ['timeline', 'Movimentações'],
              ['budget', 'Orçamento'],
              ['proofs', 'Comprovantes'],
              ['ledger', 'Registro verificável'],
            ].map(([key, label]) => (
              <button
                role="tab"
                aria-selected={tab === key}
                aria-controls={`panel-${key}`}
                id={`tab-${key}`}
                key={key}
                className={tab === key ? 'active' : ''}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className="tab-content"
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            {tab === 'timeline' && (
              <>
                <div className="section-row">
                  <h2>Uma história feita de gestos.</h2>
                  <select
                    aria-label="Filtrar movimentações"
                    className="compact-select"
                    value={filter}
                    onChange={(event) => {
                      setFilter(event.target.value);
                      setLimit(12);
                    }}
                  >
                    <option value="all">Todas as movimentações</option>
                    <option value="donation">Doações</option>
                    <option value="release">Liberações</option>
                    <option value="expense_requested">Pedidos de liberação</option>
                  </select>
                </div>
                <div className="timeline">
                  {timeline.slice(0, limit).map((entry) => (
                    <TimelineItem entry={entry} campaign={campaign} show={show} key={entry.id} />
                  ))}
                </div>
                {timeline.length === 0 && (
                  <p className="muted">Nenhuma movimentação neste filtro.</p>
                )}
                {timeline.length > limit && (
                  <button className="button outline full" onClick={() => setLimit(limit + 20)}>
                    Ver mais movimentações
                  </button>
                )}
              </>
            )}
            {tab === 'budget' && (
              <>
                <div className="section-row">
                  <h2>Planejado e realizado.</h2>
                  <span className="chart-legend">
                    <i /> Planejado <i /> Executado
                  </span>
                </div>
                <p className="muted">Cada saída aprovada pertence a uma categoria do orçamento.</p>
                <div className="budget-chart">
                  {campaign.budget.map((item) => (
                    <div className="budget-category" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>
                          {money(item.spent)} <small>de {money(item.planned)}</small>
                        </span>
                      </div>
                      <div className="budget-track">
                        <span style={{ width: `${(item.spent / item.planned) * 100}%` }} />
                      </div>
                      <small>
                        {Math.round((item.spent / item.planned) * 100)}% do orçamento executado
                      </small>
                    </div>
                  ))}
                </div>
                <div className="budget-total">
                  <span>Orçamento total</span>
                  <strong>{money(campaign.goal)}</strong>
                </div>
                <div className="rule-box">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>A sobra já tem destino.</strong>
                    <p>
                      {campaign.surplusRule}. A regra aparece antes de cada doação. Devoluções reais
                      dependem do parceiro de pagamento.
                    </p>
                  </div>
                </div>
              </>
            )}
            {tab === 'proofs' && (
              <>
                <h2>O gasto tem uma evidência.</h2>
                <p className="muted">
                  Documentos demonstrativos. Sem informações pessoais e sem validação fiscal
                  oficial.
                </p>
                <div className="proof-list">
                  {campaign.expenses.map((expense) => (
                    <button
                      className="proof-row"
                      key={expense.id}
                      onClick={() => show({ type: 'proof', expense })}
                    >
                      <span className="proof-icon">
                        <FileText size={22} />
                      </span>
                      <span>
                        <strong>{expense.title}</strong>
                        <small>
                          {date(expense.createdAt)} · Nível {expense.evidenceLevel} ·{' '}
                          {expense.status === 'approved'
                            ? 'Analisado na demonstração'
                            : expense.status === 'pending'
                              ? 'Aguardando análise'
                              : 'Recusado'}
                        </small>
                      </span>
                      <strong>{money(expense.amount)}</strong>
                      <ArrowUpRight size={18} />
                    </button>
                  ))}
                </div>
                {!campaign.expenses.length && (
                  <div className="empty-state">
                    <FileText size={27} />
                    <p>Nenhum comprovante enviado ainda.</p>
                  </div>
                )}
                <div className="evidence-key">
                  <strong>O que cada nível significa?</strong>
                  <p>
                    <b>A</b> Pagamento direto confirmado pelo parceiro. <b>B</b> Nota fiscal
                    validada em base oficial. <b>C</b> Documento sem validação oficial. <b>D</b>{' '}
                    Declaração, foto ou vídeo.
                  </p>
                  <span>
                    Este MVP demonstra evidências nível C. Um hash confirma a integridade do
                    registro; não confirma a veracidade do comprovante.
                  </span>
                </div>
              </>
            )}
            {tab === 'ledger' && (
              <>
                <div className="section-row">
                  <h2>Confiança, registro por registro.</h2>
                  <span className="tag green">
                    <CheckCircle2 size={14} />
                    {campaign.integrity.valid ? 'Cadeia íntegra' : 'Inconsistência'}
                  </span>
                </div>
                <p className="muted">
                  Cada evento carrega o hash do anterior. Você pode recalcular os hashes no seu
                  navegador ou baixar o histórico e conferir por conta própria.
                </p>
                <div className="ledger-summary">
                  <div>
                    <span>Registros encadeados</span>
                    <strong>{campaign.integrity.count}</strong>
                  </div>
                  <div>
                    <span>Rede de ancoragem</span>
                    <strong>Solana devnet</strong>
                  </div>
                  <div>
                    <span>Última ancoragem</span>
                    <strong>
                      {campaign.anchors.length
                        ? `${campaign.anchors.at(-1)!.count} registros`
                        : 'Ainda não realizada'}
                    </strong>
                  </div>
                </div>
                <label className="hash-label">
                  Hash atual do histórico
                  <div>
                    <code>{campaign.integrity.root}</code>
                    <button
                      className="icon-button"
                      aria-label="Copiar hash"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(campaign.integrity.root)
                          .then(() => notify('Hash copiado.'))
                          .catch(() =>
                            notify('Não foi possível copiar. Selecione o hash para copiá-lo.'),
                          )
                      }
                    >
                      <Copy size={17} />
                    </button>
                  </div>
                </label>
                <div className="ledger-actions">
                  <Button className="button primary" busy={checking} onClick={check}>
                    <ShieldCheck size={17} /> Conferir no navegador
                  </Button>
                  <a
                    className="button outline"
                    href={`/api/campaigns/${campaign.id}/ledger`}
                    download
                  >
                    <Download size={17} /> Baixar histórico
                  </a>
                </div>
                {campaign.anchors.length > 0 ? (
                  <div className="anchor-list">
                    {campaign.anchors.map((anchor) => (
                      <div key={anchor.id}>
                        <Radio size={18} />
                        <span>
                          <strong>Hash registrado na Solana</strong>
                          <small>
                            {date(anchor.confirmedAt)} · {anchor.count} registros · bloco{' '}
                            {anchor.slot}
                          </small>
                        </span>
                        <ExternalLink href={anchor.explorerUrl}>Conferir transação</ExternalLink>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rule-box">
                    <Radio size={20} />
                    <div>
                      <strong>O histórico ainda não foi ancorado.</strong>
                      <p>
                        O administrador pode registrar seu hash na Solana usando uma carteira de
                        testes. Só mostramos uma confirmação depois de consultar a transação na
                        rede.
                      </p>
                    </div>
                  </div>
                )}
                <p className="privacy-note">
                  <LockKeyhole size={14} /> A blockchain recebe somente o identificador da campanha
                  e o hash do histórico. Comprovantes, relatos e dados pessoais ficam fora da rede.
                </p>
              </>
            )}
          </div>
        </div>
        <aside className="campaign-sidebar">
          <div className="donation-card">
            <span className="eyebrow small">UM GESTO QUE VIRA AÇÃO</span>
            <h2>{money(campaign.raised)}</h2>
            <p>arrecadados de uma meta de {money(campaign.goal)}</p>
            <Progress value={percentage} label="Progresso da campanha" />
            <div className="donation-meta">
              <span>
                <Users size={16} />
                {campaign.donors} apoios
              </span>
              <strong>{percentage}% da meta</strong>
            </div>
            <Button
              className="button primary full"
              disabled={
                campaign.status !== 'active' ||
                !demo ||
                new Date(`${campaign.deadline}T23:59:59-03:00`) < new Date()
              }
              onClick={() => show({ type: 'donation', campaign })}
            >
              <Heart size={18} /> Apoiar esta causa
            </Button>
            <small>Doação simulada. Nenhuma cobrança.</small>
            <div className="sidebar-rule">
              <ShieldCheck size={22} />
              <div>
                <strong>Liberação com prestação de contas</strong>
                <p>{campaign.releaseRule}.</p>
              </div>
            </div>
            <div className="sidebar-deadline">
              <span>Campanha até</span>
              <strong>{date(campaign.deadline)}</strong>
            </div>
          </div>
          <div className="care-note">
            <Sprout size={22} />
            <h3>Acompanhar também é cuidar.</h3>
            <p>Confira a evidência de um gasto. Se algo não fizer sentido, peça uma análise.</p>
            <button
              className="text-link"
              onClick={() => show({ type: 'report', campaignId: campaign.id })}
            >
              <Flag size={15} /> Denunciar campanha
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TimelineItem({
  entry,
  campaign,
  show,
}: {
  entry: LedgerEntry;
  campaign: Campaign;
  show: (overlay: Overlay) => void;
}) {
  const expense = campaign.expenses.find((item) => item.id === entry.referenceId);
  const incoming = entry.type === 'donation';
  const outgoing = entry.type === 'release';
  const title = incoming
    ? 'Uma nova doação chegou'
    : (expense?.title ??
      (entry.type === 'campaign_created'
        ? 'A campanha começou'
        : entry.type === 'campaign_frozen'
          ? 'Campanha em análise'
          : entry.type === 'campaign_active'
            ? 'Campanha ativa'
            : 'Atualização do histórico'));
  const subtitle = incoming
    ? 'Apoio anônimo · demonstração'
    : outgoing
      ? `${expense?.supplier ?? 'Fornecedor demonstrativo'} · evidência nível ${entry.evidenceLevel}`
      : entry.type === 'expense_requested'
        ? 'Pedido enviado, aguardando análise'
        : entry.type === 'expense_rejected'
          ? 'Pedido de liberação recusado'
          : 'Registro público da campanha';
  return (
    <div className="timeline-item">
      <span className={`timeline-icon ${incoming ? 'incoming' : outgoing ? 'outgoing' : ''}`}>
        {incoming ? (
          <Heart size={17} />
        ) : outgoing ? (
          <CircleArrowOutUpRight size={18} />
        ) : (
          <FileCheck2 size={17} />
        )}
      </span>
      <div className="timeline-copy">
        <strong>{title}</strong>
        <p>{subtitle}</p>
        <small>
          {date(entry.createdAt)} · registro #{entry.sequence}
        </small>
        {expense && (
          <button className="text-link" onClick={() => show({ type: 'proof', expense })}>
            Abrir evidência <ArrowUpRight size={13} />
          </button>
        )}
      </div>
      {entry.amount > 0 && (
        <strong className={`timeline-amount ${incoming ? 'positive' : ''}`}>
          {incoming ? '+' : '−'} {money(entry.amount)}
        </strong>
      )}
    </div>
  );
}
