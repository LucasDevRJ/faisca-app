import { useId, useState } from 'react';

// Acima disso, o texto abre recolhido; o trecho mostrado tem até PREVIEW caracteres. A folga entre
// os dois evita o "Ver mais" para esconder só umas poucas palavras.
const COLLAPSE_FROM = 700;
const PREVIEW = 500;

// Corta no último espaço antes do limite, para não partir uma palavra no meio.
function previewOf(text: string): string {
  const cut = text.slice(0, PREVIEW);
  const lastSpace = cut.search(/\s\S*$/);
  return (lastSpace > PREVIEW / 2 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

// Texto livre dos cartões (RPD, Tensão e a observação da Ação). Com o limite de 5000 caracteres
// (DEC-053, DEC-067), um texto
// longo abre recolhido, com "Ver mais", para a lista e a visão da terapeuta seguirem legíveis.
export function LongText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const collapsible = text.length > COLLAPSE_FROM;

  if (!collapsible) return <p className="break-words whitespace-pre-line">{text}</p>;

  return (
    <div className="flex flex-col items-start gap-1">
      <p id={id} className="break-words whitespace-pre-line">
        {expanded ? text : `${previewOf(text)}…`}
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((value) => !value)}
        className="rounded-sm text-sm font-medium text-primary-text underline underline-offset-4"
      >
        {expanded ? 'Ver menos' : 'Ver mais'}
      </button>
    </div>
  );
}
