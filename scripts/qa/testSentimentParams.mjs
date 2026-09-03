async function testParams() {
  const S2_BASE = 'https://really-amin-datasourceforcryptocurrency-2.hf.space';
  
  // Test #1 with param
  const r1 = await (await fetch(`${S2_BASE}/api/service/sentiment?symbol=BTC`)).json();
  console.log('#1 /api/service/sentiment?symbol=BTC:', JSON.stringify(r1).slice(0, 100));

  // Test #13 with param
  const r13 = await (await fetch(`${S2_BASE}/api/new-sources/crypto-dt-source/sentiment?text=Bitcoin%20surges`)).json();
  console.log('#13 /api/new-sources/crypto-dt-source/sentiment?text=...:', JSON.stringify(r13).slice(0, 100));

  // Test #14 with correct body
  const r14 = await (await fetch(`${S2_BASE}/api/hf/run-sentiment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: 'Bitcoin price broke resistance.' })
  })).json();
  console.log('#14 /api/hf/run-sentiment with { inputs }:', JSON.stringify(r14).slice(0, 100));
}
testParams();
