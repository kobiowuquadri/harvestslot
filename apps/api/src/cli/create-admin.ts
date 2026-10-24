/**
 * Creates (or promotes) a platform administrator.
 *
 *   HS_ADMIN_PASSWORD='…' pnpm admin:create -- --email ops@your-domain --name "Operations"
 *
 * The password is read from HS_ADMIN_PASSWORD (or from standard input when that is not set) so it
 * never appears in shell history or process listings. When ADMIN_REQUIRE_MFA is on (always in
 * production), the administrator must set up two-factor authentication at first sign-in before any
 * admin endpoint is usable. Every run is recorded in the audit log.
 */
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { emailAddress, password as passwordSchema } from '@harvestslot/contracts';
import { audit } from '@harvestslot/core';
import { PrismaService } from '../common/prisma.service.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { createCliContext } from './context.js';

async function readPassword(): Promise<string> {
  if (process.env.HS_ADMIN_PASSWORD) return process.env.HS_ADMIN_PASSWORD;
  const rl = createInterface({ input: process.stdin, terminal: false });
  process.stderr.write('Password (min 10 characters), then Enter: ');
  for await (const line of rl) {
    rl.close();
    return line.trim();
  }
  return '';
}

async function main() {
  const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
  const email = emailAddress.safeParse(values.email ?? '');
  if (!email.success) throw new Error('Pass --email with a valid address');
  const name = (values.name ?? 'Administrator').trim().slice(0, 120);
  const pw = passwordSchema.safeParse(await readPassword());
  if (!pw.success) throw new Error(`Password rejected: ${pw.error.issues.map((i) => i.message).join('; ')}`);

  const ctx = await createCliContext();
  try {
    const prisma = ctx.get(PrismaService).db;
    const auth = ctx.get(AuthService);
    const passwordHash = await auth.hashPassword(pw.data);
    const existing = await prisma.user.findUnique({ where: { email: email.data } });
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { platformRole: 'ADMIN', passwordHash, status: 'ACTIVE', version: { increment: 1 } } })
      : await prisma.user.create({ data: { email: email.data, emailVerifiedAt: new Date(), displayName: name, passwordHash, platformRole: 'ADMIN' } });
    // A new password invalidates any existing sessions for this account.
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await audit(prisma, { actor: null, actorParty: 'CLI', action: existing ? 'admin.promoted-by-cli' : 'admin.created-by-cli', entityType: 'user', entityId: user.id });
    console.log(`${existing ? 'Promoted' : 'Created'} administrator ${email.data} (${user.id}). Sign in and set up two-factor authentication.`);
  } finally {
    await ctx.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
