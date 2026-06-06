// Catalog seed (spec section 13): the five partner faculties + a starter program
// each. Program names/levels are placeholders to confirm while building.
import { PrismaClient, ProgramLevel } from '@prisma/client';

const prisma = new PrismaClient();

const FACULTIES: Array<{
  name: string;
  shortName: string;
  program: { name: string; level: ProgramLevel };
}> = [
  {
    name: 'Fakultet za sport, Univerzitet Union',
    shortName: 'FzS',
    program: { name: 'Sportski menadžment', level: ProgramLevel.BA },
  },
  {
    name: 'Fakultet za medije i komunikacije',
    shortName: 'FMK',
    program: { name: 'Digitalne komunikacije i marketing', level: ProgramLevel.BA },
  },
  {
    name: 'Fakultet za inženjerski menadžment',
    shortName: 'FIM',
    program: { name: 'Poslovni i industrijski menadžment', level: ProgramLevel.BA },
  },
  {
    name: 'Akademija za hotelijerstvo, turizam i wellness',
    shortName: 'AHTW',
    program: { name: 'Hotelijerstvo i turizam', level: ProgramLevel.BA },
  },
  {
    name: 'Akademija za humani razvoj',
    shortName: 'AHR',
    program: { name: 'Psihologija i društvene nauke', level: ProgramLevel.BA },
  },
];

async function main() {
  for (const f of FACULTIES) {
    const university = await prisma.university.upsert({
      where: { id: f.shortName }, // deterministic id keeps the seed idempotent
      update: { name: f.name, shortName: f.shortName },
      create: { id: f.shortName, name: f.name, shortName: f.shortName, country: 'RS' },
    });

    await prisma.program.upsert({
      where: { id: `${f.shortName}-default` },
      update: { name: f.program.name, level: f.program.level },
      create: {
        id: `${f.shortName}-default`,
        universityId: university.id,
        name: f.program.name,
        level: f.program.level,
        tuitionTotal: 0,
        tuitionCurrency: 'AED',
      },
    });
  }

  console.log(`Seeded ${FACULTIES.length} faculties + starter programs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
