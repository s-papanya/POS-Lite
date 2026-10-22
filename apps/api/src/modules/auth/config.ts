import { z } from "zod";

export function readAuthConfig(env: Record<string, string | undefined>, production: boolean) {
  const result = z.object({
    DATABASE_URL: z.url().refine((value) => {
      const url = new URL(value);
      return ["postgres:", "postgresql:"].includes(url.protocol) && url.username === "pos_lite_app";
    }),
    SESSION_SECRET: z.string().regex(/^[a-f0-9]{64,}$/),
    APP_ORIGIN: z.url().refine((value) => {
      const url = new URL(value);
      return value === url.origin && ["http:", "https:"].includes(url.protocol)
        && (!production || url.protocol === "https:");
    }),
  }).safeParse(env);
  if (!result.success) throw new Error(`Invalid auth environment: ${[...new Set(result.error.issues.map((i) => i.path[0]))].join(", ")}`);
  return { databaseUrl: result.data.DATABASE_URL, secret: result.data.SESSION_SECRET,
    origin: result.data.APP_ORIGIN, production };
}
export type AuthConfig = ReturnType<typeof readAuthConfig>;
