import { ApiError, type InvitationService } from './invitations.ts';
export type Request = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};
export type Response = {
  setHeader(name: string, value: string): void;
  status(code: number): Response;
  json(value: unknown): void;
};
export function invitationHandler(
  getService: () => InvitationService,
  getOrigin: () => string,
) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.method !== 'POST')
        throw new ApiError(405, 'method-not-allowed', 'Nur POST ist erlaubt.');
      if (req.headers.origin !== getOrigin())
        throw new ApiError(
          403,
          'origin-denied',
          'Diese Anfrage ist nicht erlaubt.',
        );
      if (
        !String(req.headers['content-type']).startsWith('application/json') ||
        !req.body ||
        typeof req.body !== 'object' ||
        Array.isArray(req.body) ||
        JSON.stringify(req.body).length > 10000
      )
        throw new ApiError(400, 'invalid-request', 'Ungültige Anfrage.');
      const body = req.body as Record<string, unknown>,
        s = getService();
      let result: unknown;
      if (body.action === 'preview') result = await s.preview(body.token);
      else {
        const header = req.headers.authorization;
        if (typeof header !== 'string' || !header.startsWith('Bearer '))
          throw new ApiError(401, 'unauthenticated', 'Bitte anmelden.');
        const actor = await s.actor(header.slice(7));
        switch (body.action) {
          case 'invite':
            result = await s.invite(actor, body);
            break;
          case 'resend':
            result = await s.resend(actor, body.invitationId);
            break;
          case 'revoke':
            result = await s.revoke(actor, body.invitationId);
            break;
          case 'accept':
            result = await s.accept(actor, body.token);
            break;
          case 'updateTrainer':
            result = await s.updateTrainer(actor, body);
            break;
          default:
            throw new ApiError(400, 'invalid-action', 'Unbekannte Aktion.');
        }
      }
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ApiError)
        res
          .status(error.status)
          .json({ code: error.code, error: error.message });
      else
        res
          .status(500)
          .json({
            code: 'server-error',
            error:
              'Die Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen.',
          });
    }
  };
}
