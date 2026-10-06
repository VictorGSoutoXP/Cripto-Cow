export function seedAmounts(total, count) {
  const pattern = [2, 1, 4, 1, 7, 3, 1, 2, 5, 1, 8, 2];
  const weights = Array.from({ length: count }, (_, index) => pattern[index % pattern.length]);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const amounts = weights.map((weight) => Math.floor((total * weight) / weightTotal));
  const remaining = total - amounts.reduce((sum, amount) => sum + amount, 0);
  const order = weights
    .map((weight, index) => ({ index, remainder: (total * weight) % weightTotal }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) amounts[order[index].index] += 1;
  return amounts;
}

export const demoDonations = {
  'horta-do-amanha': [
    { amount: 3500, donor: { type: 'person', name: 'Lia Moreira' } },
    { amount: 125000, donor: { type: 'company', name: 'Semente do Bairro' } },
    { amount: 7490, donor: { type: 'anonymous' } },
    { amount: 18000, donor: { type: 'person', name: 'Caio Nunes' } },
    { amount: 5000, donor: { type: 'anonymous' } },
    { amount: 95000, donor: { type: 'company', name: 'Oficina Horizonte' } },
    { amount: 12500, donor: { type: 'person', name: 'Maya Ferreira' } },
    { amount: 4200, donor: { type: 'person', name: 'Davi Azevedo' } },
  ],
  'patas-em-casa': [
    { amount: 2550, donor: { type: 'person', name: 'Nina Duarte' } },
    { amount: 80000, donor: { type: 'company', name: 'Casa Patinha' } },
    { amount: 5990, donor: { type: 'anonymous' } },
    { amount: 12000, donor: { type: 'person', name: 'Teo Martins' } },
    { amount: 4000, donor: { type: 'anonymous' } },
    { amount: 155000, donor: { type: 'company', name: 'Vila do Cuidado' } },
    { amount: 9500, donor: { type: 'person', name: 'Iara Campos' } },
    { amount: 6500, donor: { type: 'person', name: 'Noah Almeida' } },
  ],
  recomecar: [
    { amount: 5000, donor: { type: 'person', name: 'Bia Tavares' } },
    { amount: 250000, donor: { type: 'company', name: 'Ponte Solidária' } },
    { amount: 8990, donor: { type: 'anonymous' } },
    { amount: 25000, donor: { type: 'person', name: 'Yuri Melo' } },
    { amount: 10000, donor: { type: 'anonymous' } },
    { amount: 175000, donor: { type: 'company', name: 'Ateliê Recomeço' } },
    { amount: 22500, donor: { type: 'person', name: 'Luna Reis' } },
    { amount: 9900, donor: { type: 'person', name: 'Ravi Bastos' } },
  ],
};

export const campaigns = [
  {
    id: 'horta-do-amanha',
    title: 'Uma horta hoje. Um futuro inteiro amanhã.',
    shortTitle: 'Horta do Amanhã',
    description:
      'Um terreno vazio vai virar alimento, aprendizado e encontro. A campanha equipa uma horta comunitária com canteiros, ferramentas e um sistema de irrigação para 40 famílias.',
    organization: 'Coletivo Raízes',
    location: 'São Paulo, SP',
    category: 'Comunidade',
    image: '/images/horta.jpg',
    goal: 4000000,
    deadline: '2026-11-20',
    status: 'active',
    verified: false,
    surplusRule: 'Devolução proporcional aos doadores',
    releaseRule: 'Pagamento ao fornecedor após análise do comprovante',
    budget: [
      { id: 'infra', name: 'Canteiros e infraestrutura', planned: 1800000 },
      { id: 'tools', name: 'Ferramentas e equipamentos', planned: 1200000 },
      { id: 'supplies', name: 'Mudas e insumos', planned: 1000000 },
    ],
    raised: 2845000,
    donors: 126,
    expenses: [
      {
        categoryId: 'infra',
        amount: 800000,
        title: 'Primeira etapa dos canteiros',
        supplier: 'Fornecedor demonstrativo 01',
        evidenceLevel: 'C',
        evidenceSummary:
          'Recibo fictício de materiais para oito canteiros. Dados pessoais omitidos. Exemplo para demonstração, sem consulta à base fiscal.',
        createdAt: '2026-10-02T13:00:00.000Z',
      },
      {
        categoryId: 'tools',
        amount: 350000,
        title: 'Ferramentas para a comunidade',
        supplier: 'Fornecedor demonstrativo 02',
        evidenceLevel: 'C',
        evidenceSummary:
          'Comprovante fictício de ferramentas de jardinagem. Dados pessoais omitidos. Não representa um pagamento real.',
        createdAt: '2026-10-04T15:30:00.000Z',
      },
    ],
  },
  {
    id: 'patas-em-casa',
    title: 'Mais cuidado para quem espera um lar.',
    shortTitle: 'Patas em Casa',
    description:
      'Alimentação, cuidados veterinários e abrigo temporário para animais resgatados. Cada gasto tem uma categoria e uma evidência pública, sem expor dados de voluntários.',
    organization: 'Rede Patas em Casa',
    location: 'Curitiba, PR',
    category: 'Animais',
    image: '/images/animais.jpg',
    goal: 2500000,
    deadline: '2026-11-10',
    status: 'active',
    verified: false,
    surplusRule: 'Devolução proporcional aos doadores',
    releaseRule: 'Liberação por etapa após análise do comprovante',
    budget: [
      { id: 'food', name: 'Alimentação', planned: 900000 },
      { id: 'care', name: 'Cuidados veterinários', planned: 1200000 },
      { id: 'shelter', name: 'Abrigo temporário', planned: 400000 },
    ],
    raised: 1678000,
    donors: 83,
    expenses: [
      {
        categoryId: 'food',
        amount: 420000,
        title: 'Alimentação do mês',
        supplier: 'Fornecedor demonstrativo 03',
        evidenceLevel: 'C',
        evidenceSummary:
          'Recibo fictício de ração para o abrigo. Dados pessoais omitidos. Documento não validado em base oficial.',
        createdAt: '2026-10-03T11:00:00.000Z',
      },
    ],
  },
  {
    id: 'recomecar',
    title: 'Um lugar seguro para recomeçar.',
    shortTitle: 'Juntos para Recomeçar',
    description:
      'Materiais e mão de obra para recuperar um espaço comunitário após as chuvas. As etapas são acompanhadas com orçamento aberto e liberação condicionada à prestação de contas.',
    organization: 'Associação Recomeçar',
    location: 'Porto Alegre, RS',
    category: 'Emergência',
    image: '/images/comunidade.jpg',
    goal: 6000000,
    deadline: '2026-12-05',
    status: 'active',
    verified: false,
    surplusRule: 'Devolução proporcional aos doadores',
    releaseRule: 'Liberação por etapa após análise do comprovante',
    budget: [
      { id: 'materials', name: 'Materiais de construção', planned: 3500000 },
      { id: 'labor', name: 'Mão de obra', planned: 2000000 },
      { id: 'transport', name: 'Transporte', planned: 500000 },
    ],
    raised: 4210000,
    donors: 164,
    expenses: [
      {
        categoryId: 'materials',
        amount: 1200000,
        title: 'Materiais para a primeira etapa',
        supplier: 'Fornecedor demonstrativo 04',
        evidenceLevel: 'C',
        evidenceSummary:
          'Orçamento e recibo fictícios de materiais. Dados pessoais omitidos. Exemplo sem validação fiscal oficial.',
        createdAt: '2026-10-04T12:00:00.000Z',
      },
    ],
  },
];
