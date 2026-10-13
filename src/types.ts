export type Category = { id: string; name: string; planned: number; spent: number };
export type ProfileWallet = {
  id: string;
  network: 'solana' | 'zcash';
  address: string;
  verifiedAt: string;
  chain: 'devnet' | 'testnet';
};
export type WalletChallenge = {
  id: string;
  network: 'solana' | 'zcash';
  address: string;
  message: string;
  expiresAt: string;
};
export type LedgerEntry = {
  id: string;
  campaignId: string;
  sequence: number;
  type: string;
  amount: number;
  categoryId: string | null;
  evidenceLevel: string | null;
  evidenceHash: string | null;
  referenceId: string | null;
  createdAt: string;
  previousHash: string;
  hash: string;
};
export type CryptoPayment = {
  id: string;
  campaignId: string;
  network: 'solana' | 'zcash';
  chain: 'devnet' | 'testnet';
  asset: 'SOL' | 'ZEC';
  receiver: string;
  amount: string;
  units: string;
  requestedAmount: string;
  status: 'pending' | 'confirmed';
  testnetOnly: true;
  createdAt: string;
  txid?: string;
  confirmedAt?: string;
  explorerUrl?: string;
  uri?: string;
  payer?: string;
  memo?: string;
  memoProgram?: string;
  blockhash?: string;
  lastValidBlockHeight?: number;
  token?: string;
  commitment?: Record<string, unknown>;
};
export type PaymentMethods = {
  methods: {
    network: 'solana' | 'zcash';
    asset: string;
    chain: string;
    available: boolean;
    receiver: string | null;
    demoReceiver: boolean;
  }[];
};
export type Expense = {
  id: string;
  campaignId: string;
  title: string;
  supplier: string;
  amount: number;
  categoryId: string;
  evidenceLevel: string;
  evidenceSummary: string;
  evidenceHash: string;
  evidenceNonce: string;
  recordedHash: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  createdAt: string;
};
export type Anchor = {
  id: string;
  count: number;
  root: string;
  signature: string;
  slot: number;
  explorerUrl: string;
  confirmedAt: string;
};
export type Donor = { type: 'anonymous' } | { type: 'person' | 'company'; name: string };
export type PublicDonation = {
  id: string;
  ledgerId: string;
  donor: Donor;
  simulated: true;
};
export type Campaign = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  organization: string;
  location: string;
  category: string;
  image: string;
  goal: number;
  raised: number;
  released: number;
  balance: number;
  pending: number;
  donors: number;
  deadline: string;
  status: 'active' | 'frozen' | 'closed' | 'draft';
  statusReason?: string;
  verified: boolean;
  surplusRule: string;
  releaseRule: string;
  budget: Category[];
  expenses: Expense[];
  ledger: LedgerEntry[];
  donations?: PublicDonation[];
  integrity: { valid: boolean; count: number; root: string };
  anchors: Anchor[];
  cryptoPayments?: CryptoPayment[];
  cryptoTotals?: { solana: string; zcash: string };
  cryptoReceivers?: { solana?: string; zcash?: string };
};
export type Report = {
  id: string;
  campaignId: string;
  reason: string;
  expenseId?: string;
  status: string;
  createdAt: string;
};

export type Overlay =
  | { type: 'recoveryCode'; code: string }
  | { type: 'donation'; campaign: Campaign }
  | { type: 'create' }
  | { type: 'expense'; campaign: Campaign }
  | { type: 'proof'; expense: Expense }
  | { type: 'report'; campaignId: string; expense?: Expense }
  | { type: 'info' }
  | { type: 'decision'; expense: Expense; approved: boolean }
  | { type: 'status'; campaign: Campaign; status: string }
  | { type: 'reportDecision'; report: Report };
