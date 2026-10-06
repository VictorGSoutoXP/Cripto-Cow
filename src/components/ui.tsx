import * as Dialog from '@radix-ui/react-dialog';
import { X, LoaderCircle, ArrowUpRight, HeartHandshake } from 'lucide-react';
import type { ReactNode } from 'react';

export function Logo() {
  return (
    <a className="logo" href="#/" aria-label="Cripto Cow, página inicial">
      <span className="logo-mark">
        <HeartHandshake size={25} strokeWidth={1.7} />
      </span>
      <span>
        Cripto Cow<span className="logo-dot">.</span>
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
