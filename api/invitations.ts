import { invitationHandler } from '../server/http.ts';
import { applicationOrigin, service } from '../server/runtime.ts';
export default invitationHandler(service, applicationOrigin);
