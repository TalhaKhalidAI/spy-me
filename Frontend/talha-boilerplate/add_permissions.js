import prisma, { prismaManager } from '../../src/config/databases.js';

const permissions = [
  { name: 'permission.view.screen', description: 'View screen shares' },
];

async function main() {
  console.log('Adding missing permissions...');
  
  for (const perm of permissions) {
    const p = await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
    console.log(`Upserted permission: ${p.name}`);
  }
  
  console.log('Finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prismaManager.disconnect();
  });
