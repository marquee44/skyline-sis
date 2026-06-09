---
description: Back up the Skyline SIS database + secrets to /root/skyline-backups
---

Run the SIS backup script and report the result:

```bash
bash scripts/backup-sis.sh
```

This dumps the `skyline_sis` Postgres database (custom + plain SQL), copies the
`.env` secrets and pm2 config, records the git HEAD, and writes a manifest +
checksums into a timestamped `/root/skyline-backups/<ts>-sis/` folder. It keeps
the last 14 SIS backups.

After it runs, confirm the destination path, the artifact sizes, and the table
row counts from the manifest. If the dump fails, the most common cause is the
Prisma-only `?schema=public` suffix on `DATABASE_URL` (the script already strips
it) or a stale pm2 env — see the deployment notes.
