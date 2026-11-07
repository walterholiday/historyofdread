"""Tests for the rough-cut builder.

The timing tests are pure Python. The render test builds a short video end
to end with ffmpeg and checks its length, size and sound.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import roughcut as rc  # noqa: E402

SCRIPT = """# Test episode

Intro text that is not narration.

## 1. Cold open

Just after midnight, a siren tears through a concrete bunker south of Moscow.
A red word flashes on the main panel: LAUNCH.

*Visuals: dark bunker interior.*

## 2. The world

To understand that night, you have to understand the fear of 1983.
Then, on September 1st, Soviet fighters shot down a plane.

## Sources to verify

- this should be ignored
"""


@pytest.fixture
def script_file(tmp_path):
    p = tmp_path / "script.md"
    p.write_text(SCRIPT)
    return p


def test_parse_time():
    assert rc.parse_time("1:23") == 83
    assert rc.parse_time("1:02:03") == 3723
    assert rc.parse_time(12) == 12
    assert rc.parse_time("0:07.5") == 7.5


def test_narration_skips_notes_and_sources(script_file):
    words = rc.narration_words(script_file)
    assert words[0] == "just"
    assert "visuals" not in words
    assert "ignored" not in words
    assert "intro" not in words


def test_find_cue_exact_and_fuzzy():
    words = rc.tokenize("dread to outcome nine to zero better than feared")
    assert rc.find_cue(rc.tokenize("nine to zero"), words) == 3
    # Whisper often writes numbers as digits; the fuzzy match still lands.
    heard = rc.tokenize("dread to outcome 9 to 0 better than feared")
    assert rc.find_cue(rc.tokenize("Dread to Outcome: nine to zero"), heard) == 0


def test_estimated_timing_follows_script_position(script_file):
    words = rc.narration_words(script_file)
    specs = [{"cue": "Just after midnight"},
             {"cue": "To understand that night"},
             {"cue": "Then, on September 1st"}]
    shots = rc.time_shots(specs, 60.0, words, None)
    assert shots[0].start == 0
    assert 0 < shots[1].start < shots[2].start < 60
    assert all(s.how == "estimated" for s in shots[1:])
    assert abs(sum(s.duration for s in shots) - 60.0) < 1e-6


def test_transcript_and_pinned_times_win(script_file):
    words = rc.narration_words(script_file)
    transcript = [{"word": w, "start": i * 0.5, "end": i * 0.5 + 0.4}
                  for i, w in enumerate(words)]
    specs = [{"cue": "Just after midnight"},
             {"cue": "To understand that night"},
             {"cue": "Then, on September 1st", "at": "0:20"}]
    shots = rc.time_shots(specs, 60.0, words, transcript)
    idx = rc.find_cue(rc.tokenize("To understand that night"), words)
    assert shots[1].how == "heard" and shots[1].start == idx * 0.5
    assert shots[2].how == "pinned" and shots[2].start == 20


def test_shots_without_cues_are_spaced_and_kept_in_order():
    specs = [{"kind": "card"}, {"kind": "card"}, {"kind": "card"}, {"at": "0:01"}]
    shots = rc.time_shots(specs, 10.0, [], None)
    starts = [s.start for s in shots]
    assert starts == sorted(starts)
    assert all(s.duration >= rc.MIN_SHOT - 1e-9 for s in shots)
    assert abs(sum(s.duration for s in shots) - 10.0) < 1e-6


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs ffmpeg")
def test_end_to_end_render(tmp_path, script_file):
    from PIL import Image

    ep = tmp_path / "ep"
    media = tmp_path / "media"
    ep.mkdir()
    media.mkdir()
    (ep / "script.md").write_text(script_file.read_text())

    Image.new("RGB", (1200, 900), (120, 60, 40)).save(media / "wide.jpg")
    Image.new("RGB", (800, 1400), (40, 80, 120)).save(media / "tall.jpg")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error",
                    "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=3",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                    "-shortest", str(media / "clip.mp4")], check=True)
    narration = tmp_path / "narration.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
                    "-i", "sine=frequency=220:duration=12", str(narration)], check=True)

    (ep / "shots.yaml").write_text(json.dumps({"shots": [
        {"cue": "Just after midnight", "kind": "card", "text": "TEST\nDread Score: 9.0"},
        {"cue": "A red word flashes", "media": "wide.jpg", "motion": "zoom-in"},
        {"cue": "To understand that night", "media": "tall.jpg", "motion": "pan-left"},
        {"cue": "Then, on September 1st", "kind": "video", "media": "clip.mp4",
         "clip_audio": 0.5},
        {"at": "0:10", "media": "not-found-yet.jpg"},
    ]}))

    out = tmp_path / "out.mp4"
    assert rc.main([str(ep), "--narration", str(narration), "--media", str(media),
                    "--out", str(out), "--preview"]) == 0

    info = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(out)],
        capture_output=True, text=True, check=True).stdout)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    audio = [s for s in info["streams"] if s["codec_type"] == "audio"]
    assert (video["width"], video["height"]) == (960, 540)
    assert len(audio) == 1
    assert abs(float(info["format"]["duration"]) - 12.0) < 0.2
    # Every frame accounted for, so the pictures stay in sync with the voice.
    packets = subprocess.run(
        ["ffprobe", "-v", "error", "-count_packets", "-select_streams", "v",
         "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(out)],
        capture_output=True, text=True, check=True).stdout.strip()
    assert int(packets) == 12 * 30

    report = (out.with_suffix(".shots.csv")).read_text()
    assert "placeholder" in report and "not-found-yet.jpg" in report
