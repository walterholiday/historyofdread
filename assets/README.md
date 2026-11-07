# Assets

Video, audio and image files are too big for git, so they live in Google Drive.

Suggested Drive layout, synced to your computer with Google Drive for desktop:

```
HistoryOfDread/
  001/
    narration.wav        # Brig's recording
    media/               # every file named in episodes/001-.../shots.yaml
  002/
    ...
```

Point the rough-cut builder at these folders with `--narration` and `--media`.

## Where footage comes from

Rights notes live next to each shot in `shots.yaml`. The rules of thumb are in [CHANNEL.md](../CHANNEL.md#narration-and-footage). Good free sources so far:

- Reagan Library video archive (White House Television recordings): public domain
- National Archives and DVIDS (military photos and film): public domain
- Internet Archive (Prelinger and National Archives civil-defence films): public domain
- Wikimedia Commons: check each file's licence
