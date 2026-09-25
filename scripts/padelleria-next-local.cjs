// Prime Next's environment loader with an empty directory. Never load repository .env files.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (process.env.SUPABASE_URL !== 'http://127.0.0.1:55021' || process.env.NEXT_PUBLIC_SUPABASE_URL !== process.env.SUPABASE_URL) throw new Error('Local Supabase required');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'movi-local-env-'));
require('@next/env').loadEnvConfig(dir);
fs.rmdirSync(dir);
require('next/dist/bin/next');
