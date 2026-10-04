import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ThemeSwitcher } from '../components/theme-switcher';

// Aviso de privacidade (SPEC, "Privacidade"; DEC-036). Pública: abre com ou sem sessão, pelo
// link do cadastro, da tela de entrar, do rodapé do app e de Conta.
// Mudou o texto? Acrescente também uma versão em PRIVACY_VERSIONS no backend
// (src/modules/auth/privacy.ts): é a versão que fica gravada no aceite de cada cadastro.
// Versão 2026-10.2 (DEC-039): entra o Registro de Pensamentos, com novo aceite para usá-lo.
// Versão 2026-10.3 (DEC-042): entram os Episódios de tensão, com novo aceite para usá-los.
// Versão 2026-10.4 (DEC-045): entra a agenda (hora, motivos e pausas), com novo aceite para usá-la.
const VERSION_LABEL = 'versão 4, de outubro de 2026';
const CONTACT = 'lucaspereiradelima2020@gmail.com';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPage() {
  const contact = (
    <a href={`mailto:${CONTACT}`} className={`${linkClass} break-all`}>
      {CONTACT}
    </a>
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/" aria-label="Faísca, ir para o início" className="flex items-center gap-3 rounded-md">
          <img src="/icon.svg" alt="" className="size-9" />
          <span className="font-heading text-2xl font-bold">Faísca</span>
        </Link>
        <ThemeSwitcher />
      </header>

      <article className="flex flex-col gap-6 leading-relaxed">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold sm:text-4xl">Aviso de privacidade</h1>
          <p className="text-muted">{VERSION_LABEL}</p>
        </div>

        <Section title="Quem cuida dos seus dados">
          <p>O Faísca é um projeto de TCC de Lucas Pereira de Lima. Dúvidas e pedidos: {contact}.</p>
        </Section>

        <Section title="O que guardamos">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              Da sua conta: nome, e-mail e senha. A senha é guardada de um jeito que nem nós conseguimos ler.
            </li>
            <li>O que você registra: atividades, datas, notas de 0 a 10 e observações.</li>
            <li>
              Na agenda de consultas: o dia, a hora e a frequência das sessões, as pausas e os motivos que você
              escreve ao desmarcar ou remarcar uma sessão.
            </li>
            <li>
              No Registro de Pensamentos (RPD): as situações que você descreve e, para cada uma, o pensamento
              automático, o quanto você acredita nele, as emoções e a intensidade de cada uma, o comportamento e
              a consequência.
            </li>
            <li>
              Nos Episódios de tensão: o dia e, se você informar, a hora de cada episódio, a situação, a nota de 0
              a 10 da tensão e da vontade de vocalizar, o que você fez e o que aconteceu depois.
            </li>
            <li>Seus vínculos com terapeutas.</li>
            <li>No seu aparelho: só o cookie de sessão e a preferência de tema claro ou escuro.</li>
            <li>
              Se você baixar o arquivo da agenda para o calendário do celular, ele leva só o dia e a hora de cada
              sessão, com o texto “Consulta”, sem motivos.
            </li>
            <li>
              Seu endereço IP é usado por alguns minutos, só para barrar tentativas repetidas de senha, e não é
              gravado.
            </li>
          </ul>
        </Section>

        <Section title="Para quê">
          <p>
            Para você registrar suas atividades, o seu Registro de Pensamentos e os seus Episódios de tensão e,
            se quiser, compartilhá-los com a sua terapeuta. Também usamos
            o seu e-mail para mensagens da conta: confirmação, nova senha e aviso de exclusão. Não vendemos
            dados, não mostramos anúncios e não usamos ferramentas de rastreamento.
          </p>
        </Section>

        <Section title="Quem vê">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Você vê tudo o que registrou.</li>
            <li>
              A terapeuta vinculada vê tudo, inclusive notas, observações, o Registro de Pensamentos, os
              Episódios de tensão e a agenda com os motivos, enquanto o vínculo existir. Você
              pode desfazer o vínculo a qualquer momento em <strong>Conta</strong>, e o acesso dela acaba na
              hora.
            </li>
            <li>Se você é terapeuta, o seu nome e o seu e-mail aparecem para os pacientes vinculados.</li>
          </ul>
        </Section>

        <Section title="Onde ficam">
          <p>
            Nos servidores do Railway (banco de dados e API) e da Vercel (site), nos{' '}
            <strong>Estados Unidos</strong>. Os e-mails saem pelo Resend, a partir de servidores em São Paulo.
          </p>
        </Section>

        <Section title="Como protegemos">
          <p>
            Conexão sempre criptografada (HTTPS). A terapeuta só consegue ler, nunca alterar nada. Códigos e
            links de vínculo são guardados de forma que não possam ser lidos.
          </p>
        </Section>

        <Section title="Por quanto tempo">
          <p>
            Até você excluir a conta. A exclusão, em <strong>Conta</strong>, apaga tudo na hora. Não guardamos
            cópias de segurança.
          </p>
        </Section>

        <Section title="Seus direitos (LGPD)">
          <p>
            Você pode ver os seus dados no app, excluí-los junto com a conta e retirar o seu consentimento
            excluindo a conta. Para qualquer outro pedido, escreva para {contact}.
          </p>
        </Section>

        <Section title="Importante">
          <p>
            O Faísca é um projeto acadêmico em desenvolvimento. Ele apoia o acompanhamento com a sua terapeuta,
            mas não substitui o atendimento e não é prontuário. Se você estiver em sofrimento intenso, ligue
            para o <strong>CVV, no 188</strong>, gratuito e disponível 24 horas.
          </p>
        </Section>

        <Section title="Mudanças">
          <p>
            Se este aviso mudar, avisamos no app antes. Quando a mudança envolver dados novos, pedimos o seu
            aceite de novo antes de você usar a parte nova.
          </p>
        </Section>
      </article>

      <Link to="/" className={`${linkClass} self-start`}>
        Ir para o Faísca
      </Link>
    </main>
  );
}
