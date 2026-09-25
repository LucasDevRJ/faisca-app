// Erro esperado de regra de negócio, com status HTTP e código estável para o front.
// Ex.: new AppError(409, 'ACTIVITY_FINALIZED', 'Atividade finalizada não pode ser editada.')
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
