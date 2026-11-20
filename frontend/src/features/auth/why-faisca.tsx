// "Por que Faísca?": de onde vem o nome, no login e no cadastro. Fora da conta não dá para saber se
// a pessoa ligou a Linguagem direta (DEC-076), então o texto explica a metáfora em vez de só usá-la.
// O mesmo parágrafo está no docs/BRIEFING-IA.md, junto do nome do projeto: mude os dois juntos.
export const WHY_FAISCA_TEXT =
  'Uma faísca é pequena, mas consegue acender um fogo. Na ativação comportamental, que faz parte da ' +
  'Terapia Cognitivo-Comportamental, a ideia é parecida: começar por algo pequeno, mesmo sem ' +
  'vontade, e notar o que muda depois. O nome lembra que um passo pequeno já conta.';

export function WhyFaisca() {
  return (
    <details className="text-sm">
      <summary className="min-h-11 cursor-pointer content-center font-medium text-primary-text underline underline-offset-4">
        Por que Faísca?
      </summary>
      <p className="mt-1 text-muted">{WHY_FAISCA_TEXT}</p>
    </details>
  );
}
