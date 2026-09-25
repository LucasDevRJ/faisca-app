import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ThemeSwitcher } from '../components/theme-switcher';
import { useApiHealth } from '../features/health/use-api-health';

// Página provisória do scaffold: mostra a base visual e confirma a conexão com a API.
// Vai ser substituída pela tela inicial real na etapa de autenticação.

const scoreClasses = [
  'bg-score-0',
  'bg-score-1',
  'bg-score-2',
  'bg-score-3',
  'bg-score-4',
  'bg-score-5',
  'bg-score-6',
  'bg-score-7',
  'bg-score-8',
  'bg-score-9',
  'bg-score-10',
];

function ApiStatus() {
  const { isPending, isError } = useApiHealth();

  if (isPending) return <p className="text-muted">Verificando a conexão…</p>;
  if (isError) return <p className="text-accent-text">Não foi possível falar com a API agora.</p>;
  return <p className="text-primary-text">Conectado à API.</p>;
}

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="size-10" />
          <span className="font-heading text-2xl font-bold">Faísca</span>
        </div>
        <ThemeSwitcher />
      </header>

      <section className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">Olá! O Faísca está sendo preparado.</h1>
        <p className="text-lg text-muted">
          Um espaço calmo para registrar suas atividades, no seu ritmo.
        </p>
      </section>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Status</h2>
        <ApiStatus />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Escala das notas (0 a 10)</h2>
        <div className="flex gap-1" aria-hidden="true">
          {scoreClasses.map((className, score) => (
            <div key={score} className={`h-8 flex-1 rounded-sm ${className}`} />
          ))}
        </div>
        <div className="flex justify-between text-sm text-muted">
          <span>0 · nada</span>
          <span>10 · muito</span>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button>Conta como foi?</Button>
        <Button variant="secondary">Depois</Button>
        <Button variant="ghost">Saiba mais</Button>
      </div>
    </main>
  );
}
