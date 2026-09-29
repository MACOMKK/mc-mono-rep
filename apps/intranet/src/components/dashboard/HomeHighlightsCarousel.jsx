import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { appClient } from '@/api/client';
import { Button, Skeleton } from '@macom/ui';
import AnnouncementDetailsDialog from '@/components/announcements/AnnouncementDetailsDialog';
import { getImageFocusStyle } from '@/lib/announcementImage';

const categoryLabels = {
  geral: 'Comunicado',
  rh: 'RH',
  ti: 'TI',
  financeiro: 'Financeiro',
  vendas: 'Vendas',
  pos_vendas: 'Pos-vendas',
};

const priorityStyles = {
  urgente: {
    tag: 'Urgente',
    accent: '#E30613',
    background:
      'linear-gradient(104deg, #1B1F28 0%, #2B3140 34%, #4B5563 72%, #C7CDD6 100%)',
  },
  alta: {
    tag: 'Importante',
    accent: '#E30613',
    background:
      'linear-gradient(104deg, #1E232D 0%, #303746 34%, #566170 72%, #D5DAE2 100%)',
  },
  media: {
    tag: 'Aviso',
    accent: '#E30613',
    background:
      'linear-gradient(104deg, #202530 0%, #353D4D 34%, #5C6675 72%, #DDE2E8 100%)',
  },
  baixa: {
    tag: 'Atualizacao',
    accent: '#E30613',
    background:
      'linear-gradient(104deg, #252A34 0%, #3A4252 34%, #68717E 72%, #E3E7EC 100%)',
  },
};

function getSlides(announcements) {
  return [...announcements]
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime();
    })
    .slice(0, 5);
}

function extractSummary(content) {
  if (!content) return '';
  return String(content).replace(/\s+/g, ' ').trim();
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function EmptyHighlightState({ title, description, dark = false }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div
        className="relative min-h-[280px] overflow-hidden px-5 py-8 sm:min-h-[320px] sm:px-12 sm:py-10"
        style={{
          background: dark
            ? 'linear-gradient(104deg, #1E232D 0%, #303746 34%, #566170 72%, #D5DAE2 100%)'
            : 'linear-gradient(104deg, #F7F8FB 0%, #FFFFFF 54%, #EEF2F7 100%)',
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_24%),radial-gradient(circle_at_78%_46%,rgba(227,6,19,0.12),transparent_20%),radial-gradient(circle_at_bottom_left,rgba(227,6,19,0.08),transparent_22%)]" />
        <div className="absolute inset-y-0 right-0 hidden w-[38%] bg-gradient-to-l from-white/8 via-white/4 to-transparent lg:block" />
        <div className="absolute right-[10%] top-[16%] hidden h-32 w-32 rounded-full border border-white/12 bg-white/6 backdrop-blur-sm lg:block" />
        <div className="absolute bottom-[20%] right-[18%] hidden h-20 w-20 rounded-full border border-[#E30613]/15 bg-[#E30613]/8 lg:block" />

        <div className="relative grid min-h-[280px] items-center gap-6 sm:min-h-[320px] sm:gap-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(260px,0.88fr)]">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full bg-[#E30613] px-4 py-1 text-xs font-bold text-white">
              Intranet
            </span>
            <h1
              className={`mt-5 max-w-[650px] text-[1.9rem] font-black leading-[1.02] sm:mt-6 sm:text-5xl ${
                dark ? 'text-white' : 'text-[#0B1B3D]'
              }`}
            >
              {title}
            </h1>
            <p
              className={`mt-3 max-w-[620px] text-sm leading-6 sm:mt-4 sm:leading-7 sm:text-lg ${
                dark ? 'text-white/80' : 'text-slate-500'
              }`}
            >
              {description}
            </p>
            {!dark ? (
              <div className="mt-6 sm:mt-8">
                <Link
                  to="/avisos"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[#0B1B3D] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#102754] sm:w-auto"
                >
                  Ir para Mural de Avisos
                </Link>
              </div>
            ) : null}
          </div>
          <div className="hidden h-full min-h-[240px] lg:block" />
        </div>
      </div>
    </div>
  );
}

export default function HomeHighlightsCarousel({ disabled = false }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements-home'],
    queryFn: () => appClient.entities.HomeAnnouncement.list('-created_date', 10),
    enabled: !disabled,
  });

  const slides = useMemo(() => getSlides(announcements), [announcements]);

  useEffect(() => {
    if (slides.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    if (activeIndex >= slides.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, slides.length]);

  if (disabled) {
    return (
      <EmptyHighlightState
        dark
        title="Comunicacao interna em destaque"
        description="Assim que os dados da intranet estiverem disponiveis novamente, os avisos publicados aparecerao aqui em formato de destaque."
      />
    );
  }

  if (isLoading) {
    return <Skeleton className="h-[320px] w-full rounded-[28px] sm:h-[360px]" />;
  }

  if (slides.length === 0) {
    return (
      <EmptyHighlightState
        title="Bem-vindo a Home da intranet"
        description="Quando novos avisos forem publicados, eles aparecerao aqui em destaque para facilitar a leitura do time."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="relative min-h-[320px] overflow-hidden sm:min-h-[360px]">
        {slides.map((item, index) => {
          const style = priorityStyles[item.priority] || priorityStyles.media;
          const isActive = index === activeIndex;
          const categoryLabel = categoryLabels[item.category] || categoryLabels.geral;
          const summary = truncateText(extractSummary(item.content), 150);
          const title = truncateText(item.title || '', 62);
          const hasImage = Boolean(item.image_url);

          return (
            <div
              key={item.id}
              className={`absolute inset-0 transition-opacity duration-500 ${isActive ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              style={{ background: style.background }}
              aria-hidden={!isActive}
            >
              {item.image_url ? (
                <>
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={getImageFocusStyle(item)}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,27,61,0.88)_0%,rgba(11,27,61,0.74)_42%,rgba(11,27,61,0.4)_72%,rgba(11,27,61,0.22)_100%)]" />
                </>
              ) : null}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_22%),radial-gradient(circle_at_78%_50%,rgba(255,255,255,0.12),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(227,6,19,0.14),transparent_22%)]" />
              {!hasImage ? (
                <>
                  <div className="absolute inset-y-0 right-0 hidden w-[38%] bg-gradient-to-l from-white/8 via-white/4 to-transparent lg:block" />
                  <div className="absolute right-[10%] top-[16%] hidden h-32 w-32 rounded-full border border-white/12 bg-white/6 backdrop-blur-sm lg:block" />
                  <div className="absolute bottom-[20%] right-[18%] hidden h-20 w-20 rounded-full border border-[#E30613]/15 bg-[#E30613]/8 lg:block" />
                </>
              ) : null}

              <div className="relative grid min-h-[320px] items-center gap-6 px-5 pb-16 pt-6 sm:min-h-[360px] sm:gap-8 sm:px-12 sm:pb-20 sm:pt-9 lg:grid-cols-[minmax(0,1.12fr)_minmax(260px,0.88fr)]">
                <div className="grid min-h-[240px] max-w-2xl grid-rows-[auto_auto_1fr_auto] self-center sm:min-h-[260px]">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className="inline-flex rounded-full px-3 py-1 text-[11px] font-bold text-white shadow-sm sm:px-4 sm:text-xs"
                      style={{ backgroundColor: style.accent }}
                    >
                      {item.pinned ? `${style.tag} · ${categoryLabel}` : categoryLabel}
                    </span>
                  </div>

                  <h1 className="mt-4 max-w-[650px] text-[1.85rem] font-black leading-[0.96] text-white sm:mt-5 sm:text-[3.15rem]">
                    <span className="block line-clamp-3 sm:line-clamp-2">{title}</span>
                  </h1>

                  <p className="mt-3 max-w-[620px] text-sm leading-6 text-white/80 sm:mt-4 sm:text-[0.98rem]">
                    <span className="block line-clamp-4 sm:line-clamp-2">
                      {summary}
                    </span>
                  </p>

                  <div className="pt-5 sm:pt-6">
                    <Button
                      type="button"
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-bold text-[#0B1B3D] transition-colors hover:bg-slate-100 sm:w-auto"
                      onClick={() => setSelectedAnnouncement(item)}
                    >
                      Ler materia completa
                    </Button>
                  </div>
                </div>

                <div className="hidden h-full min-h-[240px] lg:block" />
              </div>
            </div>
          );
        })}

        {slides.length > 1 ? (
          <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center justify-center gap-2.5 sm:bottom-6 sm:gap-3">
            {slides.map((slide, index) => {
              const style = priorityStyles[slide.priority] || priorityStyles.media;

              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className="rounded-full transition-all"
                  style={{
                    width: index === activeIndex ? 24 : 12,
                    height: 12,
                    backgroundColor: index === activeIndex ? style.accent : 'rgba(226,232,240,0.9)',
                    opacity: index === activeIndex ? 1 : 0.9,
                    boxShadow: index === activeIndex ? '0 4px 12px rgba(0,0,0,0.14)' : 'none',
                  }}
                  aria-label={`Abrir destaque ${index + 1}`}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      <AnnouncementDetailsDialog
        announcement={selectedAnnouncement}
        open={Boolean(selectedAnnouncement)}
        onOpenChange={(open) => !open && setSelectedAnnouncement(null)}
      />
    </div>
  );
}
