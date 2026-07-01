// Real Lightspeed Systems roster — internal employees who can act as value reviewers.
import { db } from './db.js';
import { employees } from './db/schema/employees.js';
import { sql } from 'drizzle-orm';

const PEOPLE = [
  { name: 'Wes Lawrence', email: 'wlawrence@lightspeedsystems.com' },
  { name: 'Heather James', email: 'hjames@lightspeedsystems.com' },
  { name: 'Morgan Canales', email: 'mcanales@lightspeedsystems.com' },
  { name: 'Amy Bennett', email: 'abennett@lightspeedsystems.com' },
  { name: 'Kathy Williamson', email: 'kwilliamson@lightspeedsystems.com' },
  { name: 'Patrick Chapa', email: 'patrick@lightspeedsystems.com' },
  { name: 'Jonathan Adkins', email: 'jadkins@lightspeedsystems.com' },
  { name: 'Nicole Tribo', email: 'ntribo@lightspeedsystems.com' },
  { name: 'Alex Hesse', email: 'ahesse@lightspeedsystems.com' },
  { name: 'Ryan Passanisi', email: 'rpassanisi@lightspeedsystems.com' },
  { name: 'Mike Durando', email: 'mdurando@lightspeedsystems.com' },
  { name: 'Michael Boggess', email: 'michael@lightspeedsystems.com' },
  { name: 'John Genter', email: 'john@lightspeedsystems.com' },
  { name: 'Juliana Morris', email: 'jmorris@lightspeedsystems.com' },
  { name: 'Frank Romero', email: 'fromero@lightspeedsystems.com' },
  { name: 'Wing Mar', email: 'wing@lightspeedsystems.com' },
  { name: 'Tu Ngo', email: 'tngo@lightspeedsystems.com' },
  { name: 'Syed Gillani', email: 'sgillani@lightspeedsystems.com' },
  { name: 'Marie Wittry', email: 'mwittry@lightspeedsystems.com' },
  { name: 'Juan Rodriguez', email: 'jrodriguez@lightspeedsystems.com' },
  { name: 'Jiana Khazma', email: 'jkhazma@lightspeedsystems.com' },
  { name: 'Gregory Funk', email: 'gfunk@lightspeedsystems.com' },
  { name: 'Cameron Meyer', email: 'cmeyer@lightspeedsystems.com' },
  { name: 'Abraham Ybarra', email: 'aybarra@lightspeedsystems.com' },
  { name: 'Dante Munoz', email: 'dmunoz@lightspeedsystems.com' },
  { name: 'Scott Dunham', email: 'sdunham@lightspeedsystems.com' },
  { name: 'Ryan Bond', email: 'ryan@lightspeedsystems.com' },
  { name: 'Maddie Stewart', email: 'mstewart@lightspeedsystems.com' },
  { name: 'Kyle Olson', email: 'kolson@lightspeedsystems.com' },
  { name: 'James Laprocido', email: 'jlaprocido@lightspeedsystems.com' },
  { name: 'Jake Bowman', email: 'jbowman@lightspeedsystems.com' },
  { name: 'Adrienne Synos', email: 'asynos@lightspeedsystems.com' },
  { name: 'Kate McDermott', email: 'kmcdermott@lightspeedsystems.com' },
  { name: 'Daniel Dunn', email: 'ddunn@lightspeedsystems.com' },
  { name: 'Justin Woolverton', email: 'jwoolverton@lightspeedsystems.com' },
  { name: 'Chris Dunn', email: 'cdunn@lightspeedsystems.com' },
  { name: 'Brad White', email: 'brad@lightspeedsystems.com' },
  { name: 'Spencer Smith', email: 'ssmith@lightspeedsystems.com' },
  { name: 'Andrew Fowler', email: 'afowler@lightspeedsystems.com' },
  { name: 'Jake de la Garrigue', email: 'jdelagarrigue@lightspeedsystems.com' },
  { name: 'Brooke Brown', email: 'bbrown@lightspeedsystems.com' },
  { name: 'Becky Gould', email: 'bgould@lightspeedsystems.com' },
  { name: 'Vernie Ogden', email: 'vernie@lightspeedsystems.com' },
  { name: 'Sergio Villegas', email: 'svillegas@lightspeedsystems.com' },
  { name: 'Michelle McGovern', email: 'mmcgovern@lightspeedsystems.com' },
  { name: 'Sabrina Drouin', email: 'sdrouin@lightspeedsystems.com' },
  { name: 'Niki Greig', email: 'ngreig@lightspeedsystems.com' },
  { name: 'Megan Duhon', email: 'mduhon@lightspeedsystems.com' },
  { name: 'Lauren McNair', email: 'lmcnair@lightspeedsystems.com' },
  { name: 'Andrew Cribari', email: 'acribari@lightspeedsystems.com' },
  { name: 'Alexander Szabo', email: 'aszabo@lightspeedsystems.com' },
  { name: 'Jennifer Duer', email: 'jduer@lightspeedsystems.com' },
  { name: 'William Hellems-Moody', email: 'whellems-moody@lightspeedsystems.com' },
  { name: 'Brock Anderson', email: 'brocka@lightspeedsystems.com' }
];

export async function seedEmployees() {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(employees);
  if ((existing[0]?.n ?? 0) > 0 && !process.env.RESEED) {
    console.log(`  [employees] ${existing[0].n} already present — skipping.`);
    return;
  }
  if ((existing[0]?.n ?? 0) > 0 && process.env.RESEED) {
    console.log('  [employees] RESEED=1 — clearing employees...');
    await db.delete(employees);
  }
  for (const p of PEOPLE) await db.insert(employees).values(p);
  console.log(`  [employees] Seeded ${PEOPLE.length} employees.`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) seedEmployees().then(() => { console.log('Employees seed complete.'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
