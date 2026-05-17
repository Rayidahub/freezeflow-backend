// src/utils/seed.ts
// Seeds the database with default staff users and products.
// Run: npx ts-node src/utils/seed.ts

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // ─── Staff Users ──────────────────────────────────────────────────────────
  const SALT_ROUNDS = 12;

  const staffUsers = [
    {
      fullName: 'Super Admin',
      email: 'admin@freezeflow.com',
      password: 'password123',
      role: 'super_admin' as const,
    },
    {
      fullName: 'Operations Staff',
      email: 'ops@freezeflow.com',
      password: 'password123',
      role: 'operations' as const,
    },
    {
      fullName: 'Delivery Staff',
      email: 'delivery@freezeflow.com',
      password: 'password123',
      role: 'delivery' as const,
    },
  ];

  for (const staff of staffUsers) {
    const passwordHash = await bcrypt.hash(staff.password, SALT_ROUNDS);
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: { passwordHash, role: staff.role, fullName: staff.fullName },
      create: {
        fullName: staff.fullName,
        email: staff.email,
        passwordHash,
        role: staff.role,
      },
    });
    console.log(`✅ Staff user seeded: ${user.email} (${user.role})`);
  }

  // ─── Products ─────────────────────────────────────────────────────────────
  const products = [
    { name: 'Small Ice Block', sizeKg: 5, price: 500, isAvailable: true },
    { name: 'Large Ice Block', sizeKg: 10, price: 1000, isAvailable: true },
    { name: 'Extra Large Ice Block', sizeKg: 25, price: 2200, isAvailable: true },
  ];

  for (const product of products) {
    const created = await prisma.product.upsert({
      where: { id: `product-${product.name.toLowerCase().replace(/\s+/g, '-')}` },
      update: product,
      create: {
        id: `product-${product.name.toLowerCase().replace(/\s+/g, '-')}`,
        ...product,
      },
    });
    console.log(`✅ Product seeded: ${created.name} – ₦${created.price} (${created.sizeKg}kg)`);
  }

  console.log('\n🎉 Seed completed successfully!');
  console.log('\nStaff login credentials:');
  console.log('  Super Admin : admin@freezeflow.com    / password123');
  console.log('  Operations  : ops@freezeflow.com      / password123');
  console.log('  Delivery    : delivery@freezeflow.com / password123');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
