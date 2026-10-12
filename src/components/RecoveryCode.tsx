import { useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { Button, Modal } from './ui';

export default function RecoveryCode({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setError('');
    } catch {
      setError('Selecione o código abaixo e copie manualmente.');
    }
  }
  return (
    <Modal
      title="Guarde seu código de recuperação."
      description="Você pode usá-lo para definir uma nova senha se perder o acesso à conta."
      onClose={onClose}
    >
      <div className="recovery-code">
        <KeyRound size={26} />
        <code>{code}</code>
      </div>
      <p className="privacy-note">
        Este código aparece somente agora. Guarde em um lugar privado. Ele permite recuperar sua
        conta e substitui qualquer código anterior. A Cripto Cow não envia senhas ou códigos por
        e-mail.
      </p>
      <Button type="button" className="button outline full" onClick={copy}>
        <Copy size={16} />
        {copied ? 'Código copiado' : 'Copiar código'}
      </Button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button type="button" className="button primary full" onClick={onClose}>
        Continuar para meu painel
      </Button>
    </Modal>
  );
}
