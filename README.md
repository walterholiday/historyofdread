# History of Dread

A YouTube channel about what people feared, who feared it, and what actually happened.

**Channel:** [The History of Dread (@thehistoryofdread)](https://www.youtube.com/@thehistoryofdread) · channel ID `UCNhfgcrCJICIiJjVcEKFJAw`

Each episode opens with a **Dread Score** (how bad the fear was) and closes with **Dread to Outcome**: how bad things really turned out, and whether it was worse than feared, better than feared, or as feared.

The goal is a monetised channel. See [CHANNEL.md](CHANNEL.md) for the format, scoring and standards.

## How the work flows

1. **Script.** Written and fact-checked in Claude Docs, where it's easy to edit and comment. When a script is locked for recording, a snapshot is copied into its episode folder here.
2. **Narration.** Brig records it himself. No AI voice.
3. **Shot list.** Each episode has a `shots.yaml` that matches visuals to lines of the script.
4. **Rough cut.** `pipeline/roughcut.py` takes the narration and the shot list and builds a first-cut video, with slow pans and zooms on the stills.
5. **Polish.** Brig does a final edit pass, then uploads.
6. **Publish.** Manual for now. Scheduled publishing comes later, once the channel has an audience.

## Layout

| Folder | What's in it |
| --- | --- |
| `episodes/` | One folder per episode: `episode.yaml` (title, labels, scores, links), `shots.yaml`, and `script.md` once locked |
| `pipeline/` | The rough-cut builder |
| `assets/` | Notes on where media lives. The actual video and image files live in Google Drive, not here, because they're too big for git |
| `publish/` | Empty for now. YouTube and Instagram upload jobs go here later |

## Episodes

| # | Title | Outcome label | Dread to Outcome | Status |
| --- | --- | --- | --- | --- |
| 001 | [The Night the Sky Lied](episodes/001-the-night-the-sky-lied) | Averted by luck | 9.0 to 0 | Script locked, recording this week |
| 002 | [The Comet's Poison Tail](episodes/002-the-comets-poison-tail) | Pure myth | 7.7 to 0 | Script drafted, needs expanding to 10 min |
| 003 | [The Gray Slabs](episodes/003-the-gray-slabs) | Realised | 7.3 to 10 | Script drafted, needs expanding to 10 min |
| 004 | [The Sky Is Falling](episodes/004-the-sky-is-falling) | Ongoing | 6.7 to Undecided | Script drafted |
| 005 | [The Hole in the Sky](episodes/005-the-hole-in-the-sky) | Averted by action | 8.0 to 2 | Script drafted and fact-checked |

The full story backlog lives in Claude Docs: [History of Dread — Story Backlog](https://claude.ai/artifact/GUTTXHrfMZTnjdjoiGF96Q).

## Making a rough cut

You need Python 3.10+ and ffmpeg.

```bash
pip install -r pipeline/requirements.txt
python pipeline/roughcut.py episodes/001-the-night-the-sky-lied \
    --narration ~/Drive/HistoryOfDread/001/narration.wav \
    --media ~/Drive/HistoryOfDread/001/media \
    --out ~/Desktop/001-roughcut.mp4
```

See [pipeline/README.md](pipeline/README.md) for the shot-list format and options.
