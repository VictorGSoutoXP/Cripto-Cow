import { useState } from 'react';
import {
  Heart,
  Plus,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  LockKeyhole,
  LoaderCircle,
} from 'lucide-react';
import { api, ApiError, cents, date, money } from '../lib/api';
import { useLegalManifest } from '../lib/legal';
import type { LegalRole } from '../lib/legal';
import { Modal, Button } from './ui';
import type { Campaign, Donor, Expense } from '../types';

function LegalAcceptance({
  legal,
  role,
  accepted,
  onAccepted,
  busy,
}: {
  legal: ReturnType<typeof useLegalManifest>;
  role: LegalRole;
  accepted: boolean;
  onAccepted: (value: boolean) => void;
  busy: boolean;
}) {
  const consent = legal.manifest?.acceptance[role];
  const documents = legal.manifest?.documents.filter((document) =>
    consent?.documents.includes(document.id),
  );

  if (legal.loading)
    return (
      <p className="legal-consent-loading" role="status">
        <LoaderCircle className="spin" size={16} /> Carregando as condições da demonstração...
      </p>
    );

  if (legal.error || !consent)
    return (
      <div className="legal-consent-error">
        <p role="alert">{legal.error || 'Não foi possível carregar as condições de uso.'}</p>
        <Button
          type="button"
          className="button outline"
          onClick={() => {
            onAccepted(false);
            legal.reload();
          }}
        >
          Carregar termos novamente
        </Button>
      </div>
    );

  return (
    <div className="legal-consent">
      <nav aria-label="Documentos do aceite" className="legal-consent-links">
        {documents?.map((document) => (
          <a
            href={`#/politicas/${document.id}`}
            key={document.id}
            target="_blank"
            rel="noopener noreferrer"
          >
            {document.title}
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        ))}
      </nav>
      <label className="checkbox">
        <input
          name="accepted"
          type="checkbox"
          checked={accepted}
          disabled={busy}
          onChange={(event) => onAccepted(event.target.checked)}
          required
        />
        <span>{consent.text}</span>
      </label>
      <p className="legal-consent-version">
        Versão {consent.version}
        {documents?.[0] && ` · Atualização de ${date(documents[0].updatedAt)}`}
      </p>
    </div>
  );
}

export function DonationForm({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('50');
  const [donorType, setDonorType] = useState<Donor['type']>('anonymous');
  const [donorName, setDonorName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{
    id: string;
    amount: number;
    acceptedAt: string;
    donor?: Donor;
  } | null>(null);
  const [requestKey] = useState(() => crypto.randomUUID());
  const legal = useLegalManifest();
  const consent = legal.manifest?.acceptance.donor;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!consent || legal.loading || !accepted) {
      setError('Leia e aceite as condições vigentes para registrar a doação demonstrativa.');
      return;
    }
    const name = donorName.trim();
    if (donorType !== 'anonymous' && (name.length < 2 || name.length > 60)) {
      setError('Use um nome fictício com 2 a 60 caracteres.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<{
        id: string;
        amount: number;
        acceptedAt: string;
        donor?: Donor;
      }>(`/campaigns/${campaign.id}/donations`, {
        method: 'POST',
        body: JSON.stringify({
          amount: cents(amount),
          requestKey,
          accepted,
          termsVersion: consent.version,
          termsHash: consent.hash,
          donor: donorType === 'anonymous' ? { type: 'anonymous' } : { type: donorType, name },
        }),
      });
      setReceipt(result);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TERMS_CHANGED') {
        setAccepted(false);
        legal.reload();
        setError('As condições foram atualizadas. Leia os documentos e confirme o novo aceite.');
      } else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={receipt ? 'Seu gesto já faz parte da história.' : 'Faça parte dessa mudança.'}
      description="Doação de demonstração · nenhum valor será cobrado."
      onClose={onClose}
    >
      {receipt ? (
        <div className="success-state">
          <span className="success-icon">
            <CheckCircle2 size={36} />
          </span>
          <h3>{money(receipt.amount)} registrados</h3>
          <p className="donor-receipt">
            {receipt.donor && receipt.donor.type !== 'anonymous'
              ? `${receipt.donor.name} · ${receipt.donor.type === 'company' ? 'Empresa' : 'Pessoa'} fictícia`
              : 'Apoio anônimo'}
          </p>
          <p>
            A entrada foi adicionada ao histórico da campanha. O valor só será liberado após a
            análise de uma evidência.
          </p>
          <div className="receipt">
            <span>Recibo demonstrativo</span>
            <code>{receipt.id}</code>
          </div>
          <Button className="button primary full" onClick={onClose}>
            Acompanhar a campanha <ArrowRight size={17} />
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="form-stack">
          <div className="campaign-mini">
            <img src={campaign.image} alt="" />
            <div>
              <span>Você está apoiando</span>
              <strong>{campaign.shortTitle}</strong>
            </div>
          </div>
          <label>
            Quanto você quer doar?
            <div className="amount-input">
              <span>R$</span>
              <input
                aria-label="Valor da doação"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>
          </label>
          <div className="amount-presets">
            {[25, 50, 100, 200].map((value) => (
              <button
                type="button"
                className={amount === String(value) ? 'selected' : ''}
                key={value}
                onClick={() => setAmount(String(value))}
              >
                {money(value * 100)}
              </button>
            ))}
          </div>
          <fieldset className="donor-identity">
            <legend>Como quer aparecer no histórico?</legend>
            <div className="donor-options">
              {[
                { type: 'anonymous', label: 'Anônimo' },
                { type: 'person', label: 'Pessoa' },
                { type: 'company', label: 'Empresa' },
              ].map(({ type, label }) => (
                <label key={type} className={donorType === type ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="donorType"
                    value={type}
                    checked={donorType === type}
                    disabled={busy}
                    onChange={() => setDonorType(type as Donor['type'])}
                  />
                  {label}
                </label>
              ))}
            </div>
            {donorType !== 'anonymous' && (
              <label className="donor-name">
                Nome fictício {donorType === 'company' ? 'da empresa' : 'da pessoa'}
                <input
                  name="donorName"
                  value={donorName}
                  onChange={(event) => setDonorName(event.target.value)}
                  minLength={2}
                  maxLength={60}
                  required
                  disabled={busy}
                  autoComplete="off"
                  placeholder={
                    donorType === 'company' ? 'Ex.: Aurora Papelaria' : 'Ex.: Lia Mendes'
                  }
                />
              </label>
            )}
            <p>Use apenas nomes fictícios. A identificação desta demonstração não é verificada.</p>
          </fieldset>
          <div className="rule-box">
            <ShieldCheck size={20} />
            <div>
              <strong>Você sabe para onde vai.</strong>
              <p>
                {campaign.releaseRule}. Se houver sobra: {campaign.surplusRule.toLowerCase()}.
              </p>
              <span>Taxa da plataforma: R$ 0 nesta demonstração.</span>
            </div>
          </div>
          <LegalAcceptance
            legal={legal}
            role="donor"
            accepted={accepted}
            onAccepted={setAccepted}
            busy={busy}
          />
          <p className="privacy-note">
            <LockKeyhole size={14} />
            {donorType === 'anonymous'
              ? 'Sua doação aparece sem nome no histórico público.'
              : 'O nome fictício escolhido aparecerá no histórico público.'}{' '}
            Não coletamos dados de pagamento nesta demonstração.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button
            busy={busy}
            className="button primary full"
            disabled={!accepted || !consent || legal.loading}
          >
            <Heart size={18} /> Registrar doação demonstrativa
          </Button>
        </form>
      )}
    </Modal>
  );
}

export function CampaignForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [budget, setBudget] = useState([{ name: '', value: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const legal = useLegalManifest();
  const consent = legal.manifest?.acceptance.organizer;
  const total = budget.reduce((sum, item) => sum + (Number(item.value.replace(',', '.')) || 0), 0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent || legal.loading || !accepted) {
      setError('Leia e aceite as condições vigentes para criar a campanha demonstrativa.');
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          title: form.get('title'),
          organization: form.get('organization'),
          description: form.get('description'),
          location: form.get('location'),
          category: form.get('category'),
          deadline: form.get('deadline'),
          budget: budget.map((item) => ({ name: item.name, planned: cents(item.value) })),
          accepted,
          termsVersion: consent.version,
          termsHash: consent.hash,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TERMS_CHANGED') {
        setAccepted(false);
        legal.reload();
        setError('As condições foram atualizadas. Leia os documentos e confirme o novo aceite.');
      } else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Uma nova causa começa aqui."
      description="Crie uma campanha fictícia. Ela ficará em revisão até ser publicada no painel."
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          Título da campanha
          <input
            name="title"
            placeholder="Uma ideia que faz a diferença"
            minLength={8}
            maxLength={100}
            required
          />
        </label>
        <div className="form-row">
          <label>
            Nome público do coletivo
            <input
              name="organization"
              minLength={3}
              maxLength={60}
              required
              placeholder="Use um nome fictício"
            />
          </label>
          <label>
            Cidade e estado
            <input
              name="location"
              placeholder="São Paulo, SP"
              minLength={3}
              maxLength={60}
              required
            />
          </label>
        </div>
        <label>
          Sobre a causa
          <textarea
            name="description"
            rows={3}
            minLength={30}
            maxLength={1200}
            required
            placeholder="Conte o objetivo e quem será beneficiado, sem dados pessoais ou de saúde."
          />
        </label>
        <div className="form-row">
          <label>
            Categoria
            <select name="category">
              {['Comunidade', 'Animais', 'Emergência', 'Educação', 'Saúde'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Encerramento
            <input
              name="deadline"
              type="date"
              min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
              required
            />
          </label>
        </div>
        <div className="budget-editor">
          <div className="section-row">
            <strong>Orçamento por categoria</strong>
            <span>Meta: {money(Math.round(total * 100))}</span>
          </div>
          {budget.map((item, index) => (
            <div className="budget-row" key={index}>
              <input
                aria-label={`Categoria ${index + 1}`}
                placeholder="Ex.: materiais"
                value={item.name}
                minLength={3}
                maxLength={60}
                required
                onChange={(event) =>
                  setBudget(
                    budget.map((entry, pos) =>
                      pos === index ? { ...entry, name: event.target.value } : entry,
                    ),
                  )
                }
              />
              <input
                aria-label={`Valor da categoria ${index + 1} em reais`}
                placeholder="Valor em R$"
                inputMode="decimal"
                required
                value={item.value}
                onChange={(event) =>
                  setBudget(
                    budget.map((entry, pos) =>
                      pos === index ? { ...entry, value: event.target.value } : entry,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="icon-button"
                disabled={budget.length === 1}
                aria-label={`Remover categoria ${index + 1}`}
                onClick={() => setBudget(budget.filter((_, pos) => pos !== index))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            className="text-link"
            type="button"
            disabled={budget.length >= 8}
            onClick={() => setBudget([...budget, { name: '', value: '' }])}
          >
            <Plus size={16} /> Adicionar categoria
          </button>
        </div>
        <div className="rule-box">
          <ShieldCheck size={20} />
          <p>
            Liberações por etapa, com revisão de comprovante. Sobra devolvida proporcionalmente aos
            doadores. Este protótipo não verifica identidade nem processa pagamentos.
          </p>
        </div>
        <LegalAcceptance
          legal={legal}
          role="organizer"
          accepted={accepted}
          onAccepted={setAccepted}
          busy={busy}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button
          busy={busy}
          className="button primary full"
          disabled={!accepted || !consent || legal.loading}
        >
          Enviar campanha para revisão <ArrowRight size={17} />
        </Button>
      </form>
    </Modal>
  );
}

export function ExpenseForm({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api(`/campaigns/${campaign.id}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          title: form.get('title'),
          supplier: form.get('supplier'),
          categoryId: form.get('categoryId'),
          amount: cents(form.get('amount')),
          evidenceSummary: form.get('evidenceSummary'),
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Preste contas. Dê o próximo passo."
      description="O pedido será revisado antes de qualquer saída demonstrativa."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="rule-box">
          <strong>Disponível para solicitar: {money(campaign.balance - campaign.pending)}</strong>
        </div>
        <label>
          Descrição do gasto
          <input name="title" minLength={5} maxLength={100} required />
        </label>
        <div className="form-row">
          <label>
            Categoria
            <select name="categoryId">
              {campaign.budget.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Valor em reais
            <input name="amount" inputMode="decimal" required placeholder="0,00" />
          </label>
        </div>
        <label>
          Fornecedor fictício
          <input name="supplier" minLength={3} maxLength={80} required />
        </label>
        <label>
          Versão pública da evidência
          <textarea
            name="evidenceSummary"
            rows={4}
            minLength={30}
            maxLength={1500}
            required
            placeholder="Descreva um recibo fictício: valor, data e finalidade. Não inclua CPF, endereço, dados de saúde ou dados bancários."
          />
        </label>
        <p className="privacy-note">
          Evidência nível C: declaração documental, sem consulta fiscal. Use somente dados
          fictícios. A plataforma não atribui nível A ou B sem integração oficial.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button busy={busy} className="button primary full">
          Enviar para análise <ArrowRight size={17} />
        </Button>
      </form>
    </Modal>
  );
}

export function ReportForm({
  campaignId,
  expense,
  onClose,
}: {
  campaignId: string;
  expense?: Expense;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [protocol, setProtocol] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason');
    setBusy(true);
    try {
      const result = await api<{ id: string }>(`/campaigns/${campaignId}/reports`, {
        method: 'POST',
        body: JSON.stringify({ reason, expenseId: expense?.id }),
      });
      setProtocol(result.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Uma dúvida merece ser ouvida."
      description="A denúncia fica no painel de revisão e não é publicada na campanha. Fluxo demonstrativo."
      onClose={onClose}
    >
      {protocol ? (
        <div className="success-state">
          <CheckCircle2 size={36} />
          <h3>Denúncia registrada</h3>
          <p>
            A equipe pode analisar o pedido no painel. A campanha não é suspensa automaticamente.
          </p>
          <div className="receipt">
            <span>Seu protocolo</span>
            <code>{protocol}</code>
          </div>
          <Button className="button primary full" onClick={onClose}>
            Concluir
          </Button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          {expense && <div className="rule-box">Gasto: {expense.title}</div>}
          <label>
            O que precisa ser analisado?
            <textarea
              name="reason"
              rows={5}
              minLength={15}
              maxLength={1000}
              required
              placeholder="Descreva a inconsistência sem incluir dados pessoais. Use dados fictícios nesta demonstração."
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button busy={busy} className="button primary full">
            Enviar denúncia
          </Button>
        </form>
      )}
    </Modal>
  );
}
