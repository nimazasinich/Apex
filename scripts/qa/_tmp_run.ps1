Set-Location 'C:\project\APEX-frontend-phase31\APEX-unified-maximal-v1.0.56-r2-merged-source\APEX-v2.0.1-apex-2.0.1-8b9e41e69da4-DELIVERYful-----------------'
npm run index:app
node scripts/utilities/queryAppIndex.mjs --unresolved
Write-Output "EXIT=$LASTEXITCODE"
