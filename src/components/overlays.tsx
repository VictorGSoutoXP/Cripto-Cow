import { useState } from 'react';
import {
  Check,
  FileCheck2,
  Flag,
  Heart,
  LockKeyhole,
  ShieldCheck,
  Radio,
  FileText,
} from 'lucide-react';
import { api, date, money } from '../lib/api';
import { verifyEvidence } from '../lib/verify';
import { Button, Modal, ExternalLink } from './ui';
import type { Expense, Overlay } from '../types';

export function Proof({
  expense,
  onClose,
  onReport,
}: {
  expense: Expense;
  onClose: () => void;
  onReport: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState('');

  async function checkEvidence() {
    setChecking(true);
    try {
      const valid = await verifyEvidence(expense);
      setResult(
        valid
          ? 'Evidência compatível com o hash registrado no histórico.'
          : 'A evidência não corresponde ao hash registrado. Solicite uma análise.',
      );
    } catch {
      setResult('Não foi possível conferir a evidência neste navegador.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <Modal
      title="Uma evidência, um passo de confiança."
      description="Versão pública demonstrativa. Não contém um documento fiscal real."
      onClose={onClose}
    >
      <div className="proof-document">
        <div className="proof-document-heading">
          <FileText size={27} />
          <span>
            COMPROVANTE DEMONSTRATIVO
            <br />
            <small>Dados pessoais omitidos</small>
          </span>
        </div>
        <h3>{expense.title}</h3>
        <dl>
          <div>
            <dt>Fornecedor fictício</dt>
            <dd>{expense.supplier}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{money(expense.amount)}</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>{date(expense.createdAt)}</dd>
          </div>
          <div>
            <dt>Nível de evidência</dt>
            <dd>{expense.evidenceLevel} · sem validação oficial</dd>
          </div>
          <div>
            <dt>Situação</dt>
            <dd>
              {expense.status === 'approved'
                ? 'Analisado na demonstração'
                : expense.status === 'pending'
                  ? 'Aguardando análise'
                  : 'Recusado'}
            </dd>
          </div>
        </dl>
        <p>{expense.evidenceSummary}</p>
        {expense.reason && (
          <div className="proof-decision">
            <strong>Justificativa da análise</strong>
            <p>{expense.reason}</p>
          </div>
        )}
        <div className="proof-document-footer">
          <LockKeyhole size={15} /> CPF, dados bancários e dados de saúde não fazem parte deste
          exemplo.
        </div>
      </div>
      <label className="hash-label">
        Hash da evidência<code>{expense.evidenceHash}</code>
      </label>
      <Button className="button outline full" busy={checking} onClick={checkEvidence}>
        <ShieldCheck size={17} /> Conferir hash da evidência
      </Button>
      {result && (
        <p className="muted" role="status">
          {result}
        </p>
      )}
      <p className="privacy-note">
        O hash permite conferir se a evidência registrada mudou. Ele não garante que o documento
        seja verdadeiro.
      </p>
      <button className="text-link" onClick={onReport}>
        <Flag size={15} /> Pedir análise deste gasto
      </button>
    </Modal>
  );
}

export function Decision({
  overlay,
  onClose,
  onSaved,
}: {
  overlay: Overlay;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title =
    overlay.type === 'decision'
      ? overlay.approved
        ? 'Aprovar liberação demonstrativa'
        : 'Recusar pedido de liberação'
      : overlay.type === 'status'
        ? overlay.status === 'frozen'
          ? 'Suspender a campanha para análise'
          : 'Ativar campanha demonstrativa'
        : 'Registrar análise da denúncia';
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason');
    setBusy(true);
    try {
      if (overlay.type === 'decision')
        await api(`/expenses/${overlay.expense.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ approved: overlay.approved, reason }),
        });
      if (overlay.type === 'status')
        await api(`/campaigns/${overlay.campaign.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: overlay.status, reason }),
        });
      if (overlay.type === 'reportDecision')
        await api(`/reports/${overlay.report.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
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
      title={title}
      description="Registre o motivo da sua decisão. Nenhum pagamento real será realizado."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        {overlay.type === 'decision' && (
          <div className="rule-box">
            <strong>
              {overlay.expense.title} · {money(overlay.expense.amount)}
            </strong>
          </div>
        )}
        {overlay.type === 'status' && overlay.campaign.status === 'draft' && (
          <p className="privacy-note">
            Publicar o exemplo não verifica a identidade da organização. Nenhum selo de KYC será
            atribuído.
          </p>
        )}
        <label>
          Justificativa
          <textarea
            name="reason"
            minLength={10}
            maxLength={500}
            rows={4}
            required
            placeholder="Descreva o que foi conferido e o motivo da decisão."
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button className="button primary full" busy={busy}>
          Confirmar decisão <Check size={17} />
        </Button>
      </form>
    </Modal>
  );
}

export function About({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="O bem pode ser acompanhado."
      description="Cripto Cow é um app de doações com prestação de contas verificável."
      onClose={onClose}
      wide
    >
      <div className="about-steps">
        {[
          {
            icon: Heart,
            title: 'Você apoia uma causa.',
            text: 'Antes de doar, você conhece o orçamento, as regras de liberação e o destino da sobra.',
          },
          {
            icon: FileCheck2,
            title: 'O gasto precisa de evidência.',
            text: 'O organizador solicita uma liberação e envia uma versão pública do comprovante. O valor fica reservado enquanto o pedido é analisado.',
          },
          {
            icon: ShieldCheck,
            title: 'A decisão fica registrada.',
            text: 'Uma aprovação registra a saída no histórico encadeado. Uma campanha em análise tem suas liberações suspensas.',
          },
          {
            icon: Radio,
            title: 'Você confere por conta própria.',
            text: 'Recalcule os hashes no navegador, baixe o histórico ou consulte uma ancoragem confirmada na Solana devnet.',
          },
        ].map((step, index) => (
          <div key={step.title}>
            <span className="about-step-icon">
              <step.icon size={22} />
            </span>
            <div>
              <small>0{index + 1}</small>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="rule-box">
        <LockKeyhole size={22} />
        <div>
          <strong>Um protótipo, com limites claros.</strong>
          <p>
            As campanhas são fictícias. Doações e liberações são simulações. Não há Pix, cartão,
            custódia, KYC ou validação fiscal integrados. O registro de hashes na devnet é uma
            integração real, quando assinado por uma carteira e confirmado na rede.
          </p>
          <p>
            O lançamento com dinheiro real depende de um parceiro de pagamento, autenticação por
            função, armazenamento privado de documentos e revisão jurídica dos termos. Este
            protótipo não declara conformidade legal.
          </p>
        </div>
      </div>
      <ExternalLink href="https://hackathon.superteam.com.br/">
        Hackathon Superteam Brasil
      </ExternalLink>
    </Modal>
  );
}
