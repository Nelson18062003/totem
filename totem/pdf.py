# -*- coding: utf-8 -*-
"""Fabrique de PDF, en Python seul.

Pourquoi écrire ça plutôt que d'installer une bibliothèque : la maquette des
reçus passait par Chromium. Deux pages y prennent 2,5 s sur une machine de
bureau et quelques centaines de mégaoctets de mémoire. Sur le Raspberry Pi de
Douala, qui interroge deux modems en même temps, c'est hors de proportion pour
un document d'une page. Ce module en fabrique un en quelques millisecondes,
sans rien ajouter aux dépendances du projet.

Ce qu'il sait faire, et rien de plus :

  - une page, une taille, un fond blanc ;
  - des rectangles, arrondis ou non, et des filets ;
  - du texte dans une police TrueType **embarquée** — le fichier s'ouvre
    partout à l'identique, même sans la police installée ;
  - des tracés vectoriels, avec découpe — c'est ce qui permet de reprendre le
    symbole de la marque tel qu'il est décrit dans `brand/generer.py`.

Le repère du PDF part du coin **bas gauche** et monte. On raisonne mal ainsi
quand on transcrit une maquette, qui se lit de haut en bas : toutes les
méthodes de `Page` prennent donc un `y` mesuré **depuis le haut**, et la
conversion se fait au dernier moment.
"""

import struct
import zlib

MM = 72 / 25.4          # un millimètre, en points PDF


def couleur(hexa):
    """« #9a4b2e » → (0.604, 0.294, 0.180). Le PDF ne connaît que des réels."""
    h = hexa.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


# --- Lecture d'une police TrueType ------------------------------------------
# Juste assez pour embarquer le fichier tel quel et savoir où poser les
# lettres : la correspondance caractère → glyphe, et la chasse de chaque
# glyphe. Le reste des tables voyage avec le fichier, intact.

class Police:
    """Une police TrueType, lue une fois, embarquée dans le PDF sans retouche.

    On ne la découpe pas : un fichier DM Sans pèse 48 ko, un document en
    embarque deux, et la simplicité vaut mieux ici que cent kilo-octets.
    """

    def __init__(self, chemin, nom):
        with open(chemin, "rb") as f:
            self.octets = f.read()
        self.nom = nom
        # Les glyphes réellement employés : seule leur chasse est déclarée
        # dans le PDF, le reste de la police tenant lieu de secours.
        self.glyphes_utilises = set()
        self._tables = self._repertoire()
        self._lire_head()
        self._lire_metriques()
        self._cmap = self._lire_cmap()

    # -- lecture des tables --------------------------------------------------
    def _repertoire(self):
        nombre = struct.unpack(">H", self.octets[4:6])[0]
        tables = {}
        for i in range(nombre):
            base = 12 + 16 * i
            tag, _, debut, longueur = struct.unpack(
                ">4sIII", self.octets[base:base + 16])
            tables[tag.decode("latin-1")] = (debut, longueur)
        return tables

    def _table(self, nom):
        debut, longueur = self._tables[nom]
        return self.octets[debut:debut + longueur]

    def _lire_head(self):
        head = self._table("head")
        self.unites = struct.unpack(">H", head[18:20])[0]
        self.cadre = struct.unpack(">4h", head[36:44])   # xMin yMin xMax yMax

        os2 = self._table("OS/2") if "OS/2" in self._tables else b""
        self.montant_capitale = (struct.unpack(">h", os2[88:90])[0]
                                 if len(os2) >= 90 else int(self.unites * 0.7))
        self.au_dessus = (struct.unpack(">h", os2[68:70])[0]
                          if len(os2) >= 70 else self.cadre[3])
        self.au_dessous = (struct.unpack(">h", os2[70:72])[0]
                           if len(os2) >= 72 else self.cadre[1])

        # La hauteur de ligne « normale » d'un navigateur, et la part du corps
        # qui sépare le haut de cette ligne de sa base. C'est avec ces deux
        # nombres que la maquette se transcrit au millimètre.
        hhea = self._table("hhea")
        monte, descend, blanc = struct.unpack(">3h", hhea[4:10])
        self.montee = monte / self.unites
        self.interligne = (monte - descend + blanc) / self.unites

    def _lire_metriques(self):
        nombre = struct.unpack(">H", self._table("hhea")[34:36])[0]
        hmtx = self._table("hmtx")
        self._chasses = [struct.unpack(">H", hmtx[4 * i:4 * i + 2])[0]
                         for i in range(nombre)]

    def _lire_cmap(self):
        """La correspondance caractère Unicode → numéro de glyphe.

        On prend la première sous-table utilisable : le format 4 couvre le
        plan latin, qui est tout ce dont un reçu camerounais a besoin.
        """
        cmap = self._table("cmap")
        nombre = struct.unpack(">H", cmap[2:4])[0]
        choisie = None
        for i in range(nombre):
            plate, encodage, decalage = struct.unpack(
                ">HHI", cmap[4 + 8 * i:12 + 8 * i])
            if (plate, encodage) in ((3, 1), (3, 10), (0, 3), (0, 4)):
                format_ = struct.unpack(">H", cmap[decalage:decalage + 2])[0]
                if format_ == 4:
                    choisie = decalage
                    break
        if choisie is None:
            return {}
        return self._cmap_format4(cmap, choisie)

    @staticmethod
    def _cmap_format4(cmap, base):
        segments = struct.unpack(">H", cmap[base + 6:base + 8])[0] // 2
        def bloc(decalage):
            debut = base + decalage
            return struct.unpack(f">{segments}H",
                                 cmap[debut:debut + segments * 2])
        fins = bloc(14)
        debuts = bloc(16 + segments * 2)
        deltas = bloc(16 + segments * 4)
        ecarts = bloc(16 + segments * 6)
        base_ecarts = base + 16 + segments * 6

        table = {}
        for i in range(segments):
            if debuts[i] == 0xFFFF:
                continue
            for code in range(debuts[i], min(fins[i], 0xFFFE) + 1):
                if ecarts[i] == 0:
                    glyphe = (code + deltas[i]) & 0xFFFF
                else:
                    position = (base_ecarts + i * 2 + ecarts[i]
                                + (code - debuts[i]) * 2)
                    if position + 2 > len(cmap):
                        continue
                    glyphe = struct.unpack(">H", cmap[position:position + 2])[0]
                    if glyphe:
                        glyphe = (glyphe + deltas[i]) & 0xFFFF
                if glyphe:
                    table[code] = glyphe
        return table

    # -- ce dont la mise en page a besoin ------------------------------------
    def glyphes(self, texte):
        trouves = [self._cmap.get(ord(c), 0) for c in texte]
        self.glyphes_utilises.update(trouves)
        return trouves

    def chasse(self, glyphe):
        """Largeur d'avance d'un glyphe, en millièmes de cadratin."""
        if not self._chasses:
            return 500
        brute = self._chasses[min(glyphe, len(self._chasses) - 1)]
        return brute * 1000 / self.unites

    def largeur(self, texte, corps, interlettrage=0.0):
        """Largeur du texte composé, en points. `interlettrage` est en em,
        comme le `letter-spacing` de la maquette."""
        glyphes = self.glyphes(texte)
        if not glyphes:
            return 0.0
        avance = sum(self.chasse(g) for g in glyphes) / 1000 * corps
        # L'écart s'ajoute APRÈS chaque lettre, y compris la dernière : on le
        # retire du dernier, sinon tout ce qui est centré ou aligné à droite
        # se décale d'un demi-caractère.
        return avance + interlettrage * corps * (len(glyphes) - 1)


# --- La page ----------------------------------------------------------------

class Page:
    """Une page, et ce qu'on y pose. `y` se mesure depuis le HAUT."""

    def __init__(self, largeur, hauteur):
        self.largeur = largeur
        self.hauteur = hauteur
        self.polices = {}          # nom PDF → Police
        self._flux = []

    def _y(self, y):
        return self.hauteur - y

    def _ajouter(self, ligne):
        self._flux.append(ligne)

    # -- formes --------------------------------------------------------------
    def rectangle(self, x, y, largeur, hauteur, teinte, rayon=0):
        r, v, b = couleur(teinte)
        self._ajouter(f"{r:.4f} {v:.4f} {b:.4f} rg")
        self._ajouter(self._contour_rectangle(x, y, largeur, hauteur, rayon))
        self._ajouter("f")

    def _contour_rectangle(self, x, y, largeur, hauteur, rayon):
        bas, haut = self._y(y + hauteur), self._y(y)
        if rayon <= 0:
            return f"{x:.3f} {bas:.3f} {largeur:.3f} {hauteur:.3f} re"
        r = min(rayon, largeur / 2, hauteur / 2)
        k = r * 0.5523           # l'approximation du quart de cercle en Bézier
        d = x + largeur
        return " ".join([
            f"{x + r:.3f} {bas:.3f} m",
            f"{d - r:.3f} {bas:.3f} l",
            f"{d - r + k:.3f} {bas:.3f} {d:.3f} {bas + r - k:.3f} "
            f"{d:.3f} {bas + r:.3f} c",
            f"{d:.3f} {haut - r:.3f} l",
            f"{d:.3f} {haut - r + k:.3f} {d - r + k:.3f} {haut:.3f} "
            f"{d - r:.3f} {haut:.3f} c",
            f"{x + r:.3f} {haut:.3f} l",
            f"{x + r - k:.3f} {haut:.3f} {x:.3f} {haut - r + k:.3f} "
            f"{x:.3f} {haut - r:.3f} c",
            f"{x:.3f} {bas + r:.3f} l",
            f"{x:.3f} {bas + r - k:.3f} {x + r - k:.3f} {bas:.3f} "
            f"{x + r:.3f} {bas:.3f} c",
            "h",
        ])

    def filet(self, x, y, largeur, teinte, epaisseur=0.75):
        """Le trait fin qui ferme l'en-tête."""
        r, v, b = couleur(teinte)
        self._ajouter(f"{r:.4f} {v:.4f} {b:.4f} RG {epaisseur:.3f} w")
        self._ajouter(f"{x:.3f} {self._y(y):.3f} m "
                      f"{x + largeur:.3f} {self._y(y):.3f} l S")

    # -- texte ---------------------------------------------------------------
    def texte(self, x, ligne_de_base, contenu, police, corps, teinte,
              interlettrage=0.0):
        """Pose le texte, sa ligne de base à `ligne_de_base` depuis le haut."""
        if not contenu:
            return 0.0
        nom = self._enregistrer(police)
        glyphes = police.glyphes(contenu)
        r, v, b = couleur(teinte)
        hexa = "".join(f"{g:04X}" for g in glyphes)
        self._ajouter(
            f"BT /{nom} {corps:.3f} Tf {interlettrage * corps:.4f} Tc "
            f"{r:.4f} {v:.4f} {b:.4f} rg "
            f"{x:.3f} {self._y(ligne_de_base):.3f} Td <{hexa}> Tj ET")
        return police.largeur(contenu, corps, interlettrage)

    def _enregistrer(self, police):
        for nom, connue in self.polices.items():
            if connue is police:
                return nom
        nom = f"P{len(self.polices) + 1}"
        self.polices[nom] = police
        return nom

    # -- tracés vectoriels ---------------------------------------------------
    def trace(self, chemin, teinte, epaisseur, echelle, dx, dy, decoupes=()):
        """Un tracé décrit en coordonnées SVG (M / L / C), déposé à l'échelle.

        `decoupes` : des rectangles (déjà exprimés en coordonnées SVG) que le
        tracé doit éviter. C'est ainsi que se fait le tressage du symbole —
        le brin qui passe dessous est interrompu au croisement.
        """
        r, v, b = couleur(teinte)
        self._ajouter("q")
        # SVG descend, le PDF monte : on retourne l'axe des ordonnées une fois
        # pour toutes, et les coordonnées de la charte se recopient telles quelles.
        self._ajouter(f"{echelle:.5f} 0 0 {-echelle:.5f} {dx:.3f} "
                      f"{self._y(dy):.3f} cm")
        if decoupes:
            grand = 10000
            morceaux = [f"{-grand} {-grand} {2 * grand} {2 * grand} re"]
            morceaux += [self._quadrilatere(c) for c in decoupes]
            # Règle pair-impair : le rectangle intérieur devient un trou.
            self._ajouter(" ".join(morceaux) + " W* n")
        self._ajouter(f"{r:.4f} {v:.4f} {b:.4f} RG {epaisseur:.3f} w "
                      "1 J 1 j")
        self._ajouter(_svg_en_pdf(chemin) + " S")
        self._ajouter("Q")

    @staticmethod
    def _quadrilatere(sommets):
        x0, y0 = sommets[0]
        corps = " ".join(f"{x:.3f} {y:.3f} l" for x, y in sommets[1:])
        return f"{x0:.3f} {y0:.3f} m {corps} h"


def _svg_en_pdf(chemin):
    """Traduit un « M x y C … » de SVG en « x y m … c » de PDF.

    Seules les commandes absolues M, L et C sont gérées : ce sont les seules
    que produit `brand/generer.py`, et deviner le reste serait inventer.
    """
    sortie, nombres, commande = [], [], None

    def vider():
        if commande == "M" and len(nombres) >= 2:
            sortie.append(f"{nombres[0]:.3f} {nombres[1]:.3f} m")
        elif commande == "L" and len(nombres) >= 2:
            sortie.append(f"{nombres[0]:.3f} {nombres[1]:.3f} l")
        elif commande == "C" and len(nombres) >= 6:
            sortie.append(" ".join(f"{n:.3f}" for n in nombres[:6]) + " c")

    tampon = ""
    for caractere in chemin + "Z":
        if caractere in "MLCZ":
            if tampon:
                nombres.append(float(tampon))
                tampon = ""
            vider()
            commande, nombres = caractere, []
        elif caractere in " ,":
            if tampon:
                nombres.append(float(tampon))
                tampon = ""
        elif caractere == "-" and tampon and tampon[-1] not in "eE":
            nombres.append(float(tampon))
            tampon = "-"
        else:
            tampon += caractere
    return " ".join(sortie)


# --- Le document ------------------------------------------------------------

class Document:
    """Assemble les objets PDF et rend les octets du fichier."""

    def __init__(self, page):
        self.page = page

    def octets(self):
        objets = [None]          # l'objet 0 n'existe pas, il ouvre la table

        def ajouter(contenu):
            objets.append(contenu)
            return len(objets) - 1

        flux = zlib.compress("\n".join(self.page._flux).encode("latin-1"))
        contenu = ajouter(b"<< /Length %d /Filter /FlateDecode >>\nstream\n"
                          % len(flux) + flux + b"\nendstream")

        ressources = []
        for nom, police in self.page.polices.items():
            ressources.append(f"/{nom} {self._police(police, ajouter)} 0 R")
        polices = "<< " + " ".join(ressources) + " >>" if ressources else "<< >>"

        pages = len(objets) + 1
        page = ajouter(
            f"<< /Type /Page /Parent {pages} 0 R "
            f"/MediaBox [0 0 {self.page.largeur:.3f} {self.page.hauteur:.3f}] "
            f"/Resources << /Font {polices} >> /Contents {contenu} 0 R >>"
            .encode("latin-1"))
        ajouter(f"<< /Type /Pages /Kids [{page} 0 R] /Count 1 >>"
                .encode("latin-1"))
        catalogue = ajouter(f"<< /Type /Catalog /Pages {pages} 0 R >>"
                            .encode("latin-1"))
        return self._assembler(objets, catalogue)

    def _police(self, police, ajouter):
        """Une police TrueType embarquée, adressée par numéro de glyphe.

        L'encodage « Identity-H » désigne les glyphes directement : les
        accents et le « ç » de « Reçu » passent sans table de correspondance
        à un octet, qui n'en aurait pas eu la place.
        """
        fichier = ajouter(
            b"<< /Length %d /Length1 %d /Filter /FlateDecode >>\nstream\n"
            % (len(zlib.compress(police.octets)), len(police.octets))
            + zlib.compress(police.octets) + b"\nendstream")

        e = 1000 / police.unites
        cadre = " ".join(f"{v * e:.0f}" for v in police.cadre)
        descripteur = ajouter(
            f"<< /Type /FontDescriptor /FontName /{police.nom} /Flags 32 "
            f"/FontBBox [{cadre}] /ItalicAngle 0 "
            f"/Ascent {police.au_dessus * e:.0f} "
            f"/Descent {police.au_dessous * e:.0f} "
            f"/CapHeight {police.montant_capitale * e:.0f} /StemV 80 "
            f"/FontFile2 {fichier} 0 R >>".encode("latin-1"))

        # La chasse de chaque glyphe employé ; les autres prennent /DW.
        chasses = " ".join(f"{g} [{police.chasse(g):.0f}]"
                           for g in sorted(police.glyphes_utilises))
        descendante = ajouter(
            f"<< /Type /Font /Subtype /CIDFontType2 /BaseFont /{police.nom} "
            f"/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) "
            f"/Supplement 0 >> /FontDescriptor {descripteur} 0 R /DW 500 "
            f"/W [{chasses}] /CIDToGIDMap /Identity >>".encode("latin-1"))

        return ajouter(
            f"<< /Type /Font /Subtype /Type0 /BaseFont /{police.nom} "
            f"/Encoding /Identity-H /DescendantFonts [{descendante} 0 R] >>"
            .encode("latin-1"))

    @staticmethod
    def _assembler(objets, catalogue):
        sortie = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
        positions = [0]
        for numero, contenu in enumerate(objets):
            if contenu is None:
                continue
            positions.append(len(sortie))
            sortie += f"{numero} 0 obj\n".encode("latin-1") + contenu + b"\nendobj\n"

        depart = len(sortie)
        sortie += f"xref\n0 {len(objets)}\n".encode("latin-1")
        sortie += b"0000000000 65535 f \n"
        for position in positions[1:]:
            sortie += f"{position:010d} 00000 n \n".encode("latin-1")
        sortie += (f"trailer\n<< /Size {len(objets)} /Root {catalogue} 0 R >>\n"
                   f"startxref\n{depart}\n%%EOF\n").encode("latin-1")
        return bytes(sortie)


__all__ = ["MM", "Document", "Page", "Police", "couleur"]
