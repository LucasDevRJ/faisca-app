import type { ReactNode } from 'react';

type AlertTone = 'info' | 'attention';

const toneClasses: Record<AlertTone, string> = {
  info: 'border-primary bg-bg text-text',
  // Âmbar como destaque pontual, nunca vermelho (frontend/CLAUDE.md).
  attention: 'border-accent bg-bg text-text',
};

// role=status para avisos e role=alert para problemas: o leitor de tela anuncia os dois.
export function Alert({ tone = 'info', children }: { tone?: AlertTone; children: ReactNode }) {
  return (
    <div
      role={tone === 'attention' ? 'alert' : 'status'}
      className={`rounded-md border-l-4 px-4 py-3 ${toneClasses[tone]}`}
    >
      {children}
    </div>
  );
}
