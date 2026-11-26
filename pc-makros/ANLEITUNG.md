# Makros per Handy – Einrichtung (Windows-PC)

Einmal einrichten, dauert ca. 20 Minuten. PC und PS5 müssen im selben Heimnetz sein.

## 1. Python installieren
- Von **python.org** Python 3 herunterladen und installieren.
- Wichtig: im ersten Fenster den Haken bei **„Add python.exe to PATH“** setzen.

## 2. Makro-Programm holen
- Auf github.com/Keule4640/platin den Ordner `pc-makros` öffnen und `makro.py` herunterladen
  (Datei anklicken › Download-Symbol). Zum Beispiel in einen Ordner `C:\Makros` legen.
- Eingabeaufforderung öffnen (Windows-Taste, `cmd` tippen) und eingeben:
  ```
  pip install vgamepad flask
  ```
  Dabei installiert sich der Treiber **ViGEmBus** für virtuelle Controller – das Fenster einfach bestätigen.

## 3. Remote Play mit chiaki-ng
- chiaki-ng herunterladen (GitHub-Seite des Projekts „streetpea/chiaki-ng“, Bereich Releases) und installieren.
- Auf der PS5: **Einstellungen › System › Remote Play › Remote Play aktivieren** und
  **Gerät koppeln** – die PS5 zeigt einen 8-stelligen Code.
- In chiaki-ng die PS5 hinzufügen und den Code eingeben (chiaki-ng fragt auch nach deiner PSN-Konto-ID,
  dafür gibt es im Programm einen Knopf zum Anmelden).

## 4. Starten
1. Eingabeaufforderung im Ordner öffnen und `python makro.py` starten.
   Es erscheint eine Adresse wie `http://192.168.178.23:5000`.
2. **Danach** chiaki-ng starten und mit der PS5 verbinden – so erkennt chiaki-ng den virtuellen Controller.
3. Auf dem Handy die Adresse öffnen und über „Teilen › Zum Home-Bildschirm“ ablegen.
4. In GTA ins Auto setzen und auf **„Ego-Perspektive im Auto“** tippen.

Dein normaler Controller funktioniert währenddessen weiter.

## Wenn es nicht klappt
- **Nichts passiert auf der PS5:** In chiaki-ng prüfen, ob ein Controller erkannt wird. Erst `makro.py`, dann chiaki-ng starten.
- **Kamera rastet nicht ein:** Oben in `makro.py` die Werte ändern – z. B. `TOUCHPAD_ANZAHL = 20`
  oder `ZWISCHEN_TASTEN = 0.03` (schneller). Datei speichern, Programm neu starten.
- **Handy erreicht den PC nicht:** Windows fragt beim ersten Start nach der Firewall – „Private Netzwerke“ erlauben.
