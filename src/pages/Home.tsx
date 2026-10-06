import { useState } from 'react';
import type { Campaign } from '../types';
import { money } from '../lib/api';
import { Progress } from '../components/ui';
import { statusLabel } from '../lib/status';
import {
  ArrowRight,
  ArrowUpRight,
  FileCheck2,
  HeartHandshake,
  Leaf,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Sprout,
  Users,
  SlidersHorizontal,
  Layers,
} from 'lucide-react';

export default function Home({
  campaigns,
  onCreate,
  onInfo,
}: {
  campaigns: Campaign[];
  onCreate: () => void;
  onInfo: () => void;
}) {
  const [category, setCategory] = useState('Todas as causas');
  const [search, setSearch] = useState('');
  const featured = campaigns.find((campaign) => campaign.status === 'active') ?? campaigns[0];
  const categories = [
    'Todas as causas',
    ...new Set(campaigns.map((campaign) => campaign.category)),
  ];
  const filtered = campaigns.filter(
    (campaign) =>
      (category === 'Todas as causas' || category === campaign.category) &&
      `${campaign.title} ${campaign.organization} ${campaign.location}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.toLocaleLowerCase('pt-BR')),
  );
  const raised = campaigns.reduce((sum, item) => sum + item.raised, 0);
  const released = campaigns.reduce((sum, item) => sum + item.released, 0);

  return (
    <div className="page-width">
      <section className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-sun">
              <Sparkles size={15} />
            </span>{' '}
            CADA GESTO IMPORTA. CADA REAL TAMBÉM.
          </span>
          <h1>
            O bem que você faz.
            <br />
            <span>
              O caminho que
              <br className="desktop-break" /> você acompanha.
            </span>
          </h1>
          <p>
            Apoie uma causa e veja sua doação virar ação.
            <br className="desktop-break" /> Do primeiro gesto à última prestação de contas.
          </p>
          <div className="hero-buttons">
            <a
              href="#causas"
              className="button primary"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById('causas')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Encontrar uma causa <ArrowRight size={18} />
            </a>
            <button className="hero-secondary" onClick={onInfo}>
              Conheça a Cripto Cow <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="hero-trust">
            <span className="trust-icon">
              <ShieldCheck size={21} />
            </span>
            <span>
              Orçamento aberto. Evidências públicas.
              <br />
              <strong>Menos promessa, mais prestação de contas.</strong>
            </span>
          </div>
        </div>
        {featured && (
          <a
            href={`#/campanha/${featured.id}`}
            className="hero-visual"
            aria-label={`Conhecer ${featured.shortTitle}`}
          >
            <img
              className="hero-photo"
              src={featured.image}
              alt="Mãos cuidando de plantas em uma horta"
            />
            <div className="hero-image-shade" />
            <span className="photo-label">
              <i /> UMA CAUSA, MUITOS RECOMEÇOS
            </span>
            <span className="hero-orbit">
              <Sprout size={37} strokeWidth={1.4} />
            </span>
            <div className="featured-card">
              <div className="featured-card-top">
                <span className="tag">{featured.category}</span>
                <ArrowUpRight size={21} />
              </div>
              <h2>{featured.shortTitle}</h2>
              <p>
                <MapPin size={13} />
                {featured.location}
              </p>
              <Progress
                value={(featured.raised / featured.goal) * 100}
                label="Arrecadação da causa em destaque"
              />
              <div className="featured-card-bottom">
                <span>
                  <strong>{money(featured.raised)}</strong> arrecadados
                </span>
                <span>{Math.round((featured.raised / featured.goal) * 100)}% da meta</span>
              </div>
            </div>
            <div className="floating-proof">
              <span>
                <FileCheck2 size={20} />
              </span>
              <div>
                <strong>O cuidado deixa um rastro.</strong>
                <small>Veja os comprovantes de cada saída.</small>
              </div>
            </div>
          </a>
        )}
      </section>
      <section className="impact-strip" aria-label="Resumo demonstrativo das campanhas">
        <div>
          <span className="stat-icon">
            <HeartHandshake size={22} />
          </span>
          <div>
            <strong>{money(raised)}</strong>
            <span>em doações demonstrativas</span>
          </div>
        </div>
        <div>
          <span className="stat-icon">
            <FileCheck2 size={22} />
          </span>
          <div>
            <strong>{money(released)}</strong>
            <span>com evidências de exemplo</span>
          </div>
        </div>
        <div>
          <span className="stat-icon">
            <Users size={22} />
          </span>
          <div>
            <strong>{campaigns.reduce((sum, item) => sum + item.donors, 0)}</strong>
            <span>gestos de apoio simulados</span>
          </div>
        </div>
        <div>
          <span className="stat-icon">
            <Layers size={22} />
          </span>
          <div>
            <strong>{campaigns.length} causas</strong>
            <span>com orçamento aberto</span>
          </div>
        </div>
      </section>
      <section className="causes-section" id="causas">
        <div className="section-heading">
          <div>
            <span className="eyebrow small">ENCONTRE SEU PRÓXIMO GESTO</span>
            <h2>Causas que aproximam.</h2>
          </div>
          <button className="text-link" onClick={onCreate}>
            Criar uma campanha <Plus size={17} />
          </button>
        </div>
        <div className="filter-row">
          <div className="filter-tabs" aria-label="Filtrar por categoria">
            {categories.map((item) => (
              <button
                key={item}
                className={category === item ? 'selected' : ''}
                onClick={() => setCategory(item)}
              >
                {item === 'Todas as causas' && <SlidersHorizontal size={15} />}
                {item}
              </button>
            ))}
          </div>
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="Buscar causas"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Busque uma causa"
            />
          </label>
        </div>
        <div className="campaign-grid">
          {filtered.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="empty-state">
            <Search size={28} />
            <h3>Nenhuma causa encontrada.</h3>
            <p>Experimente outra categoria ou termo de busca.</p>
            <button
              className="text-link"
              onClick={() => {
                setSearch('');
                setCategory('Todas as causas');
              }}
            >
              Limpar filtros
            </button>
          </div>
        )}
      </section>
      <section className="transparency-callout">
        <div className="callout-illustration">
          <div className="illustration-circle">
            <ShieldCheck size={42} strokeWidth={1.3} />
          </div>
          <span className="illustration-leaf">
            <Leaf size={20} />
          </span>
        </div>
        <div>
          <span className="eyebrow small">CONFIANÇA QUE DÁ PARA CONFERIR</span>
          <h2>A história não termina na doação.</h2>
          <p>
            Veja o orçamento, os gastos e as evidências de uma causa.
            <br />
            Um histórico aberto, do começo ao impacto.
          </p>
        </div>
        <a className="button light" href="#/transparencia">
          Abrir a transparência <ArrowUpRight size={18} />
        </a>
      </section>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const percentage = Math.round((campaign.raised / campaign.goal) * 100);
  return (
    <a className="campaign-card" href={`#/campanha/${campaign.id}`}>
      <div className="card-image">
        <img
          src={campaign.image}
          alt={`Imagem ilustrativa da causa ${campaign.shortTitle}`}
          loading="lazy"
        />
        <span className="tag">{campaign.category}</span>
        <span className="card-arrow">
          <ArrowUpRight size={20} />
        </span>
      </div>
      <div className="card-content">
        <span className="card-location">
          <MapPin size={13} />
          {campaign.location}
        </span>
        <h3>{campaign.title}</h3>
        <p className="card-org">Por {campaign.organization}</p>
        <div className="card-amount">
          <strong>{money(campaign.raised)}</strong>
          <span>{percentage}%</span>
        </div>
        <Progress value={percentage} label={`Arrecadação de ${campaign.shortTitle}`} />
        <div className="card-meta">
          <span>Meta de {money(campaign.goal)}</span>
          <span>{campaign.donors} apoios</span>
        </div>
        <div className="card-footer">
          <FileCheck2 size={16} />
          <span>Prestação de contas aberta</span>
          <span className={`status-dot ${campaign.status}`} title={statusLabel[campaign.status]} />
        </div>
      </div>
    </a>
  );
}
