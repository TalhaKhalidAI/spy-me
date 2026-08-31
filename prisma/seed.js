import prisma, { prismaManager } from '../src/config/databases.js';

const permissions = [
  { name: 'permission.room.view', description: 'View available rooms' },
  { name: 'permission.room.create', description: 'Create new rooms' },
  { name: 'permission.room.update', description: 'Update existing room details' },
  { name: 'permission.room.delete', description: 'Delete rooms' },
  { name: 'permission.sfu.start', description: 'Start the SFU server instance' },
  { name: 'permission.sfu.stop', description: 'Stop the SFU server instance' },
  { name: 'permission.sfu.restart', description: 'Restart the SFU server' },
  { name: 'permission.sfu.reset', description: 'Reset SFU state' },
  { name: 'permission.view.uplink', description: 'View uplink streams and producers' },
  { name: 'permission.view.downlink', description: 'View downlink streams and consumers' },
  { name: 'permission.view.video', description: 'View video streams' },
  { name: 'permission.remove.peer', description: 'Force remove peers/producers/consumers' },
];

async function main() {
  console.log('Start seeding permissions...');
  
  // prisma is already instantiated and connected from config
  for (const perm of permissions) {
    const p = await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
    console.log(`Upserted permission: ${p.name}`);
  }
  
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prismaManager.disconnect();
  });
