# APEX V20 Reference Scale Contract — 1368 × 753

## Source and target geometry

All eight supplied reference images have the same native dimensions:

- **Source:** `1672 × 941 px`
- **Target desktop viewport:** `1368 × 753 CSS px`
- **Horizontal scale:** `1368 / 1672 = 0.8181818182`
- **Vertical density scale:** `753 / 941 = 0.8002125399`

The aspect ratios are not identical (`1.7768` vs `1.8167`). V20 therefore does **not** stretch a screenshot. It extracts the component geometry and applies it independently to the target grid.

For QA reference files only, each source was resized to `1368 × 770`, preserving the horizontal geometry, then center-cropped by 17 px vertically to `1368 × 753`. The application does not use these images as CSS backgrounds.

## Derived component dimensions

| Element | Approx. source size | Target implementation |
|---|---:|---:|
| Left navigation | 224 px | 184 px |
| Global header | 68 px | 56 px |
| Right context sidebar | 342 px | 280 px |
| Page horizontal padding | 15 px | 12 px |
| Main/right gap | 12 px | 10 px |
| Standard card radius | 13–14 px | 11 px |
| Metric card height | 114–118 px | 94 px |
| Table row height | 50–52 px | 42 px |
| Table header height | 42–44 px | 35 px |
| Filter control height | 38 px | 31 px |
| Primary context button | 39 px | 32 px |
| Donut diameter | 150–156 px | 124 px |
| Gauge width | 158 px | 130 px |

## Layout contract

```text
1368 px viewport
┌──────────────────────────────────────────────────────────────────────┐
│ Left nav 184 │ Header / stage 1184                                  │
│              ├───────────────────────────────────────────────────────┤
│              │ Main page column                    │ Context 280      │
│              │ flexible width                      │ fixed at target  │
└──────────────────────────────────────────────────────────────────────┘
```

The right sidebar is a real contextual tool area on all eight redesigned routes. It is not an overlay and is not removed to gain space. Long content scrolls inside the table or context panel, while the workspace itself remains fixed at the target viewport.

## Reference files

- [Watchlist](../reference/v20/watchlist-1368x753.png)
- [Orders](../reference/v20/orders-1368x753.png)
- [Positions](../reference/v20/positions-1368x753.png)
- [Alerts](../reference/v20/alerts-1368x753.png)
- [History](../reference/v20/history-1368x753.png)
- [Analytics](../reference/v20/analytics-1368x753.png)
- [Settings](../reference/v20/settings-1368x753.png)
- [Help](../reference/v20/help-1368x753.png)
