import { PrismaClient } from '@prisma/client';
import { INITIAL_EVENTS } from '../lib/constants';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const existingCount = await prisma.event.count();
  if (existingCount > 0) {
    console.log('Events already exist, skipping seed.');
    return;
  }

  for (const event of INITIAL_EVENTS) {
    await prisma.event.create({
      data: {
        name: event.name,
        startDate: new Date(event.startDate),
        totalTarget: event.totalTarget,
        perToneTarget: event.perToneTarget,
        tier: event.tier,
      },
    });
  }

  console.log(`Seeded ${INITIAL_EVENTS.length} events successfully!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
