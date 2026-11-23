import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { buttonClasses } from '../components/ui/button-styles';
import { AnnouncementEmailSetting } from '../features/announcements/announcement-email-setting';
import { useSession } from '../features/auth/use-session';
import { HomeLayoutSettings } from '../features/home-layout/home-layout';
import { HomeShortcutSettings } from '../features/home-shortcuts/home-shortcuts';
import { AccessibilitySection } from '../features/profile/accessibility-section';
import { HighlightSetting } from '../features/profile/highlight-setting';
import { ProfileSection } from '../features/profile/profile-section';
import { RemindersSection } from '../features/reminders/reminders-section';

const accountSettingTitles = {
  personalizacao: 'Personalização',
  acessibilidade: 'Acessibilidade',
  notificacoes: 'Notificações',
} as const;

export function AccountSettingsPage({ section }: { section: keyof typeof accountSettingTitles }) {
  const { data: user } = useSession();
  const { hash } = useLocation();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!hash) titleRef.current?.focus();
  }, [section, hash, user?.id]);
  if (!user) return null;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link to="/conta" className="inline-flex min-h-11 self-start items-center font-medium text-primary-text underline underline-offset-4">
          ‹ Voltar para Conta
        </Link>
        <h1 ref={titleRef} tabIndex={-1} className="text-3xl font-bold sm:text-4xl">
          {accountSettingTitles[section]}
        </h1>
      </div>

      {section === 'personalizacao' && (
        <>
          <ProfileSection appearance />
          <HighlightSetting key={`highlight:${user.id}`} userId={user.id} highContrast={user.palette === 'ALTO_CONTRASTE'} />
          {user.profiles.patient && <HomeShortcutSettings key={user.id} userId={user.id} />}
          {user.profiles.patient && <HomeLayoutSettings key={`layout:${user.id}`} userId={user.id} />}
        </>
      )}
      {section === 'acessibilidade' && <AccessibilitySection />}
      {section === 'notificacoes' && (
        <>
          <AnnouncementEmailSetting />
          <Link to="/mensagens/avisos" className={buttonClasses('secondary', 'self-start')}>
            Configurar avisos de mensagens
          </Link>
          {user.profiles.patient && <RemindersSection />}
        </>
      )}
    </>
  );
}
