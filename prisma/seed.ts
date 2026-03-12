import { PrismaClient } from "@prisma/client";
import { scrypt, randomBytes } from "node:crypto";

// ─── Admin User Seed ───────────────────────────────────────────────────────────
// Seeds the initial admin user on first run. Reads credentials from env
// or falls back to development defaults.

const prisma = new PrismaClient();

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(32);
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err !== null) reject(err);
      else resolve(`${salt.toString("hex")}:${derivedKey.toString("hex")}`);
    });
  });
}

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@belva.dev";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin-dev-password-change-me";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  console.log(`Seeding admin user: ${email}`);

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      name,
      role: "ADMIN",
      status: "ACTIVE",
    },
    create: {
      email,
      passwordHash,
      name,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  console.log("Admin user seeded successfully");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error("Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
