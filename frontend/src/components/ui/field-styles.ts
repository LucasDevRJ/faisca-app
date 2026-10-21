// Visual dos campos (DEC-059), separado dos componentes para todos os formulários usarem o mesmo.
// A borda usa --color-field-border, com contraste de pelo menos 3:1 nos dois temas (WCAG 1.4.11);
// a borda dos cartões continua a suave (--color-border). Foco: borda e anel sálvia sólidos; o
// outline-hidden (contorno transparente) aparece no alto contraste do sistema, que tira o anel.
export const fieldClasses =
  'w-full rounded-md border-[1.5px] border-field-border bg-surface px-3 text-text transition-colors hover:border-primary/70 focus:border-primary focus:ring-2 focus:ring-primary focus:outline-hidden aria-invalid:border-accent-text motion-reduce:transition-none';

// Cartão de opção (rádio ou caixa de seleção dentro de um <label>): marcado, borda sálvia e fundo
// levemente tingido. O próprio controle é desenhado no index.css.
export const choiceCardClasses =
  'cursor-pointer rounded-md border border-border bg-surface transition-colors hover:border-primary has-checked:border-primary has-checked:bg-primary/10 motion-reduce:transition-none';
