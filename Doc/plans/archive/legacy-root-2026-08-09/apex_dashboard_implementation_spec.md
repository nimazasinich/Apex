# APEX Dashboard — 1368 × 753 Implementation Specification

## Resize model
- Source: `1672 × 941`
- Target: `1368 × 753`
- Horizontal scale: `0.818181818`
- Vertical scale: `0.800212540`
- Method: exact full-frame resize, no crop and no added margins.
- Because the source and target aspect ratios differ, the horizontal and vertical scale factors are intentionally different.

## Global geometry
- Canvas: `1368 × 753`
- Sidebar: `162 px`
- Header: `47 px`
- Main content starts at `x = 173 px`
- Main cards use approximately `12 px` corner radius and `1 px` cool-gray borders.

## Major component rectangles
| Component | x | y | width | height |
|---|---:|---:|---:|---:|
| Sidebar | 0 | 0 | 162 | 753 |
| Header | 162 | 0 | 1206 | 47 |
| Search | 177 | 10 | 367 | 29 |
| Total Equity | 173 | 54 | 209 | 87 |
| Available Balance | 390 | 54 | 191 | 87 |
| Unrealized P&L | 588 | 54 | 190 | 87 |
| Daily P&L | 786 | 54 | 189 | 87 |
| Margin Used | 983 | 54 | 169 | 87 |
| Buying Power | 1160 | 54 | 182 | 87 |
| Portfolio Performance | 173 | 151 | 646 | 254 |
| Asset Allocation | 826 | 151 | 516 | 254 |
| Holdings | 173 | 412 | 604 | 310 |
| Open Positions Summary | 784 | 412 | 359 | 97 |
| Recent Activity | 784 | 515 | 359 | 206 |
| Account Health | 1150 | 412 | 191 | 310 |

## Sampled color system
| Token | Hex |
|---|---|
| Page background | `#FDFDFE` |
| Main surface | `#F6F8FA` |
| Card background | `#FFFFFF` |
| Card border | `#E8EDF2` |
| Divider | `#EDF1F4` |
| Primary text | `#111827` |
| Secondary text | `#525B79` |
| Muted text | `#7E8A9E` |
| Brand lime | `#63E52F` |
| Success green | `#20A528` |
| Success soft | `#EBF7EE` |
| Active navigation | `#DCF3B6` |
| Chart fill | `#F4FBF6` |
| Negative red | `#FF3344` |
| BTC orange | `#FD8905` |
| ETH blue | `#1A85E4` |
| SOL teal | `#22B792` |
| BNB yellow | `#FDBC01` |
| XRP purple | `#9B4BC7` |
| USDT light blue | `#A9D0F5` |

## Typography and controls
- Font: Inter or a metrically similar modern sans-serif.
- Base labels: `9–10 px`.
- Card headings: `11–12 px`, weight `600`.
- Primary metrics: `15–17 px`, weight `600–700`.
- Table text: `9–10 px`.
- Icon circles: approximately `40 px` in the source, scaled to `32–33 px`.
- Buttons and pills: `6–8 px` radius.
- SVG icon strokes: `1.5 px`.

## Implementation recommendation
For a pixel-faithful fixed dashboard, use a `1368 × 753` root with absolute-positioned major panels, then use flex/grid inside each panel. Do not rely on a purely responsive grid for this exact reference because fractional redistribution will shift card widths and table columns.
