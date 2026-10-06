import legalDocuments from '../shared/legal-documents.json' with { type: 'json' };
import { digest } from './ledger.js';

const documents = legalDocuments.documents.map((document) => ({
  ...document,
  hash: digest(document),
}));
const acceptedDocuments = legalDocuments.acceptance.documents.map((id) => {
  const document = legalDocuments.documents.find((item) => item.id === id);
  if (!document || document.status !== 'current')
    throw new Error('Documento vigente de aceite não encontrado.');
  return document;
});

export function getAcceptance(role) {
  if (!['donor', 'organizer'].includes(role)) throw new Error('Tipo de aceite inválido.');
  const version = legalDocuments.acceptance.version;
  const text = legalDocuments.acceptance[`${role}Text`];
  return {
    version,
    hash: digest({ role, version, text, documents: acceptedDocuments }),
    text,
    documents: acceptedDocuments.map((document) => document.id),
  };
}

export function getLegalManifest() {
  return structuredClone({
    source: legalDocuments.source,
    documents,
    acceptance: {
      version: legalDocuments.acceptance.version,
      donor: getAcceptance('donor'),
      organizer: getAcceptance('organizer'),
    },
  });
}
