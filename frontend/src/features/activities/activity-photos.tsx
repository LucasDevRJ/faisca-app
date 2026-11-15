import { RecordPhotos, type PhotoKind, type PhotosViewer } from '../photos/record-photos';
import { activityPhotoUrl, MAX_ACTIVITY_PHOTOS, type Activity } from './activities-api';
import { useAddActivityPhoto, useRemoveActivityPhoto } from './use-activities';

// Fotos das atividades (DEC-103, DEC-104), com o mesmo visual das fotos da Ação:
// - aberta (planejada ou pendente): o paciente adiciona e remove, sem prazo;
// - concluída: até a próxima consulta depois da conclusão; depois, as fotos ficam só para ver;
// - não realizada: não recebe fotos, mas as que já tinha saem a qualquer hora.
// A profissional só vê, com a caixa "Fotos das atividades" liberada (a API devolve a lista vazia sem ela).

const ACTIVITY_PHOTOS: PhotoKind = {
  area: 'activityPhotos',
  consentTitle: 'Fotos da atividade',
  noun: 'atividade',
  max: MAX_ACTIVITY_PHOTOS,
  audienceNote: 'As fotos aparecem só para quem você liberar em Conta.',
  url: activityPhotoUrl,
  useAdd: useAddActivityPhoto,
  useRemove: useRemoveActivityPhoto,
};

export function ActivityPhotos({ activity, viewer }: { activity: Activity; viewer: PhotosViewer }) {
  const isPatient = viewer.kind === 'patient';
  const notDone = activity.status === 'NAO_REALIZADA';
  const canAdd = isPatient && !notDone && activity.photosOpen;
  const canRemove = isPatient && (notDone || activity.photosOpen);
  return (
    <RecordPhotos
      record={activity}
      kind={ACTIVITY_PHOTOS}
      viewer={viewer}
      visible
      canAdd={canAdd}
      canRemove={canRemove}
      note={
        notDone && activity.photos.length > 0
          ? 'Esta atividade não aconteceu, então não recebe fotos novas. Se quiser, pode tirar as que estão aqui.'
          : undefined
      }
    />
  );
}
