import * as Dialog from '@radix-ui/react-dialog';
import { X, LoaderCircle, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

export function Logo() {
  return (
    <a className="logo" href="#/" aria-label="Cripto Cow, página inicial">
      <span className="logo-mark">
        <svg
          viewBox="0 0 40 40"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 10C10 9 7 7 5 4c-1 4 1 9 6 10M27 10c3-1 6-3 8-6 1 4-1 9-6 10M11 15l-7-2c-1 5 2 8 7 8m18-6 7-2c1 5-2 8-7 8M11 17l1 11c1 5 5 7 8 7s7-2 8-7l1-11c0-5-4-8-9-8s-9 3-9 8Z" />
          <ellipse cx="20" cy="27" rx="7" ry="4" />
          <path d="M15 19h.01M25 19h.01M17 27h.01M23 27h.01" strokeWidth="3" />
        </svg>
      </span>
      <span className="logo-type">
        Cripto Cow<small>TRANSPARÊNCIA E IMPACTO</small>
      </span>
    </a>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal ${wide ? 'modal-wide' : ''}`}
          aria-describedby={description ? 'dialog-description' : undefined}
        >
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Fechar">
              <X size={21} />
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description id="dialog-description" className="modal-description">
              {description}
            </Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Button({
  children,
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...props} disabled={busy || props.disabled}>
      {busy ? <LoaderCircle className="spin" size={18} /> : null}
      {children}
    </button>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.min(Math.round(value), 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="text-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={16} />
    </a>
  );
}
