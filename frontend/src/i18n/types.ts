export type Locale = "zh" | "en";

type DeepStringMap<T> = {
  [K in keyof T]: T[K] extends readonly string[]
    ? readonly string[]
    : T[K] extends object
      ? DeepStringMap<T[K]>
      : string;
};

export type TranslationDict = DeepStringMap<typeof import("./locales/zh").zh>;
