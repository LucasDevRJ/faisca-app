import { Card } from '../components/ui/card';

// Provisória: a lista de pacientes vinculados chega na etapa de vínculo.
export function PatientsPage() {
  return (
    <>
      <h1 className="text-4xl font-bold">Meus pacientes</h1>
      <Card className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Em breve por aqui</h2>
        <p className="text-muted">Os registros dos seus pacientes vão aparecer nesta tela.</p>
      </Card>
    </>
  );
}
