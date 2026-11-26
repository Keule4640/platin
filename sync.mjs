// Holt deine PlayStation-Trophäen und speichert sie in docs/trophies.json (Freunde verschlüsselt).
// Läuft bei GitHub Actions (siehe .github/workflows/sync.yml).
// Braucht das Secret PSN_NPSSO. Liest nur, ändert nichts an deinem Konto.

import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getUserTitles,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
  getUserFriendsAccountIds,
  getProfileFromAccountId,
} from "psn-api";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// ---- Verschlüsselung der Freunde-Daten (AES-256-GCM, Schlüssel im Secret PLATIN_KEY) ----
const KEY = process.env.PLATIN_KEY ? Buffer.from(process.env.PLATIN_KEY.trim(), "base64") : null;
function verschluesseln(obj) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final(), c.getAuthTag()]);
  return { iv: iv.toString("base64"), data: data.toString("base64") };
}
function entschluesseln(enc) {
  try {
    const buf = Buffer.from(enc.data, "base64");
    const d = createDecipheriv("aes-256-gcm", KEY, Buffer.from(enc.iv, "base64"));
    d.setAuthTag(buf.subarray(buf.length - 16));
    return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString("utf8"));
  } catch { return null; }
}

const OUT = "docs/trophies.json";
const LANG = { headerOverrides: { "Accept-Language": "de-DE" } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const npsso = process.env.PSN_NPSSO?.trim();
if (!npsso) {
  console.error("Das Secret PSN_NPSSO fehlt. Trag es unter Settings > Secrets > Actions ein.");
  process.exit(1);
}

let old = { games: [] };
try { old = JSON.parse(await readFile(OUT, "utf8")); } catch {}
if (old.friendsEnc && KEY) old.friends = entschluesseln(old.friendsEnc) || [];
if (!KEY) old.friends = [];
const oldSnapshot = JSON.stringify(old.games); // Vergleichsstand, bevor irgendwas geändert wird
const oldById = new Map(JSON.parse(oldSnapshot).map((g) => [g.id, g]));

let auth;
try {
  auth = await exchangeAccessCodeForAuthTokens(await exchangeNpssoForAccessCode(npsso));
} catch (e) {
  console.error("Anmeldung bei PSN fehlgeschlagen. Dein NPSSO-Schlüssel ist wahrscheinlich abgelaufen – hol dir einen neuen.");
  process.exit(1);
}

// Alle Spiele holen (seitenweise)
const titles = [];
for (let offset = 0; ; offset += 100) {
  const res = await getUserTitles(auth, "me", { limit: 100, offset, ...LANG });
  titles.push(...res.trophyTitles);
  if (!res.nextOffset || titles.length >= res.totalItemCount) break;
  await pause(500);
}

const games = [];
for (const t of titles) {
  const id = t.npCommunicationId;
  const prev = oldById.get(id);
  // Unverändert seit dem letzten Lauf? Dann alte Details übernehmen (schont die Schnittstelle).
  if (prev && prev.updated === t.lastUpdatedDateTime && prev.trophies?.length) {
    games.push(prev);
    continue;
  }
  const opts = { ...LANG, ...(t.trophyTitlePlatform.includes("PS5") ? {} : { npServiceName: "trophy" }) };
  let trophies = [];
  try {
    const [defs, defsEn, mine] = await Promise.all([
      getTitleTrophies(auth, id, "all", opts),
      // Englische Namen zusätzlich, damit die App ihre Tipps den Trophäen zuordnen kann
      getTitleTrophies(auth, id, "all", { ...opts, headerOverrides: { "Accept-Language": "en-US" } }),
      getUserTrophiesEarnedForTitle(auth, "me", id, "all", opts),
    ]);
    const earnedById = new Map(mine.trophies.map((x) => [x.trophyId, x]));
    const enById = new Map(defsEn.trophies.map((x) => [x.trophyId, x.trophyName]));
    trophies = defs.trophies.map((d) => {
      const e = earnedById.get(d.trophyId) || {};
      return {
        id: d.trophyId,
        name: d.trophyName || "",
        nameEn: enById.get(d.trophyId) || "",
        detail: d.trophyDetail || "",
        type: d.trophyType,
        hidden: !!d.trophyHidden,
        icon: d.trophyIconUrl || "",
        earned: !!e.earned,
        earnedAt: e.earnedDateTime || null,
        rate: e.trophyEarnedRate ? Number(e.trophyEarnedRate) : null,
        progress: e.progress != null ? Number(e.progress) : null,
        target: d.trophyProgressTargetValue ? Number(d.trophyProgressTargetValue) : null,
      };
    });
  } catch (e) {
    console.warn(`Details für ${t.trophyTitleName} nicht abrufbar: ${e.message}`);
    if (prev) { games.push(prev); continue; }
  }
  games.push({
    id,
    name: t.trophyTitleName,
    platform: t.trophyTitlePlatform,
    icon: t.trophyTitleIconUrl,
    progress: t.progress,
    defined: t.definedTrophies,
    earned: t.earnedTrophies,
    updated: t.lastUpdatedDateTime,
    trophies,
  });
  await pause(800);
}

// ---- Freunde-Vergleich (nur GTA 6, alle 6 Stunden) ----
let friends = old.friends || [];
let friendsAt = old.friendsAt || null;
const gtaGame = games.find((g) => /grand theft auto vi\b/i.test(g.name));
const sechsStunden = 6 * 3600 * 1000;
if (KEY && gtaGame && (!friendsAt || !old.friendsEnc || Date.now() - Date.parse(friendsAt) > sechsStunden)) {
  try {
    const ids = [];
    for (let offset = 0; ; offset += 100) {
      const r = await getUserFriendsAccountIds(auth, "me", { limit: 100, offset });
      ids.push(...r.friends);
      if (!r.nextOffset || ids.length >= r.totalItemCount) break;
    }
    const names = new Map((old.friends || []).map((f) => [f.id, f.name]));
    const list = [];
    const fopts = gtaGame.platform.includes("PS5") ? {} : { npServiceName: "trophy" };
    for (const fid of ids.slice(0, 150)) {
      try {
        const r = await getUserTrophiesEarnedForTitle(auth, fid, gtaGame.id, "all", fopts);
        const earned = r.trophies.filter((t) => t.earned).map((t) => t.trophyId);
        if (!earned.length) { await pause(300); continue; }
        let name = names.get(fid);
        if (!name) { try { name = (await getProfileFromAccountId(auth, fid)).onlineId; } catch { name = "Freund"; } }
        list.push({ id: fid, name, earned });
      } catch { /* hat das Spiel nicht oder Trophäen privat */ }
      await pause(400);
    }
    friends = list.sort((a, b) => b.earned.length - a.earned.length);
    friendsAt = new Date().toISOString();
  } catch (e) {
    console.warn("Freundesliste nicht abrufbar: " + e.message);
  }
}

// ---- Bilder: klein gerechnet und direkt in die Daten gepackt (die App darf keine fremden Bilder laden) ----
const known = new Map();
for (const g of old.games) {
  if (g.icon && g.iconData) known.set(g.icon, g.iconData);
  for (const t of g.trophies || []) if (t.icon && t.iconData) known.set(t.icon, t.iconData);
}
async function toData(url, size) {
  if (!url) return "";
  if (known.has(url)) return known.get(url);
  try {
    const r = await fetch(url);
    if (!r.ok) return "";
    const out = await sharp(Buffer.from(await r.arrayBuffer()))
      .resize(size, size, { fit: "cover" }).webp({ quality: 62 }).toBuffer();
    const d = "data:image/webp;base64," + out.toString("base64");
    known.set(url, d);
    return d;
  } catch { return ""; }
}
const WITH_TROPHY_ICONS = 1; // Trophäenbilder nur fürs zuletzt gespielte Spiel
for (const [i, g] of games.entries()) {
  g.iconData = await toData(g.icon, 96);
  for (const t of g.trophies || []) {
    if (i < WITH_TROPHY_ICONS) t.iconData = await toData(t.icon, 64);
    else delete t.iconData;
  }
}

// ---- Neu erhaltene Trophäen merken (für die Benachrichtigung) ----
const wasEarned = new Set();
for (const g of old.games) for (const t of g.trophies || []) if (t.earned) wasEarned.add(g.id + "#" + t.id);
const fresh = [];
if (old.games.length) {
  for (const g of games) for (const t of g.trophies || [])
    if (t.earned && !wasEarned.has(g.id + "#" + t.id)) fresh.push({ game: g.name, name: t.name, type: t.type });
}

// Nur speichern, wenn sich wirklich etwas geändert hat.
// So entsteht nur bei neuen Trophäen ein neuer Stand – und die App-Aktualisierung in Claude
// erkennt mit einem Blick, dass es nichts zu tun gibt.
if (JSON.stringify(games) === oldSnapshot && JSON.stringify(friends) === JSON.stringify(old.friends || [])) {
  console.log("Keine neuen Trophäen – nichts zu speichern.");
  process.exit(0);
}
await mkdir("docs", { recursive: true });
// Freunde nur verschlüsselt speichern – ohne Schlüssel gar nicht
const friendsEnc = KEY && friends.length ? verschluesseln(friends) : null;

// ---- Rangliste & Tagesrückblick (ohne Freundesnamen – die Datei ist öffentlich) ----
const tag = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const heute = tag(Date.now());
let rank = null;
if (gtaGame) {
  const meinNeu = gtaGame.trophies.filter((t) => t.earned).length;
  const oldGta = (old.games || []).find((g) => g.id === gtaGame.id);
  const meinAlt = oldGta ? oldGta.trophies.filter((t) => t.earned).length : meinNeu;
  const altMap = new Map((old.friends || []).map((f) => [f.id, f.earned.length]));
  const platz = 1 + friends.filter((f) => f.earned.length > meinNeu).length;
  const events = [];
  for (const f of friends) {
    const fNeu = f.earned.length, fAlt = altMap.has(f.id) ? altMap.get(f.id) : null;
    if (fAlt === null) continue;
    if (fAlt <= meinAlt && fNeu > meinNeu) events.push("ueberholt_dich");
    if (meinAlt <= fAlt && meinNeu > fNeu) events.push("du_ueberholst");
  }
  rank = { platz, von: friends.length + 1, events };
}
const alleHeute = [];
for (const g of games) for (const t of g.trophies || [])
  if (t.earned && t.earnedAt && tag(t.earnedAt) === heute) alleHeute.push({ game: g.name, name: t.name, type: t.type });
const startGta = (old.summary && old.summary.tag === heute) ? old.summary.startProzent : (gtaGame ? (old.games || []).find((g) => g.id === gtaGame.id)?.progress ?? gtaGame.progress : null);
const summary = { tag: heute, anzahl: alleHeute.length, trophaeen: alleHeute.slice(0, 5), gtaProzent: gtaGame ? gtaGame.progress : null, startProzent: startGta, rank };
await writeFile("docs/latest.json", JSON.stringify({ at: new Date().toISOString(), fresh, rank, summary }, null, 1));
await writeFile(OUT, JSON.stringify({ syncedAt: new Date().toISOString(), friendsAt, friendsEnc, summary, games }));
console.log(`Neue Trophäen! ${games.length} Spiele gespeichert.`);
