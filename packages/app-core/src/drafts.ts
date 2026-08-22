import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApi } from "./api";
import { createDraftQueue } from "./drafts-core";

export const draftQueue = createDraftQueue(AsyncStorage, (input) => getApi().completeWorkout(input));
