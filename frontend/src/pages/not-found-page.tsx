import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold">Essa página não existe</h1>
      <p className="text-muted">Talvez o endereço tenha mudado. Vamos voltar para o início?</p>
      <Link to="/" className="font-medium text-primary-text underline underline-offset-4">
        Ir para o início
      </Link>
    </main>
  );
}
