async function testHFSentiment() {
  const S2_BASE = 'https://really-amin-datasourceforcryptocurrency-2.hf.space';
  const r14 = await (await fetch(`${S2_BASE}/api/hf/run-sentiment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: ['Bitcoin price broke resistance.'] })
  })).json();
  console.log('#14 with texts:', JSON.stringify(r14).slice(0, 150));
}
testHFSentiment();
