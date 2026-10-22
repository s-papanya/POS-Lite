import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.enum(["127.0.0.1", "::1", "0.0.0.0"]).default("127.0.0.1"),
  PORT: z.string().regex(/^\d+$/).default("3000")
    .transform(Number).pipe(z.number().int().min(1).max(65535)),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export function readConfig(environment: Record<string, string | undefined>) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new Error(`Invalid environment variables: ${fields.join(", ")}`);
  }
  return {
    nodeEnv: result.data.NODE_ENV,
    host: result.data.HOST,
    port: result.data.PORT,
    logLevel: result.data.LOG_LEVEL,
  };
}

export type AppConfig = ReturnType<typeof readConfig>;
