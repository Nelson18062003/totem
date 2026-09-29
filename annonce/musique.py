#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La musique de l'annonce, composée par le calcul.

    python3 annonce/musique.py sortie.wav [conducteur.json]

Aucun échantillon, aucun instrument enregistré : chaque son est une formule.
Le kick est une sinusoïde dont la hauteur tombe ; le log drum de l'amapiano,
la même en plus boisé ; le balafon, une lame frappée dont les harmoniques ne
tombent pas juste — c'est ce qui fait qu'on l'entend comme du bois — plus le
bourdonnement des calebasses.

La musique et l'image lisent le même conducteur (annonce/conducteur.json) :
le même tempo, les mêmes sections, les mêmes impacts. Un coup de grosse caisse
tombe sur la même image que le flash qui l'accompagne, parce que tous deux
viennent du même nombre, pas parce que quelqu'un les a recalés à l'oreille.

Seule dépendance : numpy.
"""
import json
import os
import sys
import wave

import numpy as np

SR = 48000
ICI = os.path.dirname(os.path.abspath(__file__))


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


NOTES = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}
NOTES.update({"Db": 1, "Eb": 3, "Gb": 6, "Ab": 8, "Bb": 10})


def note(nom):
    """« F2 » -> numéro MIDI."""
    lettre = nom[:-1]
    return 12 * (int(nom[-1]) + 1) + NOTES[lettre]


# --- Les outils du signal ---------------------------------------------------------

def temps(n):
    return np.arange(n) / SR


def sat(x, k=1.0):
    """Saturation douce : ajoute des harmoniques, arrondit les crêtes. C'est
    ce qui rend une basse audible sur un haut-parleur de téléphone, qui ne
    descend pas sous 150 Hz."""
    return np.tanh(x * k) / np.tanh(k)


def filtre(x, fn):
    """Filtre à phase nulle, dans le spectre : `fn(f)` rend le gain à chaque
    fréquence. Pour des sons courts ou des bus entiers, sans état."""
    n = len(x)
    N = 1 << int(np.ceil(np.log2(n + 1)))
    X = np.fft.rfft(x, N)
    f = np.fft.rfftfreq(N, 1 / SR)
    return np.fft.irfft(X * fn(f), N)[:n]


def passe_bas(fc, ordre=2):
    return lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * ordre))


def passe_haut(fc, ordre=2):
    return lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * ordre))


def passe_bande(fc, q=1.0):
    return lambda f: 1 / np.sqrt(1 + (q * (f / fc - fc / np.maximum(f, 1e-3))) ** 2)


def filtre_mouvant(x, fn, n_fft=2048):
    """Filtre qui bouge dans le temps (les montées, les balayages) : le signal
    est découpé en fenêtres, chacune filtrée par `fn(f, t)`, puis recousue."""
    hop = n_fft // 4
    fen = np.hanning(n_fft)
    n = len(x)
    pad = np.concatenate([np.zeros(n_fft), x, np.zeros(n_fft)])
    sortie = np.zeros_like(pad)
    norme = np.zeros_like(pad)
    f = np.fft.rfftfreq(n_fft, 1 / SR)
    for d in range(0, len(pad) - n_fft, hop):
        t = (d + n_fft / 2 - n_fft) / SR
        seg = pad[d:d + n_fft] * fen
        y = np.fft.irfft(np.fft.rfft(seg) * fn(f, t), n_fft) * fen
        sortie[d:d + n_fft] += y
        norme[d:d + n_fft] += fen ** 2
    return (sortie / np.maximum(norme, 1e-6))[n_fft:n_fft + n]


def bruit(n, graine):
    return np.random.default_rng(graine).standard_normal(n)


def reverb_ir(duree=2.4, graine=7, clarte=0.5):
    """Une salle synthétique : du bruit qui s'éteint, plus vite dans les aigus
    que dans les graves, décorrélé entre les deux oreilles."""
    n = int(duree * SR)
    t = temps(n)
    ir = np.zeros((2, n))
    for c in range(2):
        b = bruit(n, graine + c)
        grave = filtre(b, passe_bas(1800)) * np.exp(-t * 6.9 / duree)
        aigu = filtre(b, passe_haut(1800)) * np.exp(-t * 6.9 / (duree * 0.35)) * clarte
        ir[c] = grave + aigu
        # premières réflexions
        for k in range(6):
            d = int((0.007 + 0.011 * k + 0.003 * c) * SR)
            ir[c, d] += 0.5 * (0.7 ** k)
    ir[:, : int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))


def convoluer(x, ir):
    """x : (2, n). Convolution par le spectre."""
    n = x.shape[1] + ir.shape[1]
    N = 1 << int(np.ceil(np.log2(n)))
    Y = np.fft.rfft(x, N, axis=1) * np.fft.rfft(ir, N, axis=1)
    return np.fft.irfft(Y, N, axis=1)[:, : x.shape[1]]


# --- Les instruments --------------------------------------------------------------
# Chacun rend un tableau mono, à poser ensuite dans une piste.

def kick(duree=0.7, f0=170.0, f1=46.0, tp=0.032, ta=0.42, clic=0.35, grain=2.2, graine=1):
    n = int(duree * SR)
    t = temps(n)
    f = f1 + (f0 - f1) * np.exp(-t / tp)
    corps = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / ta)
    attaque = filtre(bruit(n, graine), passe_haut(2500)) * np.exp(-t / 0.003) * clic
    x = sat(corps + attaque, grain)
    x[-256:] *= np.linspace(1, 0, 256)
    return x


def coeur(duree=0.9):
    """Le battement : deux coups sourds, « lub-dub »."""
    a = kick(0.5, 90, 38, 0.02, 0.16, 0.0, 1.4)
    b = kick(0.5, 80, 36, 0.02, 0.12, 0.0, 1.2) * 0.7
    x = np.zeros(int(duree * SR))
    x[: len(a)] += a
    d = int(0.2 * SR)
    x[d: d + len(b)] += b[: len(x) - d]
    return filtre(x, passe_bas(400))


def basse808(freq, duree, glisse=0.0, grain=2.5):
    """La basse longue du 808 : sinusoïde tenue, un glissando au départ,
    saturée pour que ses harmoniques s'entendent sur un téléphone."""
    n = int(duree * SR)
    t = temps(n)
    f = freq * (1 + glisse * np.exp(-t / 0.06)) if glisse else np.full(n, freq)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = np.minimum(1, t / 0.004) * np.exp(-t / max(0.35, duree * 0.9))
    x = sat(x * env, grain)
    x[-512:] *= np.linspace(1, 0, 512)
    return x


def log_drum(freq, duree=0.5, graine=3):
    """Le log drum de l'amapiano : une frappe boisée, grave et ronde, dont la
    hauteur plonge d'une octave en quelques millisecondes."""
    n = int(duree * SR)
    t = temps(n)
    f = freq * (1 + 1.0 * np.exp(-t / 0.012))
    ph = 2 * np.pi * np.cumsum(f) / SR
    mod = 0.9 * np.exp(-t / 0.05) * np.sin(ph * 2.0)
    x = np.sin(ph + mod) * np.exp(-t / (duree * 0.45))
    x += 0.25 * np.sin(ph * 2 + mod) * np.exp(-t / 0.06)
    x += filtre(bruit(n, graine), passe_bande(900, 2)) * np.exp(-t / 0.006) * 0.4
    x = sat(x * 1.6, 1.8)
    x = filtre(x, passe_bas(3600))
    x[-256:] *= np.linspace(1, 0, 256)
    return x


def clap(graine=11, queue=0.18):
    n = int(0.45 * SR)
    t = temps(n)
    b = filtre(bruit(n, graine), passe_bande(1400, 0.8))
    env = np.zeros(n)
    for k, d in enumerate([0, 0.009, 0.019, 0.028]):
        i = int(d * SR)
        env[i:] += np.exp(-(t[: n - i]) / (0.0045 if k < 3 else queue)) * (0.9 if k < 3 else 1.0)
    return sat(b * env * 0.8, 1.3)


def caisse_claire(graine=13):
    n = int(0.4 * SR)
    t = temps(n)
    ton = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05)
    peau = filtre(bruit(n, graine), passe_haut(1800)) * np.exp(-t / 0.12)
    return sat(ton * 0.7 + peau * 0.8, 1.5)


def charleston(ouvert=False, graine=17):
    n = int((0.35 if ouvert else 0.08) * SR)
    t = temps(n)
    x = filtre(bruit(n, graine), passe_haut(7500, 3))
    return x * np.exp(-t / (0.12 if ouvert else 0.018)) * 0.5


def shaker(graine=19, accent=1.0):
    n = int(0.09 * SR)
    t = temps(n)
    x = filtre(bruit(n, graine), passe_bande(6500, 1.2))
    env = np.minimum(1, t / 0.012) * np.exp(-t / 0.028)
    return x * env * 0.45 * accent


def conga(freq=240.0, graine=23, claque=False):
    n = int(0.35 * SR)
    t = temps(n)
    f = freq * (1 + 0.3 * np.exp(-t / 0.01))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.06 if claque else 0.16))
    x += filtre(bruit(n, graine), passe_bande(2200 if claque else 900, 1.5)) * np.exp(-t / 0.008) * (0.8 if claque else 0.3)
    return sat(x, 1.4) * 0.6


def clave(graine=29):
    n = int(0.12 * SR)
    t = temps(n)
    x = (np.sin(2 * np.pi * 2480 * t) + 0.5 * np.sin(2 * np.pi * 1720 * t)) * np.exp(-t / 0.02)
    return x * 0.35


def balafon(freq, duree=0.7, graine=31, bourdon=0.35):
    """Une lame de balafon : les partiels d'une lame frappée (1 ; 3,93 ; 9,6)
    s'éteignent vite, les aigus plus vite encore. Sous la lame, la calebasse
    et sa membrane ajoutent un bourdonnement — le « mirliton »."""
    n = int(duree * SR)
    t = temps(n)
    x = np.zeros(n)
    for r, a, d in [(1.0, 1.0, 0.32), (3.93, 0.35, 0.07), (9.6, 0.12, 0.02), (2.0, 0.08, 0.12)]:
        x += a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / d)
    frappe = filtre(bruit(n, graine), passe_bande(freq * 5, 2)) * np.exp(-t / 0.004) * 0.5
    b = np.sign(np.sin(2 * np.pi * freq * t)) * np.exp(-t / 0.09)
    b = filtre(b, passe_bande(freq * 3, 1.2)) * bourdon * (1 + 0.5 * bruit(n, graine + 1) * 0.3)
    return sat(x + frappe + b, 1.2) * 0.5


def cloche(freq, duree=1.2):
    """Une cloche claire (le « ting » d'une notification, en plus riche)."""
    n = int(duree * SR)
    t = temps(n)
    x = np.zeros(n)
    for r, a, d in [(1.0, 1.0, 0.5), (2.76, 0.4, 0.2), (5.4, 0.2, 0.08), (8.93, 0.1, 0.04)]:
        x += a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / d)
    return x * np.minimum(1, t / 0.001) * 0.4


def ping_sms():
    """Deux notes montantes : le SMS qui arrive."""
    a, b = cloche(midi(note("E6")), 0.35), cloche(midi(note("B6")), 0.6)
    x = np.zeros(int(0.75 * SR))
    x[: len(a)] += a
    d = int(0.085 * SR)
    x[d: d + len(b)] += b[: len(x) - d]
    return x


def modem(duree=0.6, graine=37):
    """Des bips de données : des tons qui sautent entre deux fréquences, à la
    façon d'un modem qui parle."""
    rng = np.random.default_rng(graine)
    n = int(duree * SR)
    x = np.zeros(n)
    pas = int(0.018 * SR)
    ph = 0.0
    for d in range(0, n, pas):
        f = rng.choice([1200, 2200, 1650, 980, 2750])
        m = min(pas, n - d)
        tt = np.arange(m) / SR
        x[d: d + m] = np.sign(np.sin(2 * np.pi * f * tt + ph)) * 0.5
        ph += 2 * np.pi * f * m / SR
    x = filtre(x, passe_bande(1800, 0.7))
    return x * 0.25


def scie(freq, n, desaccord=0.0, graine=0):
    t = temps(n)
    ph = (freq * (1 + desaccord) * t + np.random.default_rng(graine).random()) % 1.0
    return 2 * ph - 1


def nappe(freqs, duree, attaque=0.4, relache=0.8, ouverture=1800, graine=41):
    """Accord tenu : pour chaque note, sept scies légèrement désaccordées."""
    n = int(duree * SR)
    t = temps(n)
    x = np.zeros((2, n))
    for i, f in enumerate(freqs):
        for v in range(7):
            d = (v - 3) * 0.0045
            s = scie(f, n, d, graine + i * 7 + v)
            p = (v - 3) / 3
            x[0] += s * np.sqrt((1 - p) / 2)
            x[1] += s * np.sqrt((1 + p) / 2)
    env = np.minimum(1, t / attaque) * np.minimum(1, (duree - t) / relache).clip(0, 1)
    x *= env / (len(freqs) * 7) * 1.6
    for c in range(2):
        x[c] = filtre(x[c], passe_bas(ouverture, 2))
    return x


def braam(freq, duree=3.0, graine=43):
    """Le cuivre de bande-annonce : des scies graves empilées, un grondement
    qui bat à 24 Hz, beaucoup de saturation, une longue queue."""
    n = int(duree * SR)
    t = temps(n)
    x = np.zeros(n)
    for m, a in [(1, 1.0), (2, 0.7), (0.5, 0.8), (3, 0.25), (1.5, 0.3)]:
        for v in range(3):
            x += a * scie(freq * m, n, (v - 1) * 0.006, graine + v + int(m * 10))
    x *= 1 + 0.35 * np.sin(2 * np.pi * 24 * t)
    env = np.minimum(1, t / 0.04) * np.exp(-t / (duree * 0.45))
    x = sat(x * env * 0.35, 3.0)
    fc = 350 + 2600 * np.exp(-t / 0.5)
    x = filtre_mouvant(x, lambda f, tt: 1 / np.sqrt(1 + (f / (350 + 2600 * np.exp(-max(tt, 0) / 0.5))) ** 4))
    return x * 0.7


def montee(duree, graine=47, fin_hz=9000):
    """Le riser : du bruit dans un filtre qui s'ouvre, et une note qui monte."""
    n = int(duree * SR)
    t = temps(n)
    b = bruit(n, graine)
    x = filtre_mouvant(b, lambda f, tt: passe_bande(200 * (fin_hz / 200) ** np.clip(tt / duree, 0, 1), 3)(f))
    ton = np.sin(2 * np.pi * np.cumsum(180 * 8 ** (t / duree)) / SR) * 0.3
    env = (t / duree) ** 2.2
    return (x * 0.5 + ton) * env


def cymbale_inverse(duree=1.5, graine=53):
    n = int(duree * SR)
    t = temps(n)
    x = filtre(bruit(n, graine), passe_haut(4000, 2))
    return x * (t / duree) ** 3 * 0.6


def souffle(duree=0.6, graine=59, descend=False):
    """Le whoosh : du bruit qui passe d'un côté à l'autre, filtre balayé."""
    n = int(duree * SR)
    t = temps(n)
    b = bruit(n, graine)

    def fn(f, tt):
        u = np.clip(tt / duree, 0, 1)
        u = 1 - u if descend else u
        return passe_bande(300 * (6000 / 300) ** u, 2.5)(f)
    x = filtre_mouvant(b, fn)
    env = np.sin(np.pi * np.clip(t / duree, 0, 1)) ** 2
    return x * env * 0.8


def impact(duree=3.5, graine=61):
    """Le coup : une sous-basse qui plonge, un éclat de bruit, un grondement."""
    n = int(duree * SR)
    t = temps(n)
    sous = np.sin(2 * np.pi * np.cumsum(28 + 70 * np.exp(-t / 0.25)) / SR) * np.exp(-t / 1.1)
    eclat = filtre(bruit(n, graine), passe_bas(5000)) * np.exp(-t / 0.08)
    gronde = filtre(bruit(n, graine + 1), passe_bas(180, 3)) * np.exp(-t / 0.9) * 2.0
    return sat(sous * 1.2 + eclat * 0.6 + gronde * 0.5, 1.8)


def glitch_son(duree=0.25, graine=67):
    """Des éclats numériques : bruit échantillonné grossièrement, hachuré."""
    rng = np.random.default_rng(graine)
    n = int(duree * SR)
    x = np.zeros(n)
    d = 0
    while d < n:
        m = int(rng.uniform(0.005, 0.03) * SR)
        f = rng.uniform(80, 3000)
        tt = np.arange(min(m, n - d)) / SR
        x[d: d + len(tt)] = np.sign(np.sin(2 * np.pi * f * tt)) * rng.uniform(0.2, 0.7) * (rng.random() < 0.8)
        d += m
    pas = 6
    x = np.repeat(x[::pas], pas)[:n]
    return x * 0.5


# --- Le mixage ----------------------------------------------------------------

class Piste:
    """Un bus stéréo. On y pose des sons à un instant, avec un gain et une
    place dans l'espace (-1 gauche, 1 droite)."""

    def __init__(self, n):
        self.x = np.zeros((2, n))

    def poser(self, son, t, gain=1.0, pan=0.0):
        d = int(round(t * SR))
        if d >= self.x.shape[1]:
            return
        if son.ndim == 1:
            g = gain * np.array([np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)]) * np.sqrt(2)
            son = son[None, :] * g[:, None]
        else:
            son = son * gain
        if d < 0:
            son, d = son[:, -d:], 0
        m = min(son.shape[1], self.x.shape[1] - d)
        self.x[:, d: d + m] += son[:, :m]


def pompe(n, coups, profondeur=0.75, retour=0.16):
    """Le « pompage » : chaque kick baisse un instant les nappes et la basse,
    pour que le coup passe devant. La courbe se calcule depuis les coups."""
    g = np.ones(n)
    t = temps(n)
    for c in coups:
        d = int(c * SR)
        if d >= n:
            continue
        m = min(n - d, int(retour * 4 * SR))
        tt = t[:m]
        g[d: d + m] = np.minimum(g[d: d + m], 1 - profondeur * np.exp(-tt / retour))
    return g


def limiter(x, plafond=0.93, attaque_ms=1.5, relache_ms=120):
    """Limiteur à anticipation : le gain baisse AVANT la crête, remonte
    lentement après."""
    crete = np.abs(x).max(axis=0)
    w = int(attaque_ms / 1000 * SR) * 2 + 1
    # maximum glissant, par blocs
    pad = np.concatenate([crete, np.zeros(w)])
    mg = np.maximum.reduce([pad[i: i + len(crete)] for i in range(0, w, max(1, w // 12))])
    cible = np.minimum(1.0, plafond / np.maximum(mg, 1e-9))
    # relâche : lissage exponentiel vers le haut seulement
    a = np.exp(-1 / (relache_ms / 1000 * SR))
    g = np.empty_like(cible)
    bloc = 64
    v = 1.0
    for i in range(0, len(cible), bloc):
        c = cible[i: i + bloc].min()
        v = c if c < v else v * a ** bloc + c * (1 - a ** bloc)
        g[i: i + bloc] = v
    return x * g


def ecrire_wav(chemin, x):
    x = np.clip(x, -1, 1)
    donnees = (x.T * 32767).astype("<i2").tobytes()
    with wave.open(chemin, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(donnees)


# --- La composition ----------------------------------------------------------------
# La tonalité est fa mineur. Le fa grave (43,7 Hz) ne sort pas d'un téléphone :
# c'est la saturation du 808 et du log drum qui le rend audible, par ses
# harmoniques. Le balafon joue dans la gamme pentatonique de fa mineur.

ACCORDS = {
    "Fm9": ["F1", ["F3", "Ab3", "C4", "Eb4", "G4"]],
    "Dbmaj9": ["Db2", ["Db3", "F3", "Ab3", "C4", "Eb4"]],
    "Eb9": ["Eb2", ["Eb3", "G3", "Bb3", "Db4", "F4"]],
    "Cm7": ["C2", ["C3", "Eb3", "G3", "Bb3", "D4"]],
    "Bbm9": ["Bb1", ["Bb2", "Db3", "F3", "Ab3", "C4"]],
}
GRILLE = ["Fm9", "Dbmaj9", "Eb9", "Cm7"]
BALAFON = ["F4", "Ab4", "C5", "Ab4", "Bb4", "C5", "Eb5", "C5", "F5", "Eb5", "C5", "Bb4", "C5", "Ab4", "Bb4", "Ab4"]


class Session:
    """Ce que toutes les sections partagent : le tempo, les pistes, les coups
    de grosse caisse (pour le pompage)."""

    def __init__(self, cond, m):
        self.m = m
        self.bpm = cond["tempo"]
        self.T = 60.0 / self.bpm
        self.duree = cond["duree_temps"] * self.T + cond.get("queue_s", 4.0)
        n = int(self.duree * SR)
        self.n = n
        self.p = {k: Piste(n) for k in ["kick", "perc", "basse", "nappe", "melodie", "fx", "impacts"]}
        self.coups = []
        self.pannes = []
        self.silences = []
        self.rembobinages = []
        self.graine = 100

    def t(self, temps):
        return temps * self.T

    def g(self):
        self.graine += 1
        return self.graine

    def swing(self, pas16, force=0.58):
        """Le balancement : les doubles-croches impaires arrivent un peu tard."""
        base = pas16 * self.T / 4
        return base + ((force - 0.5) * self.T / 2 if pas16 % 2 else 0)


def _accord(i):
    return ACCORDS[GRILLE[i % len(GRILLE)]]


# Chaque nature de section écrit ses notes entre sec["de"] et sec["a"] (en temps).

def s_froid(sec, S):
    """L'ouverture : une nappe sourde, un grondement, une horloge qui bat."""
    de, a = sec["de"], sec["a"]
    d = S.t(a - de)
    racine, notes = ACCORDS["Fm9"]
    nap = nappe([midi(note(n)) / 2 for n in notes[:3]], d + 0.5, attaque=d * 0.5, relache=0.4, ouverture=500, graine=S.g())
    S.p["nappe"].poser(nap, S.t(de), 0.7)
    gr = filtre(bruit(int((d + 0.5) * SR), S.g()), passe_bas(90, 3))
    gr *= np.minimum(1, temps(len(gr)) / (d * 0.7))
    S.p["fx"].poser(gr, S.t(de), 0.22)
    if sec.get("horloge", True):
        for b in range(int(de), int(a)):
            S.p["perc"].poser(clave(S.g()), S.t(b), 0.18 if b % 2 else 0.28, pan=-0.3 if b % 2 else 0.3)
    if sec.get("coeur"):
        for b in range(int(de), int(a), 2):
            S.p["kick"].poser(coeur(), S.t(b), 0.45)
            S.coups.append(S.t(b))


def s_tension(sec, S):
    """La montée : des congas qui se resserrent, la caisse claire en roulement
    qui accélère, un riser, et le vide juste avant le coup."""
    de, a = sec["de"], sec["a"]
    long_ = a - de
    for b in range(int(de), int(a)):
        u = (b - de) / long_
        S.p["kick"].poser(kick(0.5, 150, 44, 0.03, 0.3, 0.3, 2.0, S.g()), S.t(b), 0.75 + 0.2 * u)
        S.coups.append(S.t(b))
        for k, (pas, f, cl) in enumerate([(0, 210, False), (2, 300, True), (3, 240, False)]):
            if u > 0.2 or k == 0:
                S.p["perc"].poser(conga(f, S.g(), cl), S.t(b) + S.swing(pas), 0.5 + 0.4 * u, pan=[-0.4, 0.35, 0.1][k])
    # Le roulement : noires, croches, doubles, triples.
    roul = sec.get("roulement", min(8, long_ / 2))
    b0 = a - roul
    b = b0
    while b < a - 0.01:
        u = (b - b0) / roul
        pas = 1.0 if u < 0.25 else 0.5 if u < 0.5 else 0.25 if u < 0.8 else 0.125
        S.p["perc"].poser(caisse_claire(S.g()), S.t(b), 0.25 + 0.6 * u, pan=0.1)
        b += pas
    ri = montee(S.t(long_), S.g())
    S.p["fx"].poser(ri, S.t(de), 0.9)
    S.p["fx"].poser(cymbale_inverse(min(2.0, S.t(long_)), S.g()), S.t(a) - min(2.0, S.t(long_)), 0.8)
    racine, notes = ACCORDS["Fm9"]
    nap = nappe([midi(note(n)) for n in notes], S.t(long_), attaque=S.t(long_) * 0.8, relache=0.05, ouverture=900, graine=S.g())
    S.p["nappe"].poser(nap, S.t(de), 0.8)


def s_coupure(sec, S):
    """Le vide. Rien — sauf, si on le demande, une respiration."""
    if sec.get("souffle"):
        S.p["fx"].poser(souffle(S.t(sec["a"] - sec["de"]), S.g()), S.t(sec["de"]), 0.4)


def _batterie(S, b, u, dense=True):
    """Une mesure de batterie amapiano à partir du temps b."""
    for pas in range(16):
        t0 = S.t(b) + S.swing(pas)
        if pas % 4 == 0:
            S.p["kick"].poser(kick(graine=S.g()), S.t(b) + pas * S.T / 4, 1.0)
            S.coups.append(S.t(b) + pas * S.T / 4)
        if pas in (4, 12):
            S.p["perc"].poser(clap(S.g()), S.t(b) + pas * S.T / 4, 1.0, pan=0.05)
            S.p["perc"].poser(caisse_claire(S.g()), S.t(b) + pas * S.T / 4, 0.3)
        S.p["perc"].poser(shaker(S.g(), 1.0 if pas % 4 == 2 else 0.55), t0, 1.4 if dense else 0.8, pan=0.45)
        if pas % 4 == 2:
            S.p["perc"].poser(charleston(True, S.g()), t0, 0.6, pan=-0.35)
        elif dense and pas % 2 == 0:
            S.p["perc"].poser(charleston(False, S.g()), t0, 0.45, pan=-0.2)
        if dense and pas in (3, 7, 11, 14):
            S.p["perc"].poser(conga([240, 300, 210, 330][[3, 7, 11, 14].index(pas)], S.g(), pas in (7, 14)), t0, 0.45, pan=-0.5)
        if dense and pas in (6, 13):
            S.p["perc"].poser(clave(S.g()), t0, 0.2, pan=0.6)


LOG = [(0, 0), (3, 12), (6, 7), (8, 0), (10, 12), (13, 10)]


def s_drop(sec, S):
    """Le cœur : grosse caisse à chaque temps, log drums en contretemps, un
    balafon qui tourne, la nappe qui pompe sous chaque coup, le 808."""
    de, a = sec["de"], sec["a"]
    mesures = int((a - de) // 4)
    for i in range(mesures):
        b = de + 4 * i
        racine, notes = _accord(i)
        _batterie(S, b, i / max(1, mesures))
        r = midi(note(racine))
        for pas, dm in LOG:
            f = r * 2 ** (dm / 12) * (2 if r < 60 else 1)
            S.p["basse"].poser(log_drum(f, 0.42, S.g()), S.t(b) + S.swing(pas), 0.75, pan=0.0)
        S.p["basse"].poser(basse808(r, S.t(4) * 0.95, glisse=0.25 if i % 2 else 0), S.t(b), 0.3)
        S.p["nappe"].poser(nappe([midi(note(n)) for n in notes], S.t(4), attaque=0.01, relache=0.2, ouverture=2600, graine=S.g()), S.t(b), 0.55)
        if sec.get("balafon", True):
            for pas in range(16):
                if pas in (1, 4, 9, 12) and i % 2 == 0:
                    continue
                n_ = BALAFON[(pas + 16 * (i % 2)) % 16]
                S.p["melodie"].poser(balafon(midi(note(n_)), 0.6, S.g()), S.t(b) + S.swing(pas), 0.42, pan=0.25 if pas % 2 else -0.25)


def s_pont(sec, S):
    """La respiration : la nappe et le balafon seuls, la batterie filtrée."""
    de, a = sec["de"], sec["a"]
    mesures = int((a - de) // 4)
    for i in range(mesures):
        b = de + 4 * i
        racine, notes = _accord(i)
        S.p["nappe"].poser(nappe([midi(note(n)) for n in notes], S.t(4) + 0.3, attaque=0.3, relache=0.5, ouverture=1400, graine=S.g()), S.t(b), 0.75)
        for pas in range(0, 16, 2):
            n_ = BALAFON[(pas + 3 * i) % 16]
            S.p["melodie"].poser(balafon(midi(note(n_)), 0.8, S.g(), bourdon=0.2), S.t(b) + S.swing(pas), 0.35, pan=0.3 if pas % 4 else -0.3)
        for pas in range(16):
            S.p["perc"].poser(shaker(S.g(), 0.6 if pas % 2 else 0.35), S.t(b) + S.swing(pas), 0.45, pan=0.4)
        S.p["kick"].poser(kick(0.5, 120, 44, 0.03, 0.3, 0.1, 1.5, S.g()), S.t(b), 0.55)
        S.coups.append(S.t(b))
    elan = sec.get("elan", 0)
    if elan:
        S.p["fx"].poser(montee(S.t(elan), S.g()), S.t(a - elan), 0.8)
        S.p["fx"].poser(cymbale_inverse(S.t(elan), S.g()), S.t(a - elan), 0.7)
        b = a - elan
        while b < a - 0.01:
            u = (b - (a - elan)) / elan
            S.p["perc"].poser(caisse_claire(S.g()), S.t(b), 0.25 + 0.6 * u, pan=0.1)
            b += 0.5 if u < 0.35 else 0.25 if u < 0.7 else 0.125


def s_final(sec, S):
    """La marque à l'écran : une nappe large, le balafon qui se pose sur fa."""
    de, a = sec["de"], sec["a"]
    racine, notes = ACCORDS["Fm9"]
    d = S.t(a - de) + 3.5
    S.p["nappe"].poser(nappe([midi(note(n)) for n in notes] + [midi(note("C5"))], d, attaque=0.05, relache=3.0, ouverture=1800, graine=S.g()), S.t(de), 0.8)
    S.p["basse"].poser(basse808(midi(note("F1")), min(d, 4.0)), S.t(de), 0.35)



def s_revelation(sec, S):
    """Après le coup : la nappe tenue, la basse qui gronde, puis une montée
    courte et un roulement qui lancent le drop."""
    de, a = sec["de"], sec["a"]
    racine, notes = ACCORDS["Fm9"]
    d = S.t(a - de)
    S.p["nappe"].poser(nappe([midi(note(n)) for n in notes], d, attaque=0.02, relache=0.3, ouverture=1500, graine=S.g()), S.t(de), 0.75)
    S.p["basse"].poser(basse808(midi(note("F1")), d * 0.6), S.t(de), 0.35)
    for k, n_ in enumerate(["F4", "Ab4", "C5", "Eb5"]):
        S.p["melodie"].poser(balafon(midi(note(n_)), 1.0, S.g()), S.t(de + 2 + k * 0.5), 0.4, pan=[-0.3, 0.3, -0.15, 0.15][k])
    elan = sec.get("elan", 2)
    S.p["fx"].poser(montee(S.t(elan), S.g()), S.t(a - elan), 0.7)
    b = a - elan
    while b < a - 0.01:
        u = (b - (a - elan)) / elan
        S.p["perc"].poser(caisse_claire(S.g()), S.t(b), 0.3 + 0.5 * u, pan=0.1)
        b += 0.25 if u < 0.5 else 0.125


def s_point(sec, S):
    """Après le silence, le point : une cloche seule, puis une nappe qui gonfle
    pendant que les brins se tracent, et l'élan qui lance le drop."""
    de, a = sec["de"], sec["a"]
    S.p["melodie"].poser(cloche(midi(note("F5")), 2.5), S.t(de), 0.6)
    racine, notes = ACCORDS["Fm9"]
    d = S.t(a - de)
    S.p["nappe"].poser(nappe([midi(note(n)) for n in notes], d, attaque=d * 0.5, relache=0.3, ouverture=1300, graine=S.g()), S.t(de + 1), 0.8)
    n = int(S.t(4.5) * SR)
    miroite = filtre_mouvant(bruit(n, S.g()), lambda f, tt: passe_bande(2000 * 3 ** min(1, max(0, tt) / S.t(4.5)), 4)(f)) * np.sin(np.pi * np.clip(temps(n) / S.t(4.5), 0, 1)) * 0.25
    S.p["fx"].poser(miroite, S.t(de + 1), 0.6)
    elan = sec.get("elan", 0)
    if elan:
        S.p["fx"].poser(montee(S.t(elan), S.g()), S.t(a - elan), 0.8)
        S.p["fx"].poser(cymbale_inverse(S.t(elan), S.g()), S.t(a - elan), 0.8)
        b = a - elan
        while b < a - 0.01:
            u = (b - (a - elan)) / elan
            S.p["perc"].poser(caisse_claire(S.g()), S.t(b), 0.25 + 0.6 * u, pan=0.1)
            b += 0.5 if u < 0.35 else 0.25 if u < 0.7 else 0.125


def s_rembobinage(sec, S):
    """Rien n'est composé ici : le mixage rejouera la bande à l'envers (voir mixer)."""
    S.rembobinages.append((sec["de"], sec["a"], sec.get("courbe", 1.6)))


def s_piege(sec, S):
    """La lecture du piège : un bourdon qui monte d'un demi-ton par temps et
    un cœur qui accélère. Le rouge monte à l'image, la tension au son."""
    de, a = sec["de"], sec["a"]
    d = S.t(a - de)
    n = int(d * SR)
    t = temps(n)
    f = midi(note("F2")) * 2 ** (t / d * 7 / 12)
    bourdon = np.zeros(n)
    for v in range(3):
        ph = np.cumsum(f * (1 + (v - 1) * 0.004)) / SR
        bourdon += 2 * (ph % 1.0) - 1
    bourdon = filtre(bourdon / 3, passe_bas(900)) * (t / d) ** 1.5
    S.p["nappe"].poser(bourdon, S.t(de), 0.5)
    b = de
    pas = 1.0
    while b < a - 0.01:
        S.p["kick"].poser(coeur(), S.t(b), 0.5 + 0.3 * (b - de) / (a - de))
        S.coups.append(S.t(b))
        pas = max(0.5, pas * 0.8)
        b += pas


def s_calme(sec, S):
    """Après le silence : une nappe tenue, basse, qui laisse la place aux mots."""
    de, a = sec["de"], sec["a"]
    racine, notes = ACCORDS["Dbmaj9"]
    S.p["nappe"].poser(nappe([midi(note(n)) for n in notes], S.t(a - de) + 0.3, attaque=0.6, relache=0.4, ouverture=1100, graine=S.g()), S.t(de) + 0.25, 0.8)
    S.p["melodie"].poser(balafon(midi(note("Ab4")), 1.2, S.g(), bourdon=0.15), S.t(de + 2), 0.35, pan=-0.2)
    S.p["melodie"].poser(balafon(midi(note("F4")), 1.4, S.g(), bourdon=0.15), S.t(de + 2.5), 0.35, pan=0.2)


SECTIONS = {"point": s_point, "rembobinage": s_rembobinage, "piege": s_piege, "calme": s_calme, "revelation": s_revelation, "froid": s_froid, "tension": s_tension, "coupure": s_coupure, "drop": s_drop, "pont": s_pont, "final": s_final}


# Les événements ponctuels : ils tombent sur une image précise du montage.

def e_impact(ev, S):
    t = S.t(ev["temps"])
    S.p["impacts"].poser(impact(3.5, S.g()), t, ev.get("gain", 1.0))
    S.p["kick"].poser(kick(0.9, 200, 40, 0.04, 0.6, 0.5, 3.0, S.g()), t, 1.0)
    S.coups.append(t)
    if ev.get("braam", True):
        br = braam(midi(note(ev.get("note", "F1"))), 3.2, S.g())
        if ev.get("distorsion"):
            br = sat(br * 4.0, 3.0) * 0.6
        S.p["impacts"].poser(br, t, 0.8)
    S.p["fx"].poser(filtre(bruit(int(2.5 * SR), S.g()), passe_haut(3000)) * np.exp(-temps(int(2.5 * SR)) / 0.6) * 0.35, t, 1.0, pan=0.1)


def e_ping(ev, S):
    """Le SMS qui arrive. « etouffe » : entendu à travers un mur, ou à 9 000 km."""
    x = ping_sms()
    if ev.get("etouffe"):
        x = filtre(x * 2.5, passe_bas(700, 3))
    S.p["fx"].poser(x, S.t(ev["temps"]), ev.get("gain", 0.55), pan=ev.get("pan", 0.0))


def e_souffle(ev, S):
    d = ev.get("duree", 0.5)
    S.p["fx"].poser(souffle(d, S.g(), ev.get("descend", False)), S.t(ev["temps"]) - d * 0.6, ev.get("gain", 0.55), pan=ev.get("pan", 0.0))


def e_glitch(ev, S):
    S.p["fx"].poser(glitch_son(ev.get("duree", 0.25), S.g()), S.t(ev["temps"]), ev.get("gain", 0.4), pan=ev.get("pan", 0.0))


def e_modem(ev, S):
    S.p["fx"].poser(modem(ev.get("duree", 0.6), S.g()), S.t(ev["temps"]), ev.get("gain", 0.35), pan=ev.get("pan", 0.2))


def e_frappe(ev, S):
    """Un coup sec sur un carton : grosse caisse, claquement, cymbale."""
    t = S.t(ev["temps"])
    S.p["kick"].poser(kick(0.6, 190, 45, 0.03, 0.4, 0.5, 2.6, S.g()), t, 0.95)
    S.coups.append(t)
    S.p["perc"].poser(clap(S.g(), 0.3), t, 0.6)
    S.p["fx"].poser(filtre(bruit(int(1.2 * SR), S.g()), passe_haut(5000)) * np.exp(-temps(int(1.2 * SR)) / 0.3) * 0.3, t, ev.get("gain", 0.8))


def e_touche(ev, S):
    """Une touche du pavé : un clic sourd, sans hauteur (le code ne s'entend pas)."""
    n = int(0.04 * SR)
    x = filtre(bruit(n, S.g()), passe_bande(1800, 1.5)) * np.exp(-temps(n) / 0.006)
    S.p["fx"].poser(x, S.t(ev["temps"]), ev.get("gain", 0.35), pan=ev.get("pan", 0.0))


def e_panne(ev, S):
    """Le courant saute : tout se tait d'un coup (voir mixer), après un bruit
    sourd de transformateur qui lâche."""
    t = S.t(ev["temps"])
    n = int(0.25 * SR)
    x = np.sin(2 * np.pi * 50 * temps(n)) * np.exp(-temps(n) / 0.05) + filtre(bruit(n, S.g()), passe_bas(400)) * np.exp(-temps(n) / 0.03)
    S.p["fx"].poser(sat(x, 2.0), t - 0.02, 0.6)
    S.pannes.append((t, t + S.t(ev.get("duree", 0.5))))


def e_silence(ev, S):
    """Le silence numérique : pas même la queue de la réverbération."""
    t = S.t(ev["temps"])
    S.silences.append((t, t + S.t(ev.get("duree", 2))))


def e_clave(ev, S):
    """Une clave sèche, une seule, sans salle."""
    S.p["kick"].poser(clave(S.g()) * 2.2, S.t(ev["temps"]), ev.get("gain", 0.8), pan=0.0)


def e_tic(ev, S):
    """Un tic de lecture : un signe franchi."""
    n = int(0.05 * SR)
    x = np.sin(2 * np.pi * 3200 * temps(n)) * np.exp(-temps(n) / 0.008)
    S.p["fx"].poser(x, S.t(ev["temps"]), ev.get("gain", 0.3), pan=ev.get("pan", 0.0))


def e_tresse(ev, S):
    """La Tresse sonore : deux voix de balafon, une par brin, un coup par sommet
    de la polyligne (7 sommets). Elles sont à l'unisson aux croisements et aux
    deux bouts, s'écartent entre les deux, et chaque voix est placée dans
    l'espace comme son brin (gauche, droite). Le temps de chaque coup suit la
    courbe du tracé à l'image (acc.deux3 dans outils.js)."""
    de, a = ev["de"], ev["a"]
    def inverse_deux3(phi):
        return (phi / 4) ** (1 / 3) if phi < 0.5 else 1 - (2 * (1 - phi)) ** (1 / 3) / 2
    voix_a = ["F4", "Bb4", "F4", "C4", "F4", "Bb4", "F4"]
    voix_b = ["F4", "C4", "F4", "Bb4", "F4", "C4", "F4"]
    ecart = [0, 1, 0, -1, 0, 1, 0]  # le brin A à droite (+), à gauche (-) ; B en miroir
    for i in range(7):
        t = S.t(de + (a - de) * inverse_deux3(i / 6))
        g = ev.get("gain", 0.5)
        if ecart[i] == 0:
            S.p["melodie"].poser(balafon(midi(note(voix_a[i])), 1.1, S.g(), bourdon=0.25), t, g * 1.2, pan=0.0)
        else:
            S.p["melodie"].poser(balafon(midi(note(voix_a[i])), 1.0, S.g(), bourdon=0.25), t, g, pan=0.6 * ecart[i])
            S.p["melodie"].poser(balafon(midi(note(voix_b[i])), 1.0, S.g(), bourdon=0.25), t, g, pan=-0.6 * ecart[i])


EVENEMENTS = {"tresse": e_tresse, "silence": e_silence, "clave": e_clave, "tic": e_tic, "panne": e_panne, "impact": e_impact, "ping": e_ping, "souffle": e_souffle, "glitch": e_glitch, "modem": e_modem, "frappe": e_frappe, "touche": e_touche}


def mixer(S):
    n = S.n
    p = S.p
    pom = pompe(n, S.coups, 0.7, 0.14)
    pom_doux = pompe(n, S.coups, 0.4, 0.12)
    p["nappe"].x *= pom
    p["basse"].x *= pom_doux
    p["melodie"].x *= pom_doux
    # La salle : une réverbération commune, dosée par piste.
    envois = {"perc": 0.10, "nappe": 0.30, "melodie": 0.28, "fx": 0.30, "impacts": 0.40, "kick": 0.03, "basse": 0.0}
    gains = {"kick": 0.95, "perc": 0.75, "basse": 0.8, "nappe": 0.45, "melodie": 0.7, "fx": 0.8, "impacts": 0.85}
    somme = np.zeros((2, n))
    envoi = np.zeros((2, n))
    for k, piste in p.items():
        somme += piste.x * gains[k]
        envoi += piste.x * gains[k] * envois[k]
    # Le niveau de chaque section, en dB : c'est lui qui fait que le drop
    # frappe — une montée aussi forte que lui ne monte vers rien.
    somme *= S.niveaux
    envoi *= S.niveaux
    envoi = np.stack([filtre(envoi[c], passe_haut(250)) for c in range(2)])
    salle = convoluer(envoi, reverb_ir(2.6, 7, 0.45))
    x = somme + salle * 0.9
    # Sous 30 Hz, rien qu'on entende : seulement de la place prise au limiteur.
    x = np.stack([filtre(x[c], passe_haut(30, 3)) for c in range(2)])
    # Le grave au centre : sous 120 Hz, les deux oreilles reçoivent le même signal.
    mid, side = (x[0] + x[1]) / 2, (x[0] - x[1]) / 2
    side = filtre(side, passe_haut(140, 2))
    x = np.stack([mid + side, mid - side])
    # Colle : une compression lente sur la somme.
    env = np.sqrt(np.convolve((x ** 2).mean(axis=0), np.ones(int(0.05 * SR)) / int(0.05 * SR), mode="same"))
    seuil = 0.25
    gain = np.where(env > seuil, (seuil / np.maximum(env, 1e-9)) ** (1 - 1 / 2.5), 1.0)
    x *= gain
    x /= max(1e-9, np.abs(x).max())
    x = sat(x * 1.4, 1.2)
    x = limiter(x * 1.25, 0.94)
    # Le rembobinage : la bande repart à l'envers, de plus en plus vite, depuis
    # l'instant où il commence jusqu'au début — la même courbe que l'image.
    for de, a, courbe in S.rembobinages:
        i0, i1 = int(S.t(de) * SR), int(S.t(a) * SR)
        u = np.linspace(0, 1, i1 - i0)
        src = S.t(de) * (1 - u ** courbe) * SR
        j = np.clip(src.astype(int), 0, x.shape[1] - 2)
        fr = src - j
        bande = x[:, j] * (1 - fr) + x[:, j + 1] * fr
        souffle_ = filtre(bruit(i1 - i0, 999), passe_haut(3000)) * 0.05
        bande = np.stack([filtre(bande[c], passe_bas(5000)) for c in range(2)]) * 0.8 + souffle_
        f = int(0.01 * SR)
        bande[:, -f:] *= np.linspace(1, 0, f)
        x[:, i0:i1] = bande
    # Les silences : le son s'arrête net, réverbération comprise.
    for a, b in S.silences:
        i0, i1 = int(a * SR), int(b * SR)
        f = int(0.003 * SR)
        x[:, i0 + f: i1] = 0
        x[:, i0: i0 + f] *= np.linspace(1, 0, f)
    # Les pannes : le son se coupe net (quelques millisecondes de fondu, pour ne pas claquer).
    for a, b in S.pannes:
        i0, i1 = int(a * SR), int(b * SR)
        f = int(0.004 * SR)
        x[:, i0 + f: i1] = 0
        x[:, i0: i0 + f] *= np.linspace(1, 0, f)
        x[:, i1: i1 + f] *= np.linspace(0, 1, f)
    # Fondu de fin, et quelques millisecondes de silence au début.
    f = int(0.8 * SR)
    x[:, -f:] *= np.linspace(1, 0, f) ** 2
    return x


def courbe_niveaux(cond, S):
    g = np.ones(S.n)
    for sec in cond["sections"]:
        nv = sec.get("niveau", 0)
        a, b = nv if isinstance(nv, list) else (nv, nv)
        i0, i1 = int(S.t(sec["de"]) * SR), min(S.n, int(S.t(sec["a"]) * SR))
        g[i0:i1] = 10 ** (np.linspace(a, b, max(1, i1 - i0)) / 20)
    # Les raccords : 20 ms de lissage, pour ne pas claquer.
    k = int(0.02 * SR)
    return np.convolve(g, np.ones(k) / k, mode="same")


def composer(cond, m=None):
    S = Session(cond, m)
    S.niveaux = courbe_niveaux(cond, S)
    for sec in cond["sections"]:
        SECTIONS[sec["nature"]](sec, S)
    for ev in cond.get("evenements", []):
        EVENEMENTS[ev["type"]](ev, S)
    return mixer(S)


def main():
    sortie = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ICI, "rendu", "musique.wav")
    chemin = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ICI, "conducteur.json")
    conducteur = json.load(open(chemin, encoding="utf-8"))
    x = composer(conducteur, sys.modules[__name__])
    os.makedirs(os.path.dirname(os.path.abspath(sortie)), exist_ok=True)
    ecrire_wav(sortie, x)
    print(f"musique : {x.shape[1] / SR:.2f} s, crête {20 * np.log10(np.abs(x).max()):.1f} dB → {sortie}")


if __name__ == "__main__":
    main()
