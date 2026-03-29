import { authApi } from "./authApi.js";

const inFlight = new Map<string, Promise<{ user: { id: string; email: string; totpEnabled: boolean } }>>();

export function consumeMagicLinkOnce(token: string) {
  let p = inFlight.get(token);
  if (!p) {
    p = authApi.consumeMagicLink(token);
    inFlight.set(token, p);
    void p.finally(() => {
      inFlight.delete(token);
    });
  }
  return p;
}
