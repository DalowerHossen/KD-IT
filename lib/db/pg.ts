// path: lib/db/pg.ts
import "server-only";

import pg from "pg";

import { getServerEnv } from "@/lib/config/env";
import { DatabaseError } from "@/lib/errors/app-errors";

const { Pool, types } = pg;

/**
 * Step 02 direct PostgreSQL surface (privileged, server-only). All money
 * and wide-counter columns are delivered as strings so binary floating
 * point can never enter monetary math; float8 response values are refused
 * entirely as a defense against accidental drift-prone columns. Timestamp
 * columns are also delivered as strings so repository row schemas and
 * audit serialization never depend on Date instance identity.
 */
types.setTypeParser(1700, (value: string): string => value); // numeric
types.setTypeParser(20, (value: string): string => value); // int8
types.setTypeParser(1184, (value: string): string => value); // timestamptz
types.setTypeParser(1114, (value: string): string => value); // timestamp
types.setTypeParser(701, (value: string): never => {
  throw new DatabaseError("float8 response columns are prohibited in this platform.", {
    details: { preview: value.slice(0, 20) },
  });
});

let pool: InstanceType<typeof Pool> | null = null;

export function getPgPool(): InstanceType<typeof Pool> {
  if (pool !== null) {
    return pool;
  }
  const env = getServerEnv();
  if (env.KD_DATABASE_URL === undefined) {
    throw new DatabaseError(
      "Direct database access is not configured. Set KD_DATABASE_URL in the server environment.",
    );
  }
  pool = new Pool({
    connectionString: env.KD_DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "kd-solution-it",
  });
  pool.on("error", () => {
    // Idle-client failures must never crash the process; query sites handle
    // errors through the DatabaseError boundary below.
  });
  return pool;
}

export type PgClient = pg.PoolClient;

/**
 * Wraps pg failures in DatabaseError without exposing driver internals,
 * SQL text, or connection details to callers.
 */
export function toDatabaseError(error: unknown): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "unknown";
  return new DatabaseError("Database operation failed.", { details: { driverCode: code } });
}

/**
 * Runs a query against the privileged pool. Callers always pass explicit
 * column lists; this helper refuses SELECT * defensively.
 */
export async function pgQuery(
  text: string,
  params: readonly unknown[] = [],
): Promise<pg.QueryResult<Record<string, unknown>>> {
  if (/\bselect\s+\*(?!\s+into\b)/i.test(text)) {
    throw new DatabaseError("SELECT * is not permitted by platform convention.");
  }
  const activePool = getPgPool();
  try {
    return await activePool.query(text, [...params]);
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/**
 * Executes a set of queries inside one transaction with explicit commit
 * boundaries and tenant-context settings applied as LOCAL values.
 */
export async function withPgTransaction<T>(
  run: (client: PgClient) => Promise<T>,
  contextSettings?: Readonly<Record<string, string>>,
): Promise<T> {
  const activePool = getPgPool();
  const client = await activePool.connect().catch((error: unknown) => {
    throw toDatabaseError(error);
  });
  try {
    await client.query("BEGIN");
    for (const [key, value] of Object.entries(contextSettings ?? {})) {
      if (!/^[a-z][a-z0-9_.]{2,60}$/.test(key)) {
        throw new DatabaseError("Invalid tenant-context setting name.", { details: { key } });
      }
      await client.query("select set_config($1, $2, true)", [key, value]);
    }
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw toDatabaseError(error);
  } finally {
    client.release();
  }
}

/** Explicit column-list hygiene for client query builders. */
export function explicitColumnsSql(columnList: string): string {
  const columns = columnList.split(",").map((part) => part.trim());
  if (
    columns.length === 0 ||
    columns.some((column) => !/^[a-xz][a-z0-9_]*(\s+as\s+[a-z][a-z0-9_]*)?$/i.test(column)) ||
    columns.includes("*")
  ) {
    throw new DatabaseError("Explicit column lists may contain qualified column names only.");
  }
  return columns.join(", ");
}
