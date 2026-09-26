import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DB_URL = process.env.DB_URL;
if (!DB_URL) {
  console.error("Set DB_URL env var");
  process.exit(1);
}

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SEED_FILE = join(process.cwd(), "supabase", "seed.sql");

async function main() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  console.log("Connecting to Supabase...");
  await client.connect();
  console.log("Connected!\n");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write("Running " + file + "...");
    try {
      await client.query(sql);
      console.log(" OK");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("already exists") || msg.includes("duplicate key")) {
        console.log(" Skipped (exists)");
      } else {
        console.log(" WARN: " + msg);
      }
    }
  }

  process.stdout.write("Running seed.sql...");
  try {
    await client.query(readFileSync(SEED_FILE, "utf8"));
    console.log(" OK");
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("duplicate key") || msg.includes("already exists")) {
      console.log(" Skipped (seeded)");
    } else {
      console.log(" WARN: " + msg);
    }
  }

  const result = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  console.log("\nTables in database:");
  for (const row of result.rows) {
    console.log("  - " + row.tablename);
  }

  await client.end();
  console.log("\nAll done!");
}

main().catch((e) => {
  console.error("Fatal: " + e.message);
  process.exit(1);
});
