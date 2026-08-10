# TOTEM ADMIN — l'histoire commune (données canoniques, identiques sur tous les écrans)

Console super-admin : Nelson pilote depuis la France une flotte de Raspberry Pi
(« terminaux ») au Cameroun, chacun portant des modems SIM7600 et des SIMs
Mobile Money, pour des clients commerçants. Un robot Telegram par client.

## La flotte — 7 terminaux
| Terminal | Ville · quartier | État | SIMs | Signal | Alimentation | Vu il y a |
|---|---|---|---|---|---|---|
| douala-akwa-01 | Douala · Akwa | Active | 2 | 4/5 | secteur · 100% | 12 s |
| douala-bonaberi-01 | Douala · Bonabéri | Active | 2 | 3/5 | secteur · 100% | 31 s |
| douala-deido-01 | Douala · Deïdo | Active | 1 | 4/5 | secteur · 100% | 8 s |
| yaounde-centre-01 | Yaoundé · Centre | Active | 2 | 3/5 | secours 4G | 54 s |
| yaounde-mvan-01 | Yaoundé · Mvan | Roaming SIM (1 SIM en itinérance) | 2 | 2/5 | secteur · 100% | 19 s |
| bafoussam-01 | Bafoussam | On battery · 76% (2 coupures lundi) | 1 | 4/5 | batterie | 26 s |
| bafoussam-marche-01 | Bafoussam · Marché | Active (enrôlé hier, Mme Fotso) | 2 | 4/5 | secteur · 100% | 41 s |

Chiffres de la semaine : 1,412 SMS traités · 96 reçus émis · 0 file en attente ·
0 intervention manuelle sur l'argent. SMS aujourd'hui : 218 (14 reçus).

## Versions
- Flotte : `stable-2.4.2` — vague mardi 09:05→09:31, 26 min, 7/7, 0 session USSD interrompue.
- Canari (Paris) : `main @ e4f21c9` — PR #87 « nom commercial sur les reçus »,
  mergée lundi 14:10 ; migration Supabase auto 14:12 (add column
  comptes.nom_commercial, 1.2 s) ; Vercel 14:13 ; canari à jour 14:25.

## Les SIMs — 12 actives (7 Orange, 5 MTN) + 1 retirée = 13 jamais vues
Réparties : akwa 2 · bonabéri 2 · deïdo 1 · yaoundé-centre 2 · yaoundé-mvan 2 ·
bafoussam 1 · bafoussam-marché 2. Une seule est en itinérance (··2258).
- Vedette : Orange ··4177 — WONDER PHONE (M. Kamga), +237 696 103 864,
  solde 6,335,788.6 FCFA vérifié 14:02, signal 26/31, douala-akwa-01.
- MTN ··9021 — KAMGA SARL, 912,400 FCFA vérifié 13:47, douala-akwa-01.
- Orange ··8812 + MTN ··3305 — Mme Fotso, bafoussam-marche-01 (depuis hier).
- Orange ··2258 — M. Talla, yaounde-mvan-01, EN ITINÉRANCE (réseau partenaire).
- Orange ··6640 — Mme Ngo, yaounde-centre-01, 27/31.
- MTN ··1170 — M. Talla, douala-deido-01, 21/31.
- Orange ··9944 — RETIRÉE le 12 Aug 09:40 (était M. Eyenga) ; solde au retrait
  45,210 FCFA ; vie : 1re vue 5 Jan (douala-akwa-01), déplacée 5 Jul
  (douala-bonaberi-01), 219 jours d'historique, 0 trou.

## Les gens — 6 personnes, 4 commerces
- M. Kamga — Wonder Phone, Douala · Akwa — owner — Orange ··4177 + MTN ··9021 —
  @KamgaCaisseBot (lié 14 Mar, 2 membres) — 2-step authenticator ✓ — connecté auj. 12:31.
- Mme Fotso — Commerce, Bafoussam — owner — Orange ··8812 + MTN ··3305 — @FotsoCaisseBot — hier 18:47.
- M. Talla — Quincaillerie, Deïdo — owner — Orange ··2258 + MTN ··1170 — @TallaCaisseBot — auj. 10:05.
- Mme Ngo — Pharmacie, Yaoundé — owner — Orange ··6640 — @NgoCaisseBot — hier 09:12.
- J. Eyenga — staff, operator pour M. Kamga — Orange ··4177 — auj. 09:40.
- C. Fotso — comptable, viewer pour Mme Fotso — Orange ··8812 — invitée il y a 2 j, jamais connectée.
Rôles : owner voit et opère ses SIMs, invite son staff · operator opère au
quotidien (le PIN d'argent reste la barrière du propriétaire) · viewer lit tout,
ne change rien. Connexion : code e-mail OU application d'authentification.

## Les incidents de la semaine (3, tous résolus, médiane 38 min)
1. Mardi 16:25→17:20 — antenne Orange, Douala : 3 SIMs sans signal d'un coup,
   auto-résolu 55 min, 12 SMS rattrapés.
2. Lundi — 2 coupures secteur à Bafoussam : batterie a tenu 47 min, extinction
   propre + redémarrage auto, 0 donnée perdue.
3. Jeudi 15:50→16:04 — box internet grillée à Yaoundé-Centre (Mme Ngo, pharmacie) :
   alerte 15:50 (dernier battement 15:39), appel 15:54 (« odeur de brûlé »),
   routeur 4G de secours branché 16:01, en ligne 16:04, 12 SMS rattrapés 16:05,
   résolu en 14 min, 0 perdu, 1 seul geste humain (un câble).

## Le reçu vedette
TM-2026-0805-0075 — refait en « transfer » pour WONDER PHONE aujourd'hui 14:02,
terminé en 18 s (l'événement apparaît dans le journal de flotte et l'activité de M. Kamga).

## Les règles de fond (à faire sentir, jamais en poster)
- Le PIN n'est stocké nulle part — tapé au moment d'opérer, journalisé `····`.
- Un admin administre, il n'opère pas l'argent (ça, c'est le rôle operator/owner).
- Chaque geste admin est journalisé — le journal est en append-only.
- Le grand livre suit la puce (ICCID), jamais la machine ; un retrait n'efface rien.
- Connexion de Nelson : super admin · 2-step authenticator ✓.

## Langue
UI en ANGLAIS. Bascule « English | Français » EN TOUTES LETTRES — jamais
« EN/FR », jamais d'abréviation, sur aucun écran, à aucune taille.

## Le détail des 13 SIMs (canonique — tous les écrans doivent concorder)
| SIM | Terminal | Personne | Solde connu | Signal | État |
|---|---|---|---|---|---|
| Orange ··4177 | douala-akwa-01 | M. Kamga | 6,335,788.6 FCFA (14:02) | 26/31 | en place |
| MTN ··9021 | douala-akwa-01 | M. Kamga | 912,400 FCFA (13:47) | 23/31 | en place |
| Orange ··5310 | douala-bonaberi-01 | M. Kamga | 1,204,300 FCFA (13:52) | 22/31 | en place |
| MTN ··7742 | douala-bonaberi-01 | M. Kamga | 486,150 FCFA (12:40) | 20/31 | en place |
| MTN ··1170 | douala-deido-01 | M. Talla | 305,900 FCFA (13:31) | 21/31 | en place |
| Orange ··6640 | yaounde-centre-01 | Mme Ngo | 2,140,500 FCFA (13:20) | 27/31 | en place |
| MTN ··4408 | yaounde-centre-01 | Mme Ngo | 176,300 FCFA (11:05) | 24/31 | en place |
| Orange ··2258 | yaounde-mvan-01 | M. Talla | 861,200 FCFA (13:44) | réseau partenaire | itinérance |
| Orange ··3096 | yaounde-mvan-01 | M. Talla | 512,700 FCFA (12:58) | 18/31 | en place |
| Orange ··7715 | bafoussam-01 | Mme Fotso | 233,050 FCFA (13:12) | 25/31 | en place |
| Orange ··8812 | bafoussam-marche-01 | Mme Fotso | 94,600 FCFA (13:57) | 29/31 | en place |
| MTN ··3305 | bafoussam-marche-01 | Mme Fotso | 61,250 FCFA (13:05) | 24/31 | en place |
| Orange ··9944 | — (retirée) | était M. Eyenga | 45,210 FCFA au retrait | — | retirée 12 Aug |
Filtres du registre : All 13 · Orange 8 · MTN 5 · Removed 1.
Douala porte 5 SIMs, Yaoundé 4, Bafoussam 3.
