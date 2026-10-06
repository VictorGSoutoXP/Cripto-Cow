import { useEffect } from 'react';
import { ArrowLeft, ArrowUpRight, FileText, LoaderCircle, Printer } from 'lucide-react';
import { Button } from '../components/ui';
import { date } from '../lib/api';
import { useLegalManifest } from '../lib/legal';
import type { LegalDocument } from '../lib/legal';

function DocumentStatus({ document }: { document: LegalDocument }) {
  return (
    <span className={`legal-status ${document.status === 'draft' ? 'legal-status-draft' : ''}`}>
      {document.status === 'draft' ? 'Minuta para operação futura' : 'Vigente no MVP'}
    </span>
  );
}

export default function Policies({
  documentId,
  sectionId,
}: {
  documentId?: string;
  sectionId?: string;
}) {
  const { manifest, loading, error, reload } = useLegalManifest();
  const document = manifest?.documents.find((item) => item.id === documentId);

  useEffect(() => {
    const previous = window.document.title;
    window.document.title = document
      ? `${document.title} · Cripto Cow`
      : 'Termos e políticas · Cripto Cow';
    return () => {
      window.document.title = previous;
    };
  }, [document]);

  useEffect(() => {
    if (!document || !sectionId) return;
    const section = window.document.getElementById(`legal-section-${sectionId}`);
    if (!section) return;
    section.scrollIntoView({ block: 'start' });
    section.focus({ preventScroll: true });
  }, [document, sectionId]);

  if (loading)
    return (
      <div className="loading-state" role="status">
        <LoaderCircle className="spin" /> Carregando termos e políticas...
      </div>
    );

  if (error || !manifest)
    return (
      <div className="empty-state">
        <h1>Não conseguimos carregar os documentos.</h1>
        <p role="alert">{error || 'Tente novamente em instantes.'}</p>
        <Button className="button primary" onClick={reload}>
          Tentar novamente
        </Button>
      </div>
    );

  if (documentId && !document)
    return (
      <div className="empty-state">
        <h1>Documento não encontrado.</h1>
        <p>Consulte a lista de termos e políticas disponíveis.</p>
        <a className="button primary" href="#/politicas">
          Ver documentos
        </a>
      </div>
    );

  return (
    <div className="page-width legal-page">
      <div className="legal-page-heading">
        <a className="text-link" href={document ? '#/politicas' : '#/'}>
          <ArrowLeft size={16} /> {document ? 'Termos e políticas' : 'Voltar às causas'}
        </a>
        {document ? (
          <>
            <DocumentStatus document={document} />
            <h1>{document.title}</h1>
            <p>{document.summary}</p>
            <div className="legal-meta">
              <span>Versão {document.version}</span>
              <span>Atualizado em {date(document.updatedAt)}</span>
              <button className="text-link legal-print" onClick={() => window.print()}>
                <Printer size={15} /> Imprimir texto
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="eyebrow">CLAREZA EM CADA ETAPA</span>
            <h1>Termos e políticas</h1>
            <p>
              Leia as condições deste protótipo e os textos jurídicos preparados para a evolução da
              Cripto Cow.
            </p>
          </>
        )}
      </div>

      {document ? (
        <div className="legal-reading-layout">
          <aside className="legal-sidebar">
            <nav aria-label="Seções do documento" className="legal-section-nav">
              <strong>Neste documento</strong>
              {document.sections.map((section) => (
                <a
                  href={`#/politicas/${document.id}/${section.id}`}
                  key={section.id}
                  aria-current={sectionId === section.id ? 'location' : undefined}
                >
                  {section.title}
                </a>
              ))}
            </nav>
            <nav aria-label="Outros documentos" className="legal-document-nav">
              <strong>Outros documentos</strong>
              {manifest.documents
                .filter((item) => item.id !== document.id)
                .map((item) => (
                  <a href={`#/politicas/${item.id}`} key={item.id}>
                    {item.title}
                  </a>
                ))}
            </nav>
          </aside>
          <article className="legal-document" aria-label={document.title}>
            {document.status === 'draft' && (
              <div className="legal-draft-notice">
                <strong>Este texto é uma minuta para operação futura.</strong>
                <p>
                  Ele não integra o aceite da demonstração. Para usar o protótipo, consulte os
                  documentos identificados como vigentes no MVP.
                </p>
              </div>
            )}
            {document.intro.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            {document.sections.map((section) => (
              <section
                id={`legal-section-${section.id}`}
                tabIndex={-1}
                className="legal-section"
                key={section.id}
                aria-labelledby={`legal-heading-${section.id}`}
              >
                <h2 id={`legal-heading-${section.id}`}>{section.title}</h2>
                {section.paragraphs.map((paragraph, position) => (
                  <p key={position}>{paragraph}</p>
                ))}
                {section.items && section.items.length > 0 && (
                  <ul>
                    {section.items.map((item, position) => (
                      <li key={position}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            <div className="legal-source">
              <FileText size={18} />
              <div>
                <strong>{manifest.source.title}</strong>
                <p>{manifest.source.description}</p>
                <span>Documento de referência de {date(manifest.source.date)}.</span>
              </div>
            </div>
          </article>
        </div>
      ) : (
        <>
          <div className="legal-hub-note">
            <FileText size={24} />
            <div>
              <strong>O que você aceita ao usar a demonstração</strong>
              <p>
                Os documentos vigentes descrevem o uso do MVP, a privacidade e a transparência. As
                minutas estão disponíveis para leitura e não são aceitas nos formulários do
                protótipo.
              </p>
            </div>
          </div>
          {(['current', 'draft'] as const).map((status) => (
            <section className="legal-document-group" key={status}>
              <div className="legal-group-heading">
                <h2>{status === 'current' ? 'Documentos vigentes no MVP' : 'Minutas jurídicas'}</h2>
                {status === 'draft' && (
                  <p>
                    Textos para a operação futura, sujeitos à revisão antes do uso com dinheiro
                    real.
                  </p>
                )}
              </div>
              <div className="legal-card-grid">
                {manifest.documents
                  .filter((item) => item.status === status)
                  .map((item) => (
                    <a className="legal-card" href={`#/politicas/${item.id}`} key={item.id}>
                      <DocumentStatus document={item} />
                      <h3>{item.title}</h3>
                      <p>{item.summary}</p>
                      <span className="legal-card-date">Atualizado em {date(item.updatedAt)}</span>
                      <span className="text-link">
                        Ler documento <ArrowUpRight size={16} />
                      </span>
                    </a>
                  ))}
              </div>
            </section>
          ))}
          <div className="legal-source">
            <FileText size={18} />
            <div>
              <strong>{manifest.source.title}</strong>
              <p>{manifest.source.description}</p>
              <span>Documento de referência de {date(manifest.source.date)}.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
