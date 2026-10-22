export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Nemáte oprávnění pro tuto akci.');
