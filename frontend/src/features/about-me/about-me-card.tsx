import type { ReactNode } from 'react';
import { LongText } from '../../components/ui/long-text';
import { formatDayMonth, todayInAppZone } from '../activities/week';
import { ABOUT_FIELDS, type AboutMe } from './about-me-api';

// O "Sobre mim" na visão da terapeuta (DEC-082): só leitura, só os campos preenchidos, com a data
// da última mudança. `footer` leva o "Marcar como lido" dela.
export function AboutMeCard({ aboutMe, footer }: { aboutMe: AboutMe; footer?: ReactNode }) {
  const filled = ABOUT_FIELDS.filter(({ key }) => aboutMe[key]);

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-soft sm:p-4">
      <dl className="flex flex-col gap-3">
        {filled.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <dt className="font-semibold">{label}</dt>
            <dd>
              <LongText text={aboutMe[key]!} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted">Atualizado em {formatDayMonth(todayInAppZone(new Date(aboutMe.updatedAt)))}</p>
      {footer}
    </article>
  );
}
