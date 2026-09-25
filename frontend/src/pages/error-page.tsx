import { Link } from 'react-router';

// Mostrada quando uma rota quebra. Não exibe detalhes do erro na tela.
export function ErrorPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold">Algo não saiu como esperado</h1>
      <p className="text-muted">Não é nada que você tenha feito. Tente de novo em instantes.</p>
      <Link to="/" className="font-medium text-primary-text underline underline-offset-4">
        Voltar para o início
      </Link>
    </main>
  );
}
