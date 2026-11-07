#!/usr/bin/env python3
"""Build a rough-cut video for a History of Dread episode.

Takes Brig's narration and the episode's shots.yaml, works out when each shot
should start, and renders a 1080p MP4 with slow pans and zooms on the stills,
title cards for the scores, and labelled placeholders for any media that
hasn't been found yet.

Shot timing, in order of preference:
  1. `at: "m:ss"` on the shot pins it to an exact time.
  2. `cue: "a few words"` is found in a word-level transcript of the narration
     (--transcript FILE, or --align to transcribe with faster-whisper).
  3. Otherwise the cue's position in script.md is used to estimate the time,
     assuming a steady reading pace between known points.

Usage:
  python pipeline/roughcut.py episodes/001-the-night-the-sky-lied \
      --narration narration.wav --media media/ --out roughcut.mp4
"""

from __future__ import annotations

import argparse
import csv
import difflib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ZOOM = 0.12   # how far stills zoom over a shot (12%)
PAN = 0.15    # how far stills pan over a shot (15% of the frame width)
MIN_SHOT = 0.5  # seconds; shorter shots are nudged so nothing vanishes
LONG_SHOT = 20  # seconds; longer shots get flagged, since viewers drift off

# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------


def parse_time(value) -> float:
    """'1:23' -> 83.0, '1:02:03' -> 3723.0, 12 -> 12.0."""
    if isinstance(value, (int, float)):
        return float(value)
    parts = [float(p) for p in str(value).strip().split(":")]
    seconds = 0.0
    for p in parts:
        seconds = seconds * 60 + p
    return seconds


def fmt_time(seconds: float) -> str:
    m, s = divmod(max(seconds, 0.0), 60)
    return f"{int(m)}:{s:05.2f}"


def tokenize(text: str) -> list[str]:
    """Lowercase words with punctuation removed, so cues match loosely."""
    words = []
    for raw in text.split():
        w = re.sub(r"[^0-9a-z]", "", raw.lower().replace("’", "'"))
        if w:
            words.append(w)
    return words


def run(cmd: list[str], quiet: bool = True) -> None:
    result = subprocess.run(cmd, capture_output=quiet, text=True)
    if result.returncode != 0:
        tail = (result.stderr or "")[-2000:] if quiet else ""
        raise RuntimeError(f"Command failed: {' '.join(cmd[:6])} ...\n{tail}")


def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def has_audio(path: Path) -> bool:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a",
         "-show_entries", "stream=index", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    ).stdout.strip()
    return bool(out)


# --------------------------------------------------------------------------
# Script and transcript
# --------------------------------------------------------------------------


def narration_words(script_path: Path) -> list[str]:
    """The spoken words of script.md: prose after the first '##' heading,
    skipping headings, *notes*, tables, lists and quotes, and stopping at a
    Sources section."""
    if not script_path.exists():
        return []
    words: list[str] = []
    started = False
    for line in script_path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("## "):
            started = True
            if s.lower().startswith("## sources"):
                break
            continue
        if not started or not s:
            continue
        if s.startswith(("#", "|", ">", "- ", "* ")):
            continue
        if s.startswith("*") and not s.startswith("**"):
            continue  # *Visuals: ...* notes aren't read aloud
        words.extend(tokenize(s.replace("**", "")))
    return words


def find_cue(cue_tokens: list[str], words: list[str], start: int = 0,
             min_ratio: float = 0.6) -> int | None:
    """Index in `words` where the cue begins, searching forward from `start`.
    Exact matches win; otherwise the closest fuzzy match above min_ratio."""
    n = len(cue_tokens)
    if n == 0 or not words:
        return None
    for i in range(start, len(words) - n + 1):
        if words[i:i + n] == cue_tokens:
            return i
    best_i, best_r = None, min_ratio
    for i in range(start, len(words)):
        r = difflib.SequenceMatcher(None, cue_tokens, words[i:i + n]).ratio()
        if r > best_r:
            best_i, best_r = i, r
            if r >= 0.85:
                break  # close enough: take the earliest strong match
    return best_i


def load_transcript(path: Path) -> list[dict]:
    """Accepts {"words": [{"word", "start", "end"}...]} or a bare list."""
    data = json.loads(path.read_text(encoding="utf-8"))
    words = data["words"] if isinstance(data, dict) else data
    return [w for w in words if tokenize(w.get("word", ""))]


def transcribe(narration: Path, model_size: str) -> list[dict]:
    """Word-level transcript via faster-whisper. Cached next to the audio."""
    cache = narration.with_suffix(narration.suffix + ".words.json")
    if cache.exists():
        print(f"Using cached transcript {cache.name}")
        return load_transcript(cache)
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError:
        sys.exit("--align needs faster-whisper: pip install faster-whisper")
    print(f"Transcribing narration with Whisper ({model_size}); "
          "this takes a few minutes the first time...")
    model = WhisperModel(model_size, compute_type="int8")
    segments, _ = model.transcribe(str(narration), word_timestamps=True)
    words = [{"word": w.word.strip(), "start": w.start, "end": w.end}
             for seg in segments for w in (seg.words or [])]
    cache.write_text(json.dumps({"words": words}, indent=1), encoding="utf-8")
    return words


# --------------------------------------------------------------------------
# Timing
# --------------------------------------------------------------------------


@dataclass
class Shot:
    index: int
    spec: dict
    start: float | None = None
    how: str = ""
    script_pos: int | None = None
    duration: float = 0.0
    media_path: Path | None = None
    status: str = ""
    notes: list[str] = field(default_factory=list)


def time_shots(specs: list[dict], duration: float, script: list[str],
               transcript: list[dict] | None) -> list[Shot]:
    shots = [Shot(i + 1, s) for i, s in enumerate(specs)]

    # Where each cue sits in the script (used for estimates and anchors).
    pos = 0
    for shot in shots:
        cue = tokenize(str(shot.spec.get("cue", "")))
        if cue and script:
            found = find_cue(cue, script, pos)
            if found is not None:
                shot.script_pos = found
                pos = found
            else:
                shot.notes.append("cue not found in script.md")

    # 1. Explicit times.
    for shot in shots:
        if "at" in shot.spec:
            shot.start, shot.how = parse_time(shot.spec["at"]), "pinned"

    # 2. Transcript matches.
    if transcript:
        t_words = [tokenize(w["word"])[0] for w in transcript]
        pos = 0
        for shot in shots:
            cue = tokenize(str(shot.spec.get("cue", "")))
            if shot.start is not None or not cue:
                continue
            found = find_cue(cue, t_words, pos)
            if found is not None:
                shot.start, shot.how = float(transcript[found]["start"]), "heard"
                pos = found
            else:
                shot.notes.append("cue not heard in narration")

    # 3. Estimate from script position between known anchors.
    if script:
        anchors = [(0, 0.0), (len(script), duration)]
        anchors += [(s.script_pos, s.start) for s in shots
                    if s.start is not None and s.script_pos is not None]
        anchors.sort()
        for shot in shots:
            if shot.start is not None or shot.script_pos is None:
                continue
            k = shot.script_pos
            lo = max((a for a in anchors if a[0] <= k), default=anchors[0])
            hi = min((a for a in anchors if a[0] >= k), default=anchors[-1])
            if hi[0] == lo[0]:
                shot.start = lo[1]
            else:
                frac = (k - lo[0]) / (hi[0] - lo[0])
                shot.start = lo[1] + frac * (hi[1] - lo[1])
            shot.how = "estimated"

    # 4. Anything left: space evenly between its neighbours.
    i = 0
    while i < len(shots):
        if shots[i].start is not None:
            i += 1
            continue
        j = i
        while j < len(shots) and shots[j].start is None:
            j += 1
        before = shots[i - 1].start if i > 0 else 0.0
        after = shots[j].start if j < len(shots) else duration
        gap = (after - before) / (j - i + (1 if i > 0 else 0))
        for k in range(i, j):
            offset = (k - i + (1 if i > 0 else 0))
            shots[k].start, shots[k].how = before + gap * offset, "spaced"
        i = j

    # The first shot always opens the video; keep starts in order and inside
    # the narration, with every shot on screen for at least MIN_SHOT.
    shots[0].start = 0.0
    for prev, cur in zip(shots, shots[1:]):
        if cur.start < prev.start + MIN_SHOT:
            cur.notes.append(f"moved from {fmt_time(cur.start)} to keep order")
            cur.start = prev.start + MIN_SHOT
    limit = duration - MIN_SHOT
    for shot in reversed(shots):
        if shot.start > limit:
            shot.notes.append("pushed back to fit inside the narration")
            shot.start = limit
            limit -= MIN_SHOT
    for cur, nxt in zip(shots, shots[1:] + [None]):
        end = nxt.start if nxt else duration
        cur.duration = end - cur.start
        if cur.duration > LONG_SHOT:
            cur.notes.append(f"on screen {cur.duration:.0f}s; add a shot here")
    return shots


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------


def find_font(user_font: str | None):
    from PIL import ImageFont  # imported lazily so --help works without Pillow
    candidates = [user_font] if user_font else []
    candidates += [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ]
    for c in candidates:
        if c and Path(c).exists():
            return lambda size, c=c: ImageFont.truetype(c, size)
    return lambda size: ImageFont.load_default(size=size)


def render_card(path: Path, text: str, w: int, h: int, font_for,
                fg=(235, 230, 220), bg=(8, 8, 10), subtitle: str = "") -> None:
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (w, h), bg)
    draw = ImageDraw.Draw(img)
    lines = [ln for ln in text.split("\n")] if text else []
    if lines:
        size = int(h * 0.11)
        while size > 12:
            font = font_for(size)
            widths = [draw.textlength(ln, font=font) for ln in lines]
            if max(widths) <= w * 0.84 and size * 1.3 * len(lines) <= h * 0.7:
                break
            size = int(size * 0.9)
        line_h = size * 1.3
        y = (h - line_h * len(lines)) / 2
        for ln in lines:
            tw = draw.textlength(ln, font=font)
            draw.text(((w - tw) / 2, y), ln, font=font, fill=fg)
            y += line_h
    if subtitle:
        font = font_for(max(int(h * 0.028), 12))
        tw = draw.textlength(subtitle, font=font)
        draw.text(((w - tw) / 2, h * 0.88), subtitle, font=font,
                  fill=(150, 150, 150))
    img.save(path)


def image_filter(motion: str, w: int, h: int, frames: int, fps: int,
                 supersample: int) -> tuple[str, bool]:
    """ffmpeg filter for a still image, and whether the input must be looped.

    Moving shots use zoompan on a copy of the image `supersample` times the
    output size, so the motion stays smooth instead of stepping a pixel at a
    time."""
    cover = "scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}"
    if motion not in ("zoom-in", "zoom-out", "pan-left", "pan-right"):
        return cover.format(W=w, H=h), True
    big_w, big_h = w * supersample, h * supersample
    p = f"(on/{max(frames - 1, 1)})"  # 0 at the first frame, 1 at the last
    if motion == "zoom-in":
        z = f"1+{ZOOM}*{p}"
    elif motion == "zoom-out":
        z = f"1+{ZOOM}*(1-{p})"
    else:
        z = f"{1 + PAN}"
    if motion == "pan-right":
        x = f"(iw-iw/zoom)*{p}"
    elif motion == "pan-left":
        x = f"(iw-iw/zoom)*(1-{p})"
    else:
        x = "(iw-iw/zoom)/2"
    zp = (f"zoompan=z='{z}':x='{x}':y='(ih-ih/zoom)/2'"
          f":d={frames}:s={w}x{h}:fps={fps}")
    return cover.format(W=big_w, H=big_h) + "," + zp, False


def render_segment(shot: Shot, out: Path, w: int, h: int, fps: int,
                   frames: int, encode: list[str], tmp: Path, font_for,
                   supersample: int = 4) -> None:
    spec = shot.spec
    kind = spec.get("kind", "image")
    base = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    tail = ["-frames:v", str(frames), "-an", *encode, str(out)]

    if kind == "card" or shot.status == "placeholder":
        card = tmp / f"card_{shot.index:03d}.png"
        if shot.status == "placeholder":
            label = spec.get("media", "?")
            render_card(card, f"MISSING\n{label}", w, h, font_for,
                        fg=(240, 200, 90), bg=(28, 28, 32),
                        subtitle=f"Shot {shot.index}: {spec.get('note', '')}"[:120])
        else:
            render_card(card, str(spec.get("text", "")), w, h, font_for)
        src, motion = card, "still"
        kind = "image"
    else:
        src, motion = shot.media_path, spec.get("motion", "zoom-in")

    if kind == "image":
        vf, loop = image_filter(motion, w, h, frames, fps, supersample)
        # zoompan already emits exactly `frames` at `fps`; an extra fps filter
        # would drop the last one and the cut would drift out of sync.
        vf += (f",fps={fps}" if loop else "") + ",setsar=1,format=yuv420p"
        loop_args = ["-loop", "1", "-framerate", str(fps)] if loop else []
        cmd = base + loop_args + ["-i", str(src), "-vf", vf] + tail
    else:  # video
        clip_start = parse_time(spec.get("clip_start", 0))
        vf = (f"scale={w}:{h}:force_original_aspect_ratio=increase,"
              f"crop={w}:{h},fps={fps},setsar=1,format=yuv420p")
        cmd = base + ["-stream_loop", "-1", "-ss", f"{clip_start:.3f}",
                      "-i", str(src), "-vf", vf] + tail
    run(cmd)


def build(args) -> int:
    episode = Path(args.episode)
    shots_file = episode / "shots.yaml"
    if not shots_file.exists():
        sys.exit(f"No shots.yaml in {episode}")
    specs = (yaml.safe_load(shots_file.read_text(encoding="utf-8")) or {}).get("shots", [])
    if not specs:
        sys.exit("shots.yaml has no shots")
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} not found. Install ffmpeg first.")

    narration = Path(args.narration)
    media_dir = Path(args.media) if args.media else episode / "media"
    out = Path(args.out)
    w, h, fps = (960, 540, args.fps) if args.preview else (args.width, args.height, args.fps)
    encode = (["-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p"]
              if args.preview else
              ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p"])

    duration = probe_duration(narration)
    script = narration_words(episode / "script.md")
    transcript = None
    if args.transcript:
        transcript = load_transcript(Path(args.transcript))
    elif args.align:
        transcript = transcribe(narration, args.whisper_model)

    shots = time_shots(specs, duration, script, transcript)
    for shot in shots:
        kind = shot.spec.get("kind", "image")
        if kind == "card":
            shot.status = "card"
            continue
        media = shot.spec.get("media")
        path = media_dir / media if media else None
        if path and path.exists():
            shot.media_path, shot.status = path, "ok"
        else:
            shot.status = "placeholder"

    font_for = find_font(args.font)
    tmp = Path(tempfile.mkdtemp(prefix="roughcut_"))
    try:
        segments = []
        start_frames = [round(s.start * fps) for s in shots] + [round(duration * fps)]
        for shot, f0, f1 in zip(shots, start_frames, start_frames[1:]):
            frames = max(f1 - f0, 1)
            seg = tmp / f"seg_{shot.index:03d}.mp4"
            label = shot.spec.get("media") or shot.spec.get("text", "").split("\n")[0] or "card"
            print(f"  [{shot.index:>2}/{len(shots)}] {fmt_time(shot.start)}  "
                  f"{shot.how:<9} {shot.status:<11} {label}")
            render_segment(shot, seg, w, h, fps, frames, encode, tmp, font_for,
                           supersample=2 if args.preview else 4)
            segments.append(seg)

        concat_list = tmp / "segments.txt"
        concat_list.write_text("".join(f"file '{s}'\n" for s in segments))

        # Final mux: narration, plus any clip sound the shot list asks for.
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
               "-f", "concat", "-safe", "0", "-i", str(concat_list),
               "-i", str(narration)]
        mixes, n_in = [], 2
        for shot in shots:
            vol = float(shot.spec.get("clip_audio", 0) or 0)
            if (vol > 0 and shot.status == "ok" and shot.spec.get("kind") == "video"
                    and has_audio(shot.media_path)):
                cs = parse_time(shot.spec.get("clip_start", 0))
                cmd += ["-stream_loop", "-1", "-ss", f"{cs:.3f}", "-i", str(shot.media_path)]
                delay = int(shot.start * 1000)
                mixes.append(f"[{n_in}:a]atrim=0:{shot.duration:.3f},asetpts=PTS-STARTPTS,"
                             f"volume={vol},adelay={delay}:all=1[c{n_in}]")
                n_in += 1
        if mixes:
            labels = "".join(f"[c{i}]" for i in range(2, n_in))
            graph = ";".join(mixes) + f";[1:a]{labels}amix=inputs={n_in - 1}:normalize=0:duration=first[a]"
            cmd += ["-filter_complex", graph, "-map", "0:v", "-map", "[a]"]
        else:
            cmd += ["-map", "0:v", "-map", "1:a"]
        cmd += ["-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                "-t", f"{duration:.3f}", "-movflags", "+faststart", str(out)]
        out.parent.mkdir(parents=True, exist_ok=True)
        run(cmd)
    finally:
        if args.keep_temp:
            print(f"Temp files kept in {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)

    report = out.with_suffix(".shots.csv")
    with report.open("w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["shot", "start", "duration_s", "timing", "status", "media_or_text", "cue", "notes"])
        for s in shots:
            label = s.spec.get("media") or str(s.spec.get("text", "")).replace("\n", " / ")
            wr.writerow([s.index, fmt_time(s.start), f"{s.duration:.2f}", s.how, s.status,
                         label, s.spec.get("cue", ""), "; ".join(s.notes)])

    if transcript:
        write_srt(transcript, out.with_suffix(".srt"))

    missing = [s for s in shots if s.status == "placeholder"]
    print(f"\nRough cut: {out}  ({fmt_time(duration)})")
    print(f"Shot report: {report}")
    if missing:
        print(f"{len(missing)} shots still need media (shown as MISSING placeholders):")
        for s in missing:
            print(f"  - shot {s.index}: {s.spec.get('media')}")
    flagged = [s for s in shots if s.notes]
    if flagged:
        print("Check these shots:")
        for s in flagged:
            print(f"  - shot {s.index}: {'; '.join(s.notes)}")
    return 0


def write_srt(words: list[dict], path: Path, per_line: int = 7) -> None:
    def ts(t: float) -> str:
        ms = int(round(t * 1000))
        hh, ms = divmod(ms, 3_600_000)
        mm, ms = divmod(ms, 60_000)
        ss, ms = divmod(ms, 1000)
        return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"
    lines = []
    for n, i in enumerate(range(0, len(words), per_line), start=1):
        chunk = words[i:i + per_line]
        text = " ".join(w["word"].strip() for w in chunk)
        lines.append(f"{n}\n{ts(chunk[0]['start'])} --> {ts(chunk[-1]['end'])}\n{text}\n")
    path.write_text("\n".join(lines), encoding="utf-8")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("episode", help="episode folder containing shots.yaml (and script.md)")
    ap.add_argument("--narration", required=True, help="Brig's narration audio file")
    ap.add_argument("--media", help="folder with the shot media (default: <episode>/media)")
    ap.add_argument("--out", required=True, help="output .mp4")
    ap.add_argument("--transcript", help="word-level transcript JSON to time cues from")
    ap.add_argument("--align", action="store_true",
                    help="transcribe the narration with faster-whisper to time cues exactly")
    ap.add_argument("--whisper-model", default="small", help="Whisper model size (default small)")
    ap.add_argument("--preview", action="store_true", help="fast 540p draft render")
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--font", help="path to a .ttf/.otf for title cards")
    ap.add_argument("--keep-temp", action="store_true", help="keep intermediate segments")
    return build(ap.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
