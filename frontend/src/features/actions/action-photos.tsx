import { RecordPhotos, type PhotoKind, type PhotosViewer } from '../photos/record-photos';
import { actionPhotoUrl, MAX_ACTION_PHOTOS, type Action } from './actions-api';
import { useAddActionPhoto, useRemoveActionPhoto } from './use-actions';

// Fotos da Ação avaliada (DEC-064, DEC-065): o paciente adiciona e remove até a próxima consulta
// depois da avaliação; a terapeuta só vê. O visual e o envio ficam no RecordPhotos (DEC-104).

export type { PhotosViewer };

function useAdd() {
  const mutation = useAddActionPhoto();
  return {
    ...mutation,
    mutateAsync: ({ recordId, file }: { recordId: string; file: File }) =>
      mutation.mutateAsync({ actionId: recordId, file }),
  };
}

function useRemove() {
  const mutation = useRemoveActionPhoto();
  return {
    ...mutation,
    mutate: ({ recordId, photoId }: { recordId: string; photoId: string }, options: { onSuccess: () => void }) =>
      mutation.mutate({ actionId: recordId, photoId }, options),
  };
}

const ACTION_PHOTOS: PhotoKind = {
  area: 'actionPhotos',
  consentTitle: 'Fotos da Ação',
  noun: 'ação',
  max: MAX_ACTION_PHOTOS,
  audienceNote: 'As fotos aparecem para a sua psicóloga.',
  url: actionPhotoUrl,
  useAdd,
  useRemove,
};

export function ActionPhotos({ action, viewer }: { action: Action; viewer: PhotosViewer }) {
  const canChange = viewer.kind === 'patient' && action.status === 'AVALIADA' && action.photosOpen;
  return (
    <RecordPhotos
      record={action}
      kind={ACTION_PHOTOS}
      viewer={viewer}
      visible={action.status === 'AVALIADA'}
      canAdd={canChange}
      canRemove={canChange}
    />
  );
}
