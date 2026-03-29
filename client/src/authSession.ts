import { localStore } from "./offline/localStore.js";

const META_USER_ID = "authUserId";

export async function syncLocalUserId(serverUserId: string | null): Promise<void> {
  if (!serverUserId) return;
  const prev = await localStore.getMeta(META_USER_ID);
  if (prev === serverUserId) return;
  await localStore.clearAllUserData();
  await localStore.setMeta(META_USER_ID, serverUserId);
}

export async function clearAuthLocalState(): Promise<void> {
  await localStore.clearAllUserData();
}
