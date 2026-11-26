"""
Platin-Makros – Makros für die PS5 per Handy auslösen.

So funktioniert es:
  PS5  <-- Remote Play (chiaki-ng) --  PC  <-- WLAN --  Handy (Browser)
Dieses Programm erstellt auf dem PC einen virtuellen PS4-Controller.
chiaki-ng schickt dessen Eingaben per Remote Play an die PS5.
Auf dem Handy öffnest du die angezeigte Adresse und tippst auf einen Knopf.

Nur für den Einzelspieler gedacht.
Start:  python makro.py
"""

import socket
import threading
import time

import vgamepad as vg
from flask import Flask, jsonify

# ------------------------------------------------------------------
# Einstellungen – hier kannst du das Timing anpassen
# ------------------------------------------------------------------
TASTE_GEDRUECKT = 0.06   # Sekunden, wie lange eine Taste gedrückt bleibt
ZWISCHEN_TASTEN = 0.05   # Pause zwischen zwei Tastendrücken
HANDY_OFFEN = 0.8        # Wartezeit, bis das Handy offen ist
TOUCHPAD_ANZAHL = 12     # wie oft das Touchpad gespammt wird

pad = vg.VDS4Gamepad()
lock = threading.Lock()
D = vg.DS4_DPAD_DIRECTIONS


def taste(button):
    pad.press_button(button=button); pad.update(); time.sleep(TASTE_GEDRUECKT)
    pad.release_button(button=button); pad.update(); time.sleep(ZWISCHEN_TASTEN)


def spezial(button):
    pad.press_special_button(special_button=button); pad.update(); time.sleep(TASTE_GEDRUECKT)
    pad.release_special_button(special_button=button); pad.update(); time.sleep(ZWISCHEN_TASTEN)


def steuerkreuz(richtung):
    pad.directional_pad(direction=richtung); pad.update(); time.sleep(TASTE_GEDRUECKT)
    pad.directional_pad(direction=D.DS4_BUTTON_DPAD_NONE); pad.update(); time.sleep(ZWISCHEN_TASTEN)


# ------------------------------------------------------------------
# Makros
# ------------------------------------------------------------------
def first_person():
    """Im Auto: Handy auf, Handy zu, sofort Touchpad spammen."""
    steuerkreuz(D.DS4_BUTTON_DPAD_NORTH)          # Handy raus
    time.sleep(HANDY_OFFEN)
    taste(vg.DS4_BUTTONS.DS4_BUTTON_CIRCLE)       # Handy zu
    for _ in range(TOUCHPAD_ANZAHL):              # Kamera-Taste spammen
        spezial(vg.DS4_SPECIAL_BUTTONS.DS4_SPECIAL_BUTTON_TOUCHPAD)


def nur_touchpad():
    """Falls du das Handy selbst schließt: nur das Touchpad spammen."""
    for _ in range(TOUCHPAD_ANZAHL):
        spezial(vg.DS4_SPECIAL_BUTTONS.DS4_SPECIAL_BUTTON_TOUCHPAD)


MAKROS = {
    "firstperson": ("Ego-Perspektive im Auto", first_person),
    "touchpad": ("Nur Touchpad spammen", nur_touchpad),
}

# ------------------------------------------------------------------
# Kleine Webseite fürs Handy
# ------------------------------------------------------------------
app = Flask(__name__)

SEITE = """<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Makros</title><style>
body{margin:0;font:17px system-ui,sans-serif;background:linear-gradient(#2a0f4f,#120b26 60%);color:#fbf4ff;min-height:100vh;padding:24px 16px}
h1{font-size:32px;margin:0 0 4px;text-shadow:0 0 14px #ff3d8b}p{color:#b9a9dc;margin:0 0 20px}
button{display:block;width:100%;min-height:84px;margin:0 0 12px;border:0;border-radius:18px;font-size:20px;font-weight:800;color:#fff;
background:linear-gradient(90deg,#ff3d8b,#ff9a3c)}button:active{transform:scale(.98)}button:disabled{opacity:.5}
#s{text-align:center;min-height:24px;color:#2de2e6}</style></head><body>
<h1>Makros</h1><p>Tippen löst das Makro auf der PS5 aus.</p>
%BUTTONS%<div id="s"></div>
<script>
async function run(k,b){b.disabled=true;s.textContent="Läuft …";
try{const r=await fetch("/run/"+k,{method:"POST"});const j=await r.json();s.textContent=j.ok?"Fertig ✓":"Läuft schon";}
catch(e){s.textContent="PC nicht erreichbar";}b.disabled=false}
</script></body></html>"""


@app.get("/")
def seite():
    knoepfe = "".join(
        f'<button onclick="run(\'{k}\',this)">{name}</button>' for k, (name, _) in MAKROS.items()
    )
    return SEITE.replace("%BUTTONS%", knoepfe)


@app.post("/run/<name>")
def ausfuehren(name):
    if name not in MAKROS:
        return jsonify(ok=False), 404
    if not lock.acquire(blocking=False):
        return jsonify(ok=False, busy=True)
    try:
        MAKROS[name][1]()
    finally:
        lock.release()
    return jsonify(ok=True)


def eigene_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    print("\n  Virtueller Controller ist aktiv.")
    print(f"  Öffne auf dem Handy:  http://{eigene_ip()}:5000\n")
    app.run(host="0.0.0.0", port=5000)
