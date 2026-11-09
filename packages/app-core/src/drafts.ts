import { getApi } from "./api";
import { createDraftQueue } from "./drafts-core";
import { platform } from "./platform";

/** Storage is resolved lazily so this module can load before `configurePlatform` runs. */
const lazyStorage = {
  getItem: (k: string) => platform().storage.getItem(k),
  setItem: (k: string, v: string) => platform().storage.setItem(k, v),
};
export const draftQueue = createDraftQueue(lazyStorage, (input) => getApi().completeWorkout(input));
