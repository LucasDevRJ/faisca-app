# Frontend — regras específicas

## Segurança
- A interface não é barreira de segurança: esconder um botão não substitui o 403 do backend.
- Autenticação via cookie httpOnly (`withCredentials` no Axios). Nunca guarde token em
  localStorage ou sessionStorage.
- O service worker guarda em cache apenas o shell do app; **nunca** respostas da API.

## Visual
- Cores, fontes e raios definidos como tokens no `@theme` do Tailwind v4; não use cores soltas.
- Base off-white quente (claro) / azul-petróleo escuro (dark); principal verde-sálvia;
  âmbar/pêssego só como destaque pontual.
- Notas 0–10 em uma única cor com intensidade variável. Nunca vermelho/verde.
- Títulos em Nunito, texto em Inter. Muito espaço, cantos arredondados, sombras leves.
- Sliders grandes com legendas nos extremos. Animações sutis e respeito a `prefers-reduced-motion`.
- Contraste mínimo WCAG AA nos dois temas.

## Tom
- Textos acolhedores: "Conta como foi?" em vez de "Tarefa pendente";
  "Tudo bem, quer contar o que aconteceu?" para atividade não realizada.
- Nada de sequências, pontos, streaks ou mensagens que gerem culpa.
