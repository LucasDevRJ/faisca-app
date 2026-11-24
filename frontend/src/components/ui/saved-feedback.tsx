import type { ReactNode } from 'react';
import { SaveSoundOffer } from '../../features/sounds/save-sound-offer';

// Retorno calmo ao concluir uma atividade ou avaliar uma Ação (issue #93): o cartão assenta e um ✓
// se desenha uma vez num círculo sálvia. Reconhece o esforço sem virar prêmio: nada de confete,
// "parabéns", contador ou movimento contínuo. Só transform, opacity e o traço do ✓ se movem; com
// "Menos movimento" (sistema ou conta), as regras globais do index.css zeram a duração e o estado
// final aparece direto. Só no contexto do paciente: a tela da psicóloga não usa este envoltório.
export function SavedFeedback({ saved, children }: { saved: boolean; children: ReactNode }) {
  return (
    <div className={saved ? 'saved-settle relative' : 'relative'}>
      {children}
      {saved && (
        <span
          aria-hidden="true"
          data-saved-check=""
          className="saved-check pointer-events-none absolute -top-4 -right-2 flex size-7 items-center justify-center rounded-full bg-primary text-on-primary shadow-soft"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              pathLength={1}
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      {/* Convite da primeira vez para o som ao salvar (DEC-135). */}
      {saved && <SaveSoundOffer />}
      {/* Região viva sempre montada, para o leitor de tela anunciar quando o texto chega. */}
      <span role="status" className="sr-only">
        {saved ? 'Registro guardado.' : ''}
      </span>
    </div>
  );
}
