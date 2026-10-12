# ==========================================================
# CANON - potpuna sinhronizacija IDSS/_KANON sa lokalnim
# Izvor: C:\DAVOR_IDSS\_KANON
# Cilj:  GitHub CANON / main / IDSS/_KANON
# ==========================================================

$ErrorActionPreference = "Stop"
$Source = "C:\DAVOR_IDSS\_KANON"
$RepoUrl = "https://github.com/Internationale-Deutsche-Schule-Sarajevo/CANON.git"
$Branch = "main"
$Work = Join-Path $env:TEMP ("CANON_SYNC_" + [guid]::NewGuid().ToString("N"))
$TargetRelative = "IDSS/_KANON"
$OriginalLocation = Get-Location

try {
    # 1. Provjere
    if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
        throw "Ne postoji izvorni folder: $Source"
    }

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git nije instaliran."
    }

    $Files = @(Get-ChildItem -LiteralPath $Source -File -Recurse -Force)
    Write-Host "Lokalnih datoteka: $($Files.Count)" -ForegroundColor Cyan
    Write-Host ("Ukupna velicina: {0:N2} MB" -f (
        ($Files | Measure-Object Length -Sum).Sum / 1MB
    ))

    # GitHub blokira pojedinacne datoteke vece od 100 MiB
    $TooLarge = @($Files | Where-Object { $_.Length -gt 100MB })
    if ($TooLarge.Count -gt 0) {
        $TooLarge | Select-Object FullName,
            @{N="SizeMB";E={[math]::Round($_.Length / 1MB, 2)}} |
            Format-Table -AutoSize
        throw "Postoje datoteke vece od 100 MiB. Slanje je prekinuto."
    }

    Write-Host ""
    Write-Host "CILJ: $RepoUrl / $TargetRelative" -ForegroundColor Cyan
    Write-Host "Samo IDSS/_KANON ce biti zamijenjen." -ForegroundColor Yellow
    Write-Host "Ostali dijelovi repozitorija ostaju netaknuti."
    Write-Host ""

    $Answer = Read-Host "Za nastavak upisi ZAMIJENI"
    if ($Answer -cne "ZAMIJENI") {
        Write-Host "Otkazano. Nista nije poslano."
        return
    }

    # 2. Svjeza kopija repozitorija
    git clone --branch $Branch $RepoUrl $Work
    if ($LASTEXITCODE -ne 0) {
        throw "Kloniranje nije uspjelo. Provjeri mrezu i GitHub pristup."
    }

    $RepoRoot = (Resolve-Path -LiteralPath $Work).Path
    $Target = Join-Path $RepoRoot "IDSS\_KANON"

    # Zastita od pogresne putanje
    $ExpectedTarget = [IO.Path]::GetFullPath(
        (Join-Path $RepoRoot "IDSS\_KANON")
    )
    if ([IO.Path]::GetFullPath($Target) -ne $ExpectedTarget) {
        throw "Sigurnosna provjera ciljne putanje nije prosla."
    }

    # 3. Potpuno uklanjanje starog sadrzaja ciljnog foldera
    if (Test-Path -LiteralPath $Target) {
        Get-ChildItem -LiteralPath $Target -Force |
            Remove-Item -Recurse -Force
    }
    else {
        New-Item -ItemType Directory -Path $Target -Force |
            Out-Null
    }

    # 4. Kopiranje svih datoteka i podfoldera
    & robocopy $Source $Target /E /COPY:DAT /DCOPY:DAT /R:2 /W:2
    $RoboCode = $LASTEXITCODE
    if ($RoboCode -ge 8) {
        throw "Kopiranje nije uspjelo. Robocopy kod: $RoboCode"
    }

    # 5. Git ne prati prazne foldere; dodaj .gitkeep samo u prazne
    Get-ChildItem -LiteralPath $Target -Directory -Recurse -Force |
        Sort-Object { $_.FullName.Length } -Descending |
        ForEach-Object {
            $Contents = @(Get-ChildItem -LiteralPath $_.FullName -Force)
            if ($Contents.Count -eq 0) {
                New-Item -ItemType File `
                    -Path (Join-Path $_.FullName ".gitkeep") |
                    Out-Null
            }
        }

    # Ako je i sam ciljni folder prazan, dodaj .gitkeep
    if (@(Get-ChildItem -LiteralPath $Target -Force).Count -eq 0) {
        New-Item -ItemType File -Path (Join-Path $Target ".gitkeep") |
            Out-Null
    }

    # 6. Priprema promjena
    Set-Location -LiteralPath $RepoRoot

    git add -A -- "IDSS/_KANON"
    if ($LASTEXITCODE -ne 0) {
        throw "Git add nije uspio."
    }

    Write-Host "`n=== PREGLED PROMJENA ===" -ForegroundColor Cyan
    git diff --cached --stat -- "IDSS/_KANON"

    Write-Host "`n=== DATOTEKE KOJE CE SE PROMIJENITI ===" `
        -ForegroundColor Cyan
    git diff --cached --name-status -- "IDSS/_KANON"

    git diff --cached --quiet -- "IDSS/_KANON"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "GitHub vec odgovara lokalnom sadrzaju."
        return
    }
    if ($LASTEXITCODE -ne 1) {
        throw "Provjera promjena nije uspjela."
    }

    Write-Host ""
    $FinalConfirm = Read-Host "Ako pregled odgovara, upisi POSALJI"
    if ($FinalConfirm -cne "POSALJI") {
        Write-Host "Otkazano. Promjene nisu poslane na GitHub."
        return
    }

    # 7. Commit
    git commit -m "Synchronize IDSS/_KANON with local source"
    if ($LASTEXITCODE -ne 0) {
        throw "Commit nije uspio. Provjeri Git korisnicko ime i email."
    }

    # 8. Push bez force opcije
    git push origin $Branch
    if ($LASTEXITCODE -ne 0) {
        throw "Push nije uspio. Provjeri pristup ili nove promjene na main."
    }

    # 9. Provjera da je udaljeni main dostupan
    git fetch origin $Branch
    if ($LASTEXITCODE -ne 0) {
        throw "Push je prosao, ali zavrsna provjera nije uspjela."
    }

    $LocalCommit = git rev-parse HEAD
    $RemoteCommit = git rev-parse "origin/$Branch"

    if ($LocalCommit -ne $RemoteCommit) {
        throw "Udaljeni main se razlikuje od lokalnog commita."
    }

    Write-Host "`nUSPJESNO: promjene su poslane na GitHub." `
        -ForegroundColor Green
    Write-Host "Provjeri folder:"
    Write-Host "https://github.com/Internationale-Deutsche-Schule-Sarajevo/CANON/tree/main/IDSS/_KANON"

    Write-Host "`nRadna kopija ostaje ovdje: $Work"
}
catch {
    Write-Host "`nGRESKA: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Radna kopija, ako je napravljena: $Work"
    exit 1
}
finally {
    Set-Location $OriginalLocation
}