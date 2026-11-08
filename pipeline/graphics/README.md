# Graphics

Original maps, diagrams and recreations for episodes, drawn in code so they're consistent and easy to change.
Everything uses the channel look: near-black ground, bone text, one warning red, IBM Plex Mono.

```bash
cd pipeline/graphics
npm install
node missile_maps.js ~/Drive/HistoryOfDread/001/media        # one, five and hundreds of missiles (MP4)
node episode1_graphics.js ~/Drive/HistoryOfDread/001/media   # Pershing range, Oko, chain of command, launch screen
```

| File | What it is |
| --- | --- |
| `common.js` | Colours, fonts, SVG-to-PNG rendering, and piping frames into ffmpeg |
| `maps.js` | Polar projection, the 1983 Soviet Union assembled from today's borders, missile arcs |
| `missile_maps.js` | Episode 1's key visual: one launch, five launches, a real first strike |
| `episode1_graphics.js` | Episode 1's other graphics |

Every graphic carries a small ILLUSTRATION or RECREATION tag in the corner, so viewers know it isn't archival footage.
Map data: Natural Earth via the `world-atlas` package (public domain).
