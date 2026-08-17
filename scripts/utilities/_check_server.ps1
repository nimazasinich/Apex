try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/" -UseBasicParsing -TimeoutSec 3
  Write-Output ("UP " + $r.StatusCode)
} catch {
  Write-Output ("DOWN " + $_.Exception.Message)
}
