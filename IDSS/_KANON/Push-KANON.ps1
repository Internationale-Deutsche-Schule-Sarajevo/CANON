```powershell
# ==========================================
# DAVOR_IDSS _KANON -> GitHub CANON
# Potpuna zamjena sadržaja foldera IDSS/_KANON
# ==========================================

$ErrorActionPreference = "Stop"

$Source = "C:\DAVOR_IDSS\_KANON"
$RepoUrl = "https://github.com/Internationale-Deutsche-Schule-Sarajevo/CANON.git"
$Branch = "main"
$TargetRelative = "IDSS/_KANON"

# Privremeni radni folder
$Work = Join-Path $env:TEMP "CANON_KANON_SYNC"

try {
    # 1. Provjera izvornog foldera
    if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
        throw "Izvorni folder ne postoji: $Source"
    }

    # 2. Provjera Gita
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git nije instaliran. Instaliraj Git for Windows."
    }

    # 3. Potvrda prije zamjene
    Write-Host ""
    Write-Host "IZVOR: $Source" -ForegroundColor Cyan
    Write-Host "CILJ:  $RepoUrl / $TargetRelative" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Postojeci sadrzaj ciljnog foldera bit ce zamijenjen!" `
        -ForegroundColor Yellow

    $Confirm = Read-Host "Za nastavak upisi ZAMIJENI"

    if ($Confirm -cne "ZAMIJENI") {
        Write-Host "Operacija je otkazana."
        return
    }

    # 4. Priprema radnog foldera
    if (Test-Path -LiteralPath $Work) {
        Remove-Item -LiteralPath $Work -Recurse -Force
    }

    # 5. Preuzimanje postojeceg repozitorija
    git clone --branch $Branch $RepoUrl $Work
    if ($LASTEXITCODE -ne 0) {
        throw "Git clone nije uspio."
    }

    $Target = Join-Path $Work "IDSS\_KANON"

    # 6. Sigurnosna provjera putanje
    $Expected = Join-Path $Work "IDSS\_KANON"

    if ([IO.Path]::GetFullPath($Target) -ne
        [IO.Path]::GetFullPath($Expected)) {
        throw "Neispravna ciljna putanja."
    }

    # 7. Uklanjanje starog sadrzaja ciljnog foldera
    if (Test-Path -LiteralPath $Target) {
        Get-ChildItem -LiteralPath $Target -Force |
            Remove-Item -Recurse -Force
    }
    else {
        New-Item -ItemType Directory -Path $Target -Force |
            Out-Null
    }

    # 8. Kopiranje kompletnog lokalnog sadrzaja
    # /E ukljucuje podfoldere i prazne foldere.
    # /COPY:DAT cuva podatke, atribute i vremenske oznake.
    # /R:2 /W:2 ogranicava ponovne pokusaje.
    & robocopy $Source $Target /E /COPY:DAT /DCOPY:DAT /R:2 /W:2

    $RoboCode = $LASTEXITCODE
    if ($RoboCode -ge 8) {
        throw "Robocopy nije uspio. Kod: $RoboCode"
    }

    # 9. Dodavanje izmjena u Git
    Set-Location -LiteralPath $Work

    git add -A -- "IDSS/_KANON"
    if ($LASTEXITCODE -ne 0) {
        throw "Git add nije uspio."
    }

    # 10. Provjera ima li izmjena
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Nema izmjena za slanje. GitHub je vec uskladjen."
        return
    }
    elseif ($LASTEXITCODE -ne 1) {
        throw "Provjera Git izmjena nije uspjela."
    }

    # 11. Commit
    $Message = "Replace IDSS/_KANON with local source"
    git commit -m $Message

    if ($LASTEXITCODE -ne 0) {
        throw "Git commit nije uspio."
    }

    # 12. Push na main
    git push origin $Branch

    if ($LASTEXITCODE -ne 0) {
        throw "Git push nije uspio. Provjeri pristup i eventualne nove izmjene na GitHubu."
    }

    Write-Host ""
    Write-Host "USPJESNO! Sadrzaj je poslan na GitHub." `
        -ForegroundColor Green
    Write-Host "https://github.com/Internationale-Deutsche-Schule-Sarajevo/CANON/tree/main/IDSS/_KANON"

}
catch {
    Write-Host ""
    Write-Host "GRESKA: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    Set-Location $env:USERPROFILE
}
```