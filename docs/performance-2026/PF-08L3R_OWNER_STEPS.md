# PF-08L3R — Owner steps for a later extraction

## Important

These instructions are for a **later, separately approved execution task**. Do not run them as part of PF-08L3R planning.

Never paste a database password, connection string, API key or dump contents into ChatGPT. If any screen or terminal shows a secret, do not screenshot or copy it into project documentation.

## OWNER DOES

### 1. Confirm the production project

1. Sign in to Supabase Dashboard.
2. Open the known MOVIPadel **production** project.
3. Record the `project reference` privately and compare it with the production project identity already known to the owner.
4. Stop if there is any uncertainty about the project.

### 2. Obtain connection field names privately

Open **Connect** in the production project and choose:

- `Direct connection` if the computer can reach the direct endpoint; otherwise
- `Session pooler`, not Transaction pooler.

Privately record:

- `<PROD_PROJECT_REF>`
- `<CONNECTION_TYPE>`
- `<PROD_HOST>`
- `<PROD_PORT>`
- `<PROD_DATABASE>`
- `<PROD_USER>`
- `<PROD_PASSWORD>`
- `<SSL_MODE>`
- `<CA_CERT_PATH>` after downloading the server root certificate, if offered

Do not place these in the repository. The password must not be written into any command or note.

### 3. Prepare the PostgreSQL client

1. Install or locate `pg_dump` only from a trusted PostgreSQL distribution.
2. In a fresh PowerShell window, run the local-only version check:

```powershell
& "<PG_DUMP_EXE>" --version
```

3. Do not connect yet.
4. The client major version must be at least the production server major. The intended local target is PostgreSQL 17, so stop for review if production is newer than 17 or if the dump client is older than production.

### 4. Create a unique temporary output directory

Choose a new directory outside the repository:

```powershell
$pf08ExtractDir = Join-Path $env:TEMP "movipadel-schema-extraction\<UTC_TIMESTAMP>"
New-Item -ItemType Directory -Path $pf08ExtractDir -ErrorAction Stop
$pf08Partial = Join-Path $pf08ExtractDir "production-public-schema.partial.sql"
$pf08Raw = Join-Path $pf08ExtractDir "production-public-schema.raw.sql"
if ((Test-Path -LiteralPath $pf08Partial) -or (Test-Path -LiteralPath $pf08Raw)) {
  throw "Extraction output already exists; choose a new timestamp."
}
```

`<UTC_TIMESTAMP>` is a new value such as `YYYYMMDDTHHMMSSZ`. It contains no secret.

### 5. Run only after separate explicit approval

Use the exact reviewed shape below. All angle-bracket values are placeholders. Do not paste a password into the command.

```powershell
$env:PGSSLMODE = "verify-full"
$env:PGSSLROOTCERT = "<CA_CERT_PATH>"
$env:PGOPTIONS = "-c default_transaction_read_only=on"

& "<PG_DUMP_EXE>" `
  --host="<PROD_HOST>" `
  --port="<PROD_PORT>" `
  --username="<PROD_USER>" `
  --dbname="<PROD_DATABASE>" `
  --password `
  --schema-only `
  --schema=public `
  --format=plain `
  --encoding=UTF8 `
  --lock-wait-timeout=5s `
  --file="$pf08Partial"

$pf08DumpExit = $LASTEXITCODE
Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
Remove-Item Env:PGSSLROOTCERT -ErrorAction SilentlyContinue
Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue

if ($pf08DumpExit -ne 0) {
  throw "Schema extraction failed with exit code $pf08DumpExit. The partial file is not valid evidence."
}

Move-Item -LiteralPath $pf08Partial -Destination $pf08Raw -ErrorAction Stop
```

When prompted, type `<PROD_PASSWORD>` interactively. PowerShell will not show it as part of the command.

If certificate verification cannot be configured exactly as reviewed, stop. Do not silently change `verify-full` to an unverified mode. If `PGOPTIONS` is rejected, stop. Do not rerun without the read-only guard.

### 6. Stop after extraction

1. Do not open the raw file in a cloud editor or upload it.
2. Do not copy it into `supabase/migrations/`.
3. Do not run `psql`, `supabase db reset`, `supabase db push`, `supabase link`, or any restore command.
4. Notify Codex only that the command succeeded or failed and provide the **local file path**, never the password or connection string.

## CODEX REVIEWS

In a later task, Codex may inspect the local raw path and:

1. confirm the file is plain-text schema evidence and not a partial file;
2. scan for row data, credentials, URLs, owner/grant statements, destructive commands and external side effects;
3. inventory tables, constraints, indexes, RLS, policies, functions, triggers, views and sequences;
4. compare the dump with the audit CSVs;
5. identify the exact supplemental read-only catalog queries required for extensions, server version and metadata gaps;
6. produce a sanitized reviewed evidence artifact;
7. stop before local import or migration creation unless a later task explicitly authorizes it.

Codex must not ask the owner to paste secrets or the complete dump into chat.

## DO NOT DO

- Do not run these steps without separate owner approval.
- Do not run `supabase link`, `db pull`, `db push`, `migration up`, remote reset or remote migration commands.
- Do not use the transaction pooler.
- Do not place the password in a URL, variable, `.env`, `.pgpass`, script, screenshot, chat or documentation.
- Do not use `--clean`, `--create`, `--data-only`, `--inserts`, `--use-copy`, `--jobs`, or an unreviewed additional flag.
- Do not remove `--schema-only`, `--schema=public`, TLS verification, the read-only session guard, or the lock timeout.
- Do not overwrite an existing output file.
- Do not apply the raw dump locally or remotely.
- Do not copy production row data.
- Do not commit the raw dump before review.

## Failure handling

- **Wrong credentials:** stop and re-check the Dashboard fields. Do not guess.
- **Network failure:** keep the failed file marked `.partial.sql` or safely remove it; retry later in a new timestamped directory.
- **Non-zero exit:** do not rename the file and do not treat it as evidence.
- **Existing output:** stop and create a new timestamped directory.
- **Lock timeout:** retry during a quieter period; do not increase the timeout without review.
- **Unsupported extension/version:** stop and ask for review; do not edit or import the dump.
- **Any unexpected prompt or command behavior:** cancel with Ctrl+C before entering credentials and request review.
