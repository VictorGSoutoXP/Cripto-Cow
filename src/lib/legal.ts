import { useEffect, useState } from 'react';
import { z } from 'zod';
import { api } from './api';

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().trim().min(1);
const timestamp = text.refine((value) => Number.isFinite(Date.parse(value)));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const acceptance = z.object({
  version: text,
  hash,
  text,
  documents: z.array(identifier).min(1),
});
const manifestSchema = z
  .object({
    source: z.object({ title: text, date: timestamp, description: text }),
    acceptance: z.object({ version: text, donor: acceptance, organizer: acceptance }),
    documents: z
      .array(
        z.object({
          id: identifier,
          title: text,
          summary: text,
          status: z.enum(['current', 'draft']),
          version: text,
          updatedAt: timestamp,
          intro: z.array(text),
          sections: z
            .array(
              z.object({
                id: identifier,
                title: text,
                paragraphs: z.array(text),
                items: z.array(text).optional(),
              }),
            )
            .min(1),
          hash,
        }),
      )
      .min(1),
  })
  .refine((manifest) => {
    const ids = manifest.documents.map((document) => document.id);
    return (
      new Set(ids).size === ids.length &&
      manifest.documents.every(
        (document) =>
          new Set(document.sections.map((section) => section.id)).size === document.sections.length,
      ) &&
      [manifest.acceptance.donor, manifest.acceptance.organizer].every(
        (item) =>
          item.version === manifest.acceptance.version &&
          item.documents.every((id) =>
            manifest.documents.some(
              (document) => document.id === id && document.status === 'current',
            ),
          ),
      )
    );
  });

export type LegalManifest = z.infer<typeof manifestSchema>;
export type LegalDocument = LegalManifest['documents'][number];
export type LegalRole = 'donor' | 'organizer';

export async function getLegalManifest(): Promise<LegalManifest> {
  const response = await api<unknown>('/legal', { cache: 'no-store' });
  const parsed = manifestSchema.safeParse(response);
  if (!parsed.success)
    throw new Error('Os termos retornados estão incompletos. Tente carregá-los novamente.');
  return parsed.data;
}

export function useLegalManifest() {
  const [manifest, setManifest] = useState<LegalManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    getLegalManifest()
      .then((result) => {
        if (active) setManifest(result);
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  const reload = () => {
    setManifest(null);
    setLoading(true);
    setError('');
    setRevision((value) => value + 1);
  };

  return { manifest, loading, error, reload };
}
