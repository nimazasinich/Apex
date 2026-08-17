# Operations Status Smoke Report v1
- Generated: 2026-08-03T10:03:38.892Z
- Mode: pure
- HTTP status: 200
- Result: PASS
- HTTP fallback reason: operations status smoke server did not become ready
## Sample
```json
{
  "schemaVersion": 5,
  "serviceStatus": "DEGRADED",
  "configuredHealthyProviders": 0,
  "decisionMemoryStatus": "LOCAL_ONLY",
  "adaptiveStressStatus": "PASSED",
  "providerRoutingStressStatus": "PASSED",
  "loadMatrixStressStatus": "PASSED",
  "shadowTrainingStatus": "INSUFFICIENT_DATA",
  "shadowComparisonStatus": "NO_MODEL",
  "auditOnly": true
}
```
## Violations

None.