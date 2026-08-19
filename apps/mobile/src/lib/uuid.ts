import * as Crypto from "expo-crypto";
export const v4 = (): string => Crypto.randomUUID();
