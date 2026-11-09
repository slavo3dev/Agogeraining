import { platform } from "./platform";
export const v4 = (): string => platform().randomUUID();
