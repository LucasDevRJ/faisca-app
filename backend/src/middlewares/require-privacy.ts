import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { coversArea, type PrivacyArea } from '../modules/auth/privacy.js';
import { getAuthUser } from './require-auth.js';

const AREA_NAMES: Record<PrivacyArea, string> = {
  thoughtRecords: 'o Registro de Pensamentos',
  tensionEpisodes: 'os Episódios de tensão',
  appointmentSchedule: 'a agenda de consultas',
};

// Cada área de dado novo entrou no aviso de privacidade numa versão (DEC-039, DEC-042). Quem
// ainda não aceitou uma versão que cubra a área não a usa, nem como paciente nem como terapeuta;
// o resto do app segue funcionando. Vem depois do requireAuth (e, na terapeuta, do vínculo).
export function requirePrivacy(area: PrivacyArea): RequestHandler {
  return (req, _res, next) => {
    if (!coversArea(getAuthUser(req).privacyVersion, area)) {
      throw new AppError(
        403,
        'PRIVACY_CONSENT_REQUIRED',
        `Para usar ${AREA_NAMES[area]}, leia e aceite a versão atual do aviso de privacidade.`,
      );
    }
    next();
  };
}
