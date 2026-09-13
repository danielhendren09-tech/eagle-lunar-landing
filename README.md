# EAGLE — Apollo 11 Lunar Landing

Play in the browser: **https://danielhendren09-tech.github.io/eagle-lunar-landing/**

Recreate Neil Armstrong’s last minutes over the Sea of Tranquility. Built for a Logitech Extreme 3D Pro. Keyboard works if you do not have a stick.

Chrome or Safari. Plug in the stick, open the link, press the trigger.

## Stick

| Control | What it does |
|---|---|
| Throttle slider | Descent engine |
| Stick | Tilt Eagle (that is how you steer) |
| Twist | Yaw |
| Hat (coolie hat) | Look around — forward is overhead / gold ring |
| Trigger | Start / fly again |
| Thumb button | Chase camera or window |

Hat and base buttons also drive the briefing: hat is a D-pad (worlds left/right, modes up/down), **7 / 8** cycle world / mode, **10 / 11 / 12** mute and invert.

If the engine runs backwards, click **Invert throttle** (or button 11). **Invert pitch** is next to it (button 12).

Keyboard: arrows tilt · Q/E yaw · Shift/Ctrl or 1/2/3 throttle · I/K look down or chase · J/L orbit · C window · R restart

## Astronaut

Astronaut is a difficulty **and** the full Extreme 3D Pro cockpit. Other modes stay simple so you can learn the slider first.

Tag the orange distress strobe, then land on the gold ring. Works on every world. Jupiter gets a wider hover detent and stronger attitude hold.

| Control | Astronaut |
|---|---|
| Slider | Engine, snaps to hover when you are close |
| Stick | Tilt. Hold **5** to RCS-translate instead (uses the RCS tank) |
| Twist | Yaw |
| Hat | Peek; release snaps back. Does not kick you out of window view. Menu D-pad on briefing |
| Trigger | Start. Hold in flight to abort |
| Thumb | Chase / window |
| **3 CUT** | Engine stop. Slider back to idle clicks it off |
| **4 HLD** | AGC attitude hold / PGNCS rate command |
| **6 CAM** | Reset to chase |
| **7 / 8** | Cycle world / mode |
| **9 ABR** | Abort / fly again |
| **10 / 11 / 12** | Mute · invert throttle · invert pitch |

Keyboard for Astronaut: X cutoff · H hold · T or Alt RCS · V camera · comma/period world/mode · M mute · U/P invert · Backspace abort

## Local

```bash
./start.sh
```

Then open http://localhost:8080
