import type { ReactNode } from 'react';
import { Card } from '../../components/ui/card';
import { ThemeSwitcher } from '../../components/theme-switcher';

// Moldura das telas de conta: logo, tema e um cartão centralizado.
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="size-9" />
          <span className="font-heading text-2xl font-bold">Faísca</span>
        </div>
        <ThemeSwitcher />
      </header>

      <Card className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">{title}</h1>
          {description && <p className="text-muted">{description}</p>}
        </div>
        {children}
      </Card>
    </main>
  );
}
