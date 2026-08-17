$env:HTTPS_PROXY = 'http://127.0.0.1:10808'
$env:HTTP_PROXY = 'http://127.0.0.1:10808'
Set-Location 'C:\project\APEX-frontend-phase2 (4)\APEX-Crypto-Trading-Terminal-Corrected'
npx playwright install chromium
