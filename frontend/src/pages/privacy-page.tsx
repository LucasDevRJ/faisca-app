import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ThemeSwitcher } from '../components/theme-switcher';

// Aviso de privacidade (SPEC, "Privacidade"; DEC-036). Pública: abre com ou sem sessão, pelo
// link do cadastro, da tela de entrar, do rodapé do app e de Conta.
// Mudou o texto? Acrescente também uma versão em PRIVACY_VERSIONS no backend
// (src/modules/auth/privacy.ts): é a versão que fica gravada no aceite de cada cadastro. E troque o
// SHOWN_PRIVACY_VERSION (features/auth/privacy-version.ts), que o app manda no aceite (DEC-105).
// Versão 2026-10.2 (DEC-039): entra o Registro de Pensamentos, com novo aceite para usá-lo.
// Versão 2026-10.3 (DEC-042): entram os Episódios de tensão, com novo aceite para usá-los.
// Versão 2026-10.4 (DEC-045): entra a agenda (hora, motivos e pausas), com novo aceite para usá-la.
// Versão 2026-10.5 (DEC-051): entra a Ação, com novo aceite para usá-la.
// Versão 2026-10.6 (DEC-064, DEC-065): entram as fotos da Ação, com novo aceite para usá-las.
// Versão 2026-10.7 (DEC-075, DEC-078): entram as cópias de segurança. Pede o aceite de novo, mas não
// bloqueia nenhuma área: não há dado novo, muda onde e por quanto tempo os dados ficam.
// Versão 2026-11 (DEC-081, DEC-082): entra o "Sobre mim", com novo aceite para usá-lo.
// Versão 2026-11.2 (DEC-094, DEC-095): entra o Meus Planos, com novo aceite para usá-lo.
// Versão 2026-11.3 (DEC-096): os dados da verificação em duas etapas, as mensagens ao suporte (Zoho
// Mail, nos EUA) e o contato suporte@. Pede o aceite de novo, sem bloquear nenhuma área.
// Versão 2026-11.4 (DEC-097, DEC-098): até duas profissionais, cada uma vendo só as áreas que o
// paciente escolhe. Pede o aceite de novo, sem bloquear nenhuma área.
// Versão 2026-11.5 (DEC-103, DEC-104): entram as fotos das atividades, com novo aceite para usá-las.
// Versão 2026-11.6 (DEC-106): entram as Tarefas e suas respostas, com novo aceite.
// Versão 2026-11.7 (DEC-107, DEC-108): entram o Sono e humor e o Remédio do dia, com novo aceite.
// Versão 2026-11.8 (DEC-113): entra a Comunidade de apoio, com novo aceite.
// Versão 2026-11.9 (DEC-114, DEC-115): entram os Remédios e o que sinto, com novo aceite.
// Versão 2026-11.10 (DEC-117, DEC-118): a marca de leitura pode aparecer para o paciente, se ele pedir
// e a profissional ativar, com novo aceite. Ela deixa de ser "só dela" nesse caso, como prometia a DEC-058.
// Versão 2026-11.11 (DEC-125): entram as Mensagens privadas, com novo aceite.
// Versão 2026-11.12 (DEC-127): as Mensagens guardam também até quando cada pessoa viu a conversa.
// Sem área nova: pede o aceite numa faixa, sem bloquear nada.
// Versão 2026-11.13 (DEC-128): as Mensagens guardam também o registro apontado no assunto "Sobre um
// registro" (só a referência). Sem área nova: pede o aceite numa faixa, sem bloquear nada.
// Exceção à regra acima (DEC-055): o item do RPD passou a citar a explicação alternativa e o "como
// me sinto agora" sem versão nova, porque a finalidade é a mesma do RPD já aceito. A mudança foi
// contada a todos pelo card de Novidades. O mesmo vale para a marca de leitura da terapeuta
// (DEC-058): um dado de trabalho dela, que o paciente não vê. E também para o nome completo, a
// paleta, os ajustes de acessibilidade, a foto do perfil e as preferências de lembretes (DEC-061,
// DEC-068, DEC-069, DEC-076, DEC-090): dados pessoais e preferências da própria conta, que não são
// de saúde. E para o mural de avisos (DEC-079, DEC-080): o aviso é conteúdo da terapeuta, e o "já
// vi" fica só com o paciente. E para a correção de "projeto acadêmico" para "produto independente"
// em "Importante" (o Faísca não é trabalho acadêmico; TCC aqui é Terapia Cognitivo-Comportamental)
// e de "a sua terapeuta" para "psicóloga ou psiquiatra" em "Para quê" e "Importante", como já diz
// "Quem vê" desde a versão 11: não muda nenhum dado coletado nem quem vê.
const VERSION_LABEL = 'versão 19, de novembro de 2026';
const CONTACT = 'suporte@minhafaisca.com.br';

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
          <p>O Faísca é um produto independente. Dúvidas e pedidos: {contact}.</p>
        </Section>

        <Section title="O que guardamos">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              Da sua conta: nome, e-mail e senha. A senha é guardada de um jeito que nem nós conseguimos ler. Se
              você quiser, também o nome completo, a paleta de cores, os ajustes de acessibilidade e uma foto de
              perfil. A foto é guardada pequena e sem os dados escondidos, como o lugar onde foi tirada.
            </li>
            <li>O que você registra: atividades, datas, notas de 0 a 10 e observações.</li>
            <li>
              Na agenda de consultas: o dia, a hora e a frequência das sessões, as pausas e os motivos que você
              escreve ao desmarcar ou remarcar uma sessão.
            </li>
            <li>
              Na Ação: cada ação que você planeja (o dia, o nome e o tipo: prazer, conexão ou realização), a
              nota de 0 a 10 do quanto esperava gostar, as notas de prazer e de realização depois e as
              observações.
            </li>
            <li>
              Nas fotos da Ação: as fotos que você escolher adicionar a uma ação já avaliada, até 10 por ação.
              Antes de guardar, tiramos os dados escondidos da foto, como o lugar onde ela foi tirada, e
              diminuímos o tamanho. Se aparecerem outras pessoas, confira se elas estão de acordo.
            </li>
            <li>
              Nas fotos das atividades: as fotos que você escolher adicionar a uma atividade, até 10 por
              atividade, enquanto ela está planejada ou pendente e, depois de concluída, até a próxima consulta.
              Antes de guardar, tiramos os dados escondidos da foto, como o lugar onde ela foi tirada, e
              diminuímos o tamanho. Se aparecerem outras pessoas, confira se elas estão de acordo.
            </li>
            <li>
              No Registro de Pensamentos (RPD): as situações que você descreve e, para cada uma, o pensamento
              automático, o quanto você acredita nele, as emoções e a intensidade de cada uma, o comportamento e
              a consequência e, se você escrever, a explicação alternativa e como você se sente depois dela.
            </li>
            <li>
              Nos Episódios de tensão: o dia e, se você informar, a hora de cada episódio, a situação, a nota de 0
              a 10 da tensão e da vontade de vocalizar, o que você fez e o que aconteceu depois.
            </li>
            <li>
              No “Sobre mim”, se você quiser contar: um pouco sobre você, o que gostaria de trabalhar na terapia e
              hábitos que quer deixar ou já deixou. É tudo opcional, e apagar os três campos apaga o “Sobre mim”.
            </li>
            <li>
              No Meus Planos: o nome de cada plano, as perguntas e cada registro, com o dia, a hora (se você informar)
              e as respostas. Como os planos podem tratar de assuntos íntimos, nada deles aparece em notificações nem
              nos registros técnicos do sistema.
            </li>
            <li>
              Segurança da conta, se você ligar a verificação em duas etapas: os jeitos escolhidos (código por e-mail
              ou app autenticador), a chave do app autenticador, guardada criptografada, e os códigos de recuperação,
              guardados de um jeito que nem nós conseguimos ler.
            </li>
            <li>
              Mensagens para o suporte, se você escrever para nós: a mensagem e o seu e-mail, para podermos responder.
              Não é preciso contar dados de saúde para pedir ajuda.
            </li>
            <li>
              Nas Tarefas: o título opcional, a descrição do que ficou combinado, a profissional indicada e a resposta
              em texto ou a indicação de que você não conseguiu fazer ou de que não faz sentido agora. São dados de
              saúde. Só as profissionais com vínculo ativo e com a área Tarefas liberada por você podem ler. Esses
              textos não aparecem nas notificações nem nos registros técnicos do sistema.
            </li>
            <li>
              No Sono e humor: os horários em que você deitou e acordou, a nota do sono, a nota do humor e a palavra
              do dia, se escrever. No Remédio: se você tomou como combinado em cada dia (Sim, Esqueci algum ou
              Hoje não). São dados de saúde: só as profissionais com vínculo ativo e com a área liberada por você
              podem ver.
            </li>
            <li>
              Em Remédios e o que sinto, se você ligar: o nome, a dose e o horário dos remédios que anotar, as
              mudanças com data e nota, e o que tem sentido, com a data, a intensidade, a observação e o remédio que
              você ligar a isso. O Faísca não avalia remédios nem sintomas. São dados de saúde: só as profissionais
              com vínculo ativo e com a área liberada por você podem ver, e eles não aparecem nas notificações nem
              nos registros técnicos do sistema.
            </li>
            <li>Seus vínculos com terapeutas.</li>
            <li>
              Nas Mensagens: o texto, o assunto, quem enviou e a hora de envio, e até quando cada pessoa viu a
              conversa (só para mostrar a ela que chegou mensagem nova; a outra pessoa nunca vê) e, no assunto "Sobre um
              registro", qual registro seu você apontou (só a referência, não uma cópia; a profissional vê o começo dele
              só se a área estiver liberada para ela). Só as duas pessoas do vínculo ativo
              podem acessar a conversa, após aceitarem este aviso. As mensagens podem conter dados de saúde.
              O texto, o assunto e o nome de quem enviou ficam fora dos avisos e dos registros técnicos.
              Os avisos por e-mail e no aparelho começam ligados e podem ser desligados em Conta.
              O aparelho só recebe avisos se você permitir no navegador.
            </li>
            <li>
              Você pode baixar uma cópia das conversas ainda acessíveis. Encerrar o vínculo fecha o acesso para as
              duas pessoas e mantém o histórico protegido. Excluir a conta de qualquer uma delas apaga a conversa
              do aplicativo. As cópias de segurança seguem o prazo indicado abaixo.
            </li>
            <li>No mural: os avisos que a terapeuta escreve e, para você, quais avisos já viu.</li>
            <li>Na Comunidade, se decidir participar: o apelido escolhido, sua confirmação de que tem 18 anos ou mais, o aceite das regras, se quer avisar o grupo quando entrar e as publicações, comentários e denúncias que fizer. Não guardamos sua data de nascimento.</li>
            <li>
              Nos lembretes: o canal escolhido (e-mail ou notificação no aparelho), os horários de manhã, de noite e
              de silêncio, a data até quando os lembretes estão pausados e, se você ativar a notificação no aparelho,
              o endereço técnico que o navegador gera para entregá-la.
            </li>
            <li>
              Se você pedir para ver quando uma profissional lê os seus registros: o pedido e a resposta dela, em
              cada vínculo. Se você é profissional, a sua resposta a esse pedido.
            </li>
            <li>
              No seu aparelho: só o cookie de sessão, a preferência de tema claro ou escuro, a paleta de cores e os
              ajustes de leitura confortável, de menos movimento e as preferências de atalhos e cartões do início.
              Essas escolhas do início ficam neste navegador, separadas por conta, sem o conteúdo dos registros.
            </li>
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
            Para você registrar suas atividades, o seu Registro de Pensamentos, os seus Episódios de tensão, as
            suas ações, os seus planos de ação, as Tarefas combinadas na consulta, o seu sono e humor e, se quiser,
            se tomou o remédio como combinado, os seus remédios e o que tem sentido, e,
            se quiser, compartilhá-los com quem cuida de você (psicóloga ou psiquiatra). Também usamos
            o seu e-mail para mensagens da conta (confirmação, nova senha e aviso de exclusão), para, se quiser, participar
            da comunidade opcional de apoio da psicóloga com vínculo ativo e, se os lembretes estiverem ligados, para avisar
            que há atividades ou ações para ver, sempre sem mostrar o que você escreveu. Não
            vendemos dados, não mostramos anúncios e não usamos ferramentas de rastreamento.
          </p>
        </Section>

        <Section title="Quem vê">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Você vê tudo o que registrou.</li>
            <li>
              Você pode compartilhar com até duas profissionais (uma psicóloga e uma psiquiatra) e escolher, para
              cada uma, quais áreas ela vê: atividades, fotos das atividades, Registro de Pensamentos, Episódios
              de tensão, Ação, fotos das ações, “Sobre mim”, agenda com os motivos, Meus Planos, Tarefas, Sono e
              humor, Remédio e Remédios e o que sinto. Uma profissional nova começa sem ver
              nada. Ela só lê, sem alterar nada, enquanto o vínculo existir. Você muda o que cada uma vê, ou
              desfaz o vínculo, a qualquer momento em <strong>Conta</strong>, e vale na hora. Cada profissional
              pode marcar os seus registros como lidos, para se organizar. Essa marca é dela: a outra profissional
              nunca a vê. Se você pedir em <strong>Conta</strong> e ela ativar, você vê a data em que ela leu cada
              registro, só das áreas que você libera para ela, e nunca o que falta ler. Ela pode não ativar, e
              qualquer um dos dois desliga quando quiser. Se você é profissional, só os pacientes para quem você
              ativar veem quando você marcou os registros deles como lidos.
            </li>
            <li>
              Se você é terapeuta, o seu nome, o seu e-mail e a sua foto de perfil, se tiver, aparecem para os
              pacientes vinculados. Se você é paciente, a sua foto de perfil, se tiver, aparece para a terapeuta
              vinculada.
            </li>
            <li>
              Os avisos da terapeuta vinculada aparecem para você enquanto o vínculo existir. Só você sabe quais já
              leu. Se você é terapeuta, os avisos que publica aparecem para todos os pacientes vinculados, que não
              veem uns aos outros.
            </li>
            <li>Na comunidade da sua psicóloga, os membros veem as publicações e os comentários aprovados e o apelido que cada pessoa escolheu. A psicóloga responsável e a pessoa moderadora também leem esse conteúdo para cuidar do grupo; a moderação não dá acesso aos seus registros clínicos. A comunidade é opcional e só para maiores de 18 anos. O acesso fica suspenso quando o vínculo termina; se a psicóloga excluir a conta, a comunidade e todos os conteúdos são apagados.</li>
          </ul>
        </Section>

        <Section title="Onde ficam">
          <p>
            Nos servidores do Railway (banco de dados e API) e da Vercel (site), nos{' '}
            <strong>Estados Unidos</strong>. Os e-mails saem pelo Resend, a partir de servidores em São Paulo. As
            cópias de segurança ficam no Cloudflare R2, também <strong>fora do Brasil</strong>. As mensagens enviadas
            ao suporte ficam no Zoho Mail, nos <strong>Estados Unidos</strong>.
          </p>
        </Section>

        <Section title="Como protegemos">
          <p>
            Conexão sempre criptografada (HTTPS). A terapeuta só consegue ler, nunca alterar nada. Códigos e
            links de vínculo são guardados de forma que não possam ser lidos. Todo dia fazemos uma cópia de
            segurança dos dados, criptografada antes de sair do servidor. Só quem cuida do Faísca tem a chave para
            abri-la, e ela só é usada se acontecer um problema grave, como uma falha que apague dados.
          </p>
        </Section>

        <Section title="Por quanto tempo">
          <p>
            Até você excluir a conta. A exclusão, em <strong>Conta</strong>, apaga tudo do app na hora. As cópias
            de segurança expiram em até <strong>5 semanas</strong> e, até lá, não são abertas. Se precisarmos usar
            uma cópia, apagamos de novo o que já tinha sido excluído. Uma foto também é apagada quando você a
            remove da ação ou da atividade, o que dá para fazer até a próxima consulta depois de avaliar a ação
            ou de concluir a atividade (numa atividade que não aconteceu, a qualquer hora), e segue o mesmo
            prazo nas cópias.
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
            O Faísca é um produto independente, em desenvolvimento. Ele apoia o acompanhamento com quem cuida
            de você (psicóloga ou psiquiatra), mas não substitui o atendimento e não é prontuário. Se você estiver em sofrimento intenso, ligue
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
