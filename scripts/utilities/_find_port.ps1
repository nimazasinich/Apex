$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $procId = $conn[0].OwningProcess
    Get-Process -Id $procId | Select-Object Id, ProcessName, Path
    Write-Host "PIDVALUE:$procId"
} else {
    Write-Host 'no listener'
}
