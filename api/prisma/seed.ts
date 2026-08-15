import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedHouseBooks, seedPersonalSpace } from '../src/households/space-defaults';

const prisma = new PrismaClient();

type Person = {
  name: string;
  email: string;
  password: string;
  relation: string;
  role: 'ADMIN' | 'MEMBER';
};

function loadFamily(): Person[] {
  const fromEnv = process.env.FAMILY_SEED?.trim();
  if (fromEnv) {
    const parsed = JSON.parse(fromEnv) as Person[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('FAMILY_SEED must be a JSON array of people');
    }
    return parsed;
  }
  const local = join(__dirname, 'family.seed.json');
  const example = join(__dirname, 'family.seed.example.json');
  const file = existsSync(local) ? local : example;
  return JSON.parse(readFileSync(file, 'utf8')) as Person[];
}

async function syncFamily(family: Person[]) {
  await prisma.household.updateMany({
    where: { kind: 'HOUSE' },
    data: { name: 'House' },
  });
  for (const person of family) {
    const passwordHash = await bcrypt.hash(person.password, 10);
    const user = await prisma.user.findUnique({ where: { email: person.email } });
    if (!user) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: { name: person.name, relation: person.relation, passwordHash },
    });
    await prisma.household.updateMany({
      where: {
        kind: 'PERSONAL',
        memberships: { some: { userId: user.id } },
      },
      data: { name: `${person.name}` },
    });
  }
}

async function main() {
  const family = loadFamily();
  const already = await prisma.user.count();
  if (already > 0) {
    await syncFamily(family);
    console.log(`Family is fixed (${family.length} people). Names and passwords synced.`);
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const house = await tx.household.create({
        data: { name: 'House', kind: 'HOUSE', currency: 'EGP' },
      });
      await seedHouseBooks(tx, house.id);

      for (const person of family) {
        const passwordHash = await bcrypt.hash(person.password, 10);
        const user = await tx.user.create({
          data: {
            name: person.name,
            email: person.email,
            passwordHash,
            relation: person.relation,
          },
        });
        await seedPersonalSpace(tx, user.id, person.name);
        await tx.membership.create({
          data: {
            userId: user.id,
            householdId: house.id,
            role: person.role,
          },
        });
      }
    },
    { maxWait: 20000, timeout: 120000 },
  );

  console.log(`Seeded ${family.length} people.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
