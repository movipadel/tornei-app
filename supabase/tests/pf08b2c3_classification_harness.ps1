param(
  [string]$PsqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
)

$ErrorActionPreference = 'Stop'
$env:DO_NOT_TRACK = '1'

$dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable'
$expectedStatusUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$fixturePath = Join-Path $PSScriptRoot 'fixtures\pf08_reward_classification_fixture.sql'
$candidatePath = Join-Path $PSScriptRoot 'candidates\pf08_reward_classification_candidate.sql'
$validationPath = Join-Path $PSScriptRoot 'pf08b2c3_classification_validation.sql'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('pf08b2c3-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Invoke-LocalScalar {
  param([string]$Sql)
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & $PsqlPath $dbUrl -X -v ON_ERROR_STOP=1 -At -c $Sql 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  if ($exitCode -ne 0) {
    throw "Local SELECT failed: $($output -join [Environment]::NewLine)"
  }
  return ($output -join [Environment]::NewLine).Trim()
}

function Invoke-LocalFile {
  param([string]$Path)
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & $PsqlPath $dbUrl -X -v ON_ERROR_STOP=1 -f $Path 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  if ($exitCode -ne 0) {
    throw "Local SQL file failed: $Path`n$($output -join [Environment]::NewLine)"
  }
  return ($output -join [Environment]::NewLine)
}

function Invoke-LocalReset {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & npx --no-install supabase db reset 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  if ($exitCode -ne 0) {
    throw "Local Supabase reset failed: $($output -join [Environment]::NewLine)"
  }
  Write-Output (($output | Select-Object -Last 1) -join [Environment]::NewLine)
}

function Assert-LocalTarget {
  if (-not (Test-Path -LiteralPath $PsqlPath)) {
    throw "psql not found at $PsqlPath"
  }

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $statusLines = & npx --no-install supabase status 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  if ($exitCode -ne 0) {
    throw 'npx supabase status failed'
  }
  $statusLine = $statusLines | Where-Object { "$_" -match '^\{' } | Select-Object -Last 1
  if (-not $statusLine) {
    throw 'Supabase status did not return JSON'
  }
  $status = $statusLine | ConvertFrom-Json
  if ($null -ne $status.linked_project) {
    throw 'Safety stop: Supabase project is linked'
  }
  if ($status.DB_URL -ne $expectedStatusUrl) {
    throw "Safety stop: unexpected DB_URL $($status.DB_URL)"
  }

  $identity = Invoke-LocalScalar 'SELECT current_database(),current_user,inet_server_addr(),inet_server_port();'
  if ($identity -notmatch '^postgres\|postgres\|') {
    throw "Safety stop: unexpected database identity $identity"
  }
}

function Assert-CandidateFailure {
  param(
    [string]$Name,
    [string]$MutationSql,
    [string]$ExpectedToken
  )
  $candidate = Get-Content -LiteralPath $candidatePath -Raw
  $testPath = Join-Path $tempRoot ($Name + '.sql')
  [IO.File]::WriteAllText(
    $testPath,
    "\set ON_ERROR_STOP on`r`nBEGIN;`r`n$MutationSql`r`n$candidate`r`n"
  )
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & $PsqlPath $dbUrl -X -v ON_ERROR_STOP=1 -f $testPath 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  if ($exitCode -eq 0) {
    throw "Strict-precondition test unexpectedly succeeded: $Name"
  }
  $combined = $output -join [Environment]::NewLine
  if ($combined -notmatch [regex]::Escape($ExpectedToken)) {
    throw "Strict-precondition test returned the wrong failure: $Name`n$combined"
  }
  Write-Output "PASS expected abort: $Name ($ExpectedToken)"
}

$targetVerified = $false
try {
  Assert-LocalTarget
  $targetVerified = $true
  Write-Output 'PASS local target: unlinked 127.0.0.1:54322/postgres'

  Invoke-LocalReset
  Assert-LocalTarget

  Invoke-LocalFile $fixturePath | Out-Null

  $inactiveBefore = Invoke-LocalScalar @"
SELECT md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY r.id), ''))
FROM public.rewards_catalog AS r WHERE NOT r.is_active;
"@
  $historyBefore = Invoke-LocalScalar @"
SELECT md5(coalesce(string_agg(to_jsonb(rr)::text, '|' ORDER BY rr.id), ''))
FROM public.reward_redemptions AS rr;
"@

  Assert-CandidateFailure 'missing-reward' `
    "DELETE FROM public.rewards_catalog WHERE id='157d2e20-293e-4770-9e8d-e04b03aed110';" `
    'PF08B2C3_REWARD_MISSING'
  Assert-CandidateFailure 'wrong-reward-name' `
    "UPDATE public.rewards_catalog SET name='PF08 WRONG NAME' WHERE id='157d2e20-293e-4770-9e8d-e04b03aed110';" `
    'PF08B2C3_REWARD_NAME_MISMATCH'
  Assert-CandidateFailure 'wrong-store-product-name' `
    "UPDATE public.store_products SET name='PF08 WRONG PRODUCT' WHERE id='671549a7-ed15-4eab-886d-4dff3f331d4d';" `
    'PF08B2C3_STORE_PRODUCT_MISMATCH'
  Assert-CandidateFailure 'conflicting-classification' `
    "UPDATE public.rewards_catalog SET fulfillment_type='partner' WHERE id='157d2e20-293e-4770-9e8d-e04b03aed110';" `
    'PF08B2C3_FULFILLMENT_CONFLICT'

  Invoke-LocalFile $candidatePath | Out-Null

  $inactiveAfter = Invoke-LocalScalar @"
SELECT md5(coalesce(string_agg(to_jsonb(r)::text, '|' ORDER BY r.id), ''))
FROM public.rewards_catalog AS r WHERE NOT r.is_active;
"@
  $historyAfter = Invoke-LocalScalar @"
SELECT md5(coalesce(string_agg(to_jsonb(rr)::text, '|' ORDER BY rr.id), ''))
FROM public.reward_redemptions AS rr;
"@
  if ($inactiveBefore -ne $inactiveAfter) {
    throw 'Candidate changed inactive reward rows'
  }
  if ($historyBefore -ne $historyAfter) {
    throw 'Candidate changed redemption history'
  }

  Invoke-LocalFile $validationPath | Write-Output
  Write-Output 'PF-08B2C3 harness PASS'
}
finally {
  if ($targetVerified) {
    Invoke-LocalReset
    Assert-LocalTarget
    Write-Output 'PASS final normal reset restored the synthetic local environment'
  }
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedTempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $resolvedTempRoot = [IO.Path]::GetFullPath($tempRoot)
    if (-not $resolvedTempRoot.StartsWith($resolvedTempBase, [StringComparison]::OrdinalIgnoreCase) -or
        ([IO.Path]::GetFileName($resolvedTempRoot) -notlike 'pf08b2c3-*')) {
      throw "Safety stop: unexpected temporary path $resolvedTempRoot"
    }
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
