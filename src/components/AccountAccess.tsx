import { useState } from 'react';
import { ArrowRight, Layers, ShieldCheck, UserRound } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useLegalManifest } from '../lib/legal';
import { LegalAcceptance } from './forms';
import { Button } from './ui';

type Mode = 'login' | 'register' | 'admin' | 'recover';

export default function AccountAccess({
  onSignedIn,
  notice = '',
}: {
  onSignedIn: (recoveryCode?: string) => void;
  notice?: string;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const legal = useLegalManifest();
  const registering = mode === 'register';
  const recovering = mode === 'recover';

  function changeMode(value: Mode) {
    setMode(value);
    setPassword('');
    setConfirmation('');
    setCode('');
    setAccepted(false);
    setError('');
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if ((registering || recovering) && password !== confirmation) {
      setError('As senhas não coincidem. Confira a confirmação.');
      return;
    }
    const consent = legal.manifest?.acceptance.account;
    if (registering && (!accepted || !consent)) {
      setError('Leia e aceite as condições de uso antes de criar a conta.');
      return;
    }
    setBusy(true);
    try {
      const path =
        mode === 'admin'
          ? '/admin/session'
          : registering
            ? '/auth/register'
            : recovering
              ? '/auth/recovery'
              : '/auth/session';
      const input =
        mode === 'admin'
          ? { password }
          : registering
            ? {
                name,
                email,
                password,
                accepted,
                termsVersion: consent!.version,
                termsHash: consent!.hash,
              }
            : recovering
              ? { email, code, password }
              : { email, password };
      const result = await api<{ recoveryCode?: string }>(path, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setPassword('');
      setConfirmation('');
      window.location.hash = mode === 'admin' ? '/painel' : '/perfil';
      onSignedIn(result.recoveryCode);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TERMS_CHANGED') {
        setAccepted(false);
        legal.reload();
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
          Crie sua conta para organizar campanhas e acompanhar suas solicitações. Cada participante
          tem seu próprio painel.
        </p>
        <div className="login-feature">
          <UserRound size={22} />
          <span>Suas campanhas em um só lugar.</span>
        </div>
        <div className="login-feature">
          <ShieldCheck size={22} />
          <span>Liberações analisadas pela moderação.</span>
        </div>
        <div className="login-feature">
          <Layers size={22} />
          <span>Cada decisão deixa um registro.</span>
        </div>
      </div>
      <form className="login-card form-stack" onSubmit={submit}>
        <span className="login-icon">
          <UserRound size={29} />
        </span>
        <div className="auth-switch" role="group" aria-label="Acesso à conta">
          <button
            type="button"
            aria-pressed={mode === 'login'}
            disabled={busy}
            onClick={() => changeMode('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            aria-pressed={registering}
            disabled={busy}
            onClick={() => changeMode('register')}
          >
            Criar conta
          </button>
        </div>
        <h2>
          {mode === 'admin'
            ? 'Acesso da moderação.'
            : registering
              ? 'Crie sua conta.'
              : recovering
                ? 'Recupere seu acesso.'
                : 'Entre na sua conta.'}
        </h2>
        <p>
          {mode === 'admin'
            ? 'Use a senha administrativa configurada no servidor. No ambiente local demonstrativo sem senha configurada, deixe o campo vazio.'
            : registering
              ? 'Cadastre seu e-mail, escolha um nome de exibição e uma senha. As campanhas e os valores continuam demonstrativos.'
              : recovering
                ? 'Use seu e-mail e o código de recuperação guardado ao criar a conta. Escolha uma nova senha.'
                : 'Use o e-mail e a senha escolhidos no cadastro.'}
        </p>
        {notice && (
          <p role="status" className="muted">
            {notice}
          </p>
        )}
        {registering && (
          <label>
            Nome de exibição
            <input
              name="name"
              autoComplete="nickname"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={60}
              required
              disabled={busy}
              placeholder="Como você quer ser chamado"
            />
          </label>
        )}
        {mode !== 'admin' && (
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              required
              disabled={busy}
              placeholder="voce@exemplo.com"
            />
          </label>
        )}
        {recovering && (
          <label>
            Código de recuperação
            <input
              name="recovery-code"
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              minLength={48}
              maxLength={64}
              disabled={busy}
              required
              placeholder="O código que você guardou no cadastro"
            />
          </label>
        )}
        <label>
          {mode === 'admin' ? 'Senha da moderação' : recovering ? 'Nova senha' : 'Senha'}
          <input
            name="password"
            type="password"
            autoComplete={registering || recovering ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={registering || recovering ? 12 : undefined}
            maxLength={mode === 'admin' ? 200 : 128}
            required={mode !== 'admin'}
            disabled={busy}
            aria-describedby={registering || recovering ? 'password-help' : undefined}
          />
        </label>
        {(registering || recovering) && (
          <>
            <small id="password-help">
              Use de 12 a 128 caracteres. Escolha uma senha exclusiva para sua conta.
            </small>
            <label>
              Confirmar senha
              <input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                minLength={12}
                maxLength={128}
                required
                disabled={busy}
              />
            </label>
            {registering && (
              <LegalAcceptance
                legal={legal}
                role="account"
                accepted={accepted}
                onAccepted={setAccepted}
                busy={busy}
              />
            )}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="button primary full"
          busy={busy}
          disabled={registering && (!accepted || legal.loading || !!legal.error || !legal.manifest)}
        >
          {registering
            ? 'Criar minha conta'
            : recovering
              ? 'Definir senha e entrar'
              : 'Entrar no painel'}{' '}
          <ArrowRight size={17} />
        </Button>
        {mode !== 'admin' && (
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => changeMode('admin')}
          >
            Acesso da moderação
          </button>
        )}
        {mode === 'login' && (
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => changeMode('recover')}
          >
            Esqueci minha senha
          </button>
        )}
        <small>
          {registering
            ? 'Seu e-mail e nome de perfil não aparecem no histórico público. Use dados fictícios nas campanhas e evidências.'
            : 'As doações e liberações deste protótipo são simuladas.'}
        </small>
      </form>
    </div>
  );
}
