---
name: computer-use
description: >
  Native computer-use runtime for Omarchy/Hyprland (Wayland) via the `cu` CLI.
  Use when the user asks to control the desktop, click UI elements, type into
  windows, take screenshots of the screen, automate GUI apps, move the mouse,
  press keys, focus windows, switch workspaces, or says "computer use",
  "cu", "screenshot the screen", "click on", "type in", "open app X and click Y",
  "automate the desktop", or any task requiring visual desktop interaction.
  There is no model inside — the agent takes a screenshot, decides, then acts
  via cu click/type/key. Coordinates are always relative to the last screenshot.
---

# Computer Use (`cu`)

Native computer-use runtime for **Omarchy / Hyprland** (Wayland). No Playwright, no pyautogui, no agent SDK — just screenshot → decide → act.

Binary: `cu` (on PATH via `~/.local/bin/cu` → `/home/l/Escritorio/computeruse/cu`)

## Agent loop

1. `cu screenshot` — returns JSON with image path, width/height, windows, cursor, workspace
2. Read/view the JPEG at the `image` path in the JSON
3. Pick action in **image coordinates** (not layout coords)
4. `cu click X Y` / `cu type "text"` / `cu key chord` / `cu focus selector`
5. Repeat

All output is JSON on stdout. Default image: `$XDG_RUNTIME_DIR/computeruse/shot.jpg`

## Commands

| Command | What it does |
|---|---|
| `cu screenshot` | Capture focused monitor → JPEG + scene JSON |
| `cu screenshot --monitor HDMI-A-1` | Capture a specific monitor |
| `cu screenshot --jpeg 80` | Higher quality JPEG |
| `cu screenshot --out /tmp/x.jpg` | Custom output path |
| `cu scene` | Scene JSON without new screenshot |
| `cu click X Y` | Click at image coords (left button) |
| `cu click X Y --button right` | Right-click |
| `cu move X Y` | Move pointer without clicking |
| `cu type "hello world"` | Type unicode text into focused surface |
| `cu type "text" --delay 30` | Slower typing (ms per key) |
| `cu key Return` | Press a key |
| `cu key ctrl+l` | Press a chord |
| `cu key alt+Tab` | Press a chord |
| `cu focus firefox` | Focus window by class |
| `cu focus address:0x55…` | Focus by window address |
| `cu workspace 3` | Switch to workspace |
| `cu wait 0.5` | Sleep seconds |
| `cu selftest` | Non-destructive check (no click/type) |

## Critical details

- **Coordinates are from the last screenshot image**, not Hyprland layout coords. The runtime translates (handles negative origins, rotated monitors).
- `click` moves the cursor, focuses the window under that point, then sends the button.
- If the session is locked (`omarchy-hyprland-session-locked`), capture and injection are refused.
- To abort any command: `touch $XDG_RUNTIME_DIR/computeruse/STOP`
- Screenshot JSON includes `width`/`height` — use those as the coordinate space.
- The default target is the **focused monitor**, not a mosaic of all monitors.

## Screenshot JSON shape (relevant fields)

```json
{
  "ok": true,
  "image": "/run/user/1000/computeruse/shot.jpg",
  "width": 1920,
  "height": 1080,
  "monitor": "eDP-1",
  "cursor": {"x": 500, "y": 300},
  "windows": [
    {"address": "0x…", "class": "firefox", "title": "…", "at": [x,y,w,h]}
  ],
  "workspace": {"id": 1, "name": "1"}
}
```

## Examples

```bash
# See what's on screen
cu screenshot

# Click the address bar of the focused browser (coords from last shot)
cu click 412 880

# Type a URL and press Enter
cu type "https://example.com"
cu key Return

# Focus Firefox, then interact
cu focus firefox
cu screenshot
# ... read image, decide coords ...
cu click 200 150

# Switch workspace and take a new shot
cu workspace 2
cu screenshot

# Right-click something
cu click 800 400 --button right
```

## When NOT to use

- For web automation where a browser tool (Playwright, etc.) is available and sufficient — prefer that for DOM-level work.
- `cu` is for **desktop-level** interaction: native apps, WM, anything you can see on screen.
