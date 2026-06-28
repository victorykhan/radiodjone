import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
const hash = await bcrypt.hash("Admin@2026!", 10);
const user = await prisma.user.upsert({
  where: { email: "admin@vawam.ca" },
  update: { passwordHash: hash, role: "ADMIN" },
  create: { email: "admin@vawam.ca", passwordHash: hash, role: "ADMIN" }
});
console.log("Admin user created:", user.email, "role:", user.role);
await prisma.$disconnect();
