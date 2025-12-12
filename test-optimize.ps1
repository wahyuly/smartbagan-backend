# test-optimize.ps1
# Quick test endpoint /api/optimize/analyze

$Url = "http://localhost:5000/api/optimize/analyze"
$Headers = @{
    "Content-Type" = "application/json"
}

$Body = @{
    kapalPosition = @{ lat = -6.7500; lng = 105.5200 }
    currentBagans = @(
        @{ id = "B1"; name = "Bagan 1"; lat = -6.7500; lng = 105.5200; score = 75 }
        @{ id = "B2"; name = "Bagan 2"; lat = -6.7520; lng = 105.5210; score = 68 }
    )
    scanRadius = 5
} | ConvertTo-Json -Depth 3

Write-Host "Sending POST request to $Url ..." -ForegroundColor Cyan

try {
    $Response = Invoke-RestMethod -Uri $Url -Method Post -Headers $Headers -Body $Body
    Write-Host "Response received:" -ForegroundColor Green
    $Response | ConvertTo-Json -Depth 5 | Write-Host
} catch {
    Write-Host "Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message
}
