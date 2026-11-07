# Rough-cut builder

`roughcut.py` turns Brig's narration and an episode's `shots.yaml` into a first-cut 1080p video. Stills get slow zooms and pans, video clips are trimmed to fit, title cards are drawn automatically, and any shot whose media hasn't been found yet shows up as a labelled **MISSING** placeholder, so you can build a cut on day one and fill it in as footage arrives.

## Setup

```bash
brew install ffmpeg          # or your platform's equivalent
pip install -r pipeline/requirements.txt
pip install faster-whisper   # optional, for exact timing with --align
```

## Run it

```bash
# Fast 540p draft, to check timing and pacing (about 30 seconds for a 12-minute episode)
python pipeline/roughcut.py episodes/001-the-night-the-sky-lied \
    --narration ~/Drive/HistoryOfDread/001/narration.wav \
    --media ~/Drive/HistoryOfDread/001/media \
    --out ~/Desktop/001-draft.mp4 --preview

# Full 1080p rough cut, timed to the exact words in the narration
python pipeline/roughcut.py episodes/001-the-night-the-sky-lied \
    --narration ~/Drive/HistoryOfDread/001/narration.wav \
    --media ~/Drive/HistoryOfDread/001/media \
    --out ~/Desktop/001-roughcut.mp4 --align
```

Each run also writes:

- `<out>.shots.csv`: when each shot starts, how long it's on screen, how it was timed, and anything to check
- `<out>.srt`: captions, when the narration was transcribed with `--align`

The first `--align` run downloads a Whisper model and transcribes the narration, which takes a few minutes. The transcript is cached next to the audio as `narration.wav.words.json`, so later runs are instant.

## How shots get timed

1. **`at: "m:ss"`** pins a shot to an exact time.
2. **`cue`** is a few words from the script. With `--align` (or `--transcript FILE`), the builder finds the moment Brig says them. Fuzzy matching copes with Whisper writing "9" for "nine".
3. Without a transcript, the builder estimates each cue's time from where it sits in `script.md`, assuming a steady reading pace. Good for a draft; use `--align` for the real cut.

The first shot always starts at 0:00, and every shot runs until the next one starts.

## Shot list format

```yaml
shots:
  - cue: "Just after midnight, a siren"   # words from script.md
    kind: video                           # image | video | card
    media: bunker-interior.mp4            # file in the --media folder
    clip_start: "0:10"                    # where to start inside the clip
    clip_audio: 0.4                       # keep the clip's own sound at 40%
    note: Stock or recreation             # shown on the placeholder if missing
    source: https://...                   # where it came from
    rights: public domain                 # for the record

  - cue: "It was called Oko"
    media: oko-satellite-graphic.png
    motion: zoom-in                       # zoom-in | zoom-out | pan-left | pan-right | still

  - cue: "Dread to Outcome: nine to zero"
    kind: card
    text: "DREAD 9.0  →  OUTCOME 0\nBETTER THAN FEARED"
```

## Pacing

The builder flags any shot on screen for more than 20 seconds. Viewers drift when the picture doesn't change, so aim for a new shot every 5 to 15 seconds.

## What it doesn't do

It's a rough cut, not a finished edit. There are hard cuts only, no music, and no lower thirds. Do the polish pass in your editor (DaVinci Resolve is free), which is also the human touch YouTube's monetisation review looks for.

## Tests

```bash
python -m pytest pipeline/tests -q
```
