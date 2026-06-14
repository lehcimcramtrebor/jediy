# LLM Context - Je-DIY

Ce fichier sert de guide de référence pour tout grand modèle de langage (LLM) ou développeur travaillant sur le projet **Je-DIY**. Il décrit l'architecture globale, la structure des répertoires, les scripts de build, les contraintes connues et les bonnes pratiques à respecter.

---

## 📖 Présentation du Projet

**Je-DIY** (Jedi DIY) est un calculateur expert pour les vapoteurs adeptes du "Do It Yourself" (fabrication maison d'e-liquides). 
L'application permet de :
* Calculer des recettes d'e-liquide nicotiné (avec prise en compte des densités du PG, de la VG, de l'eau, de l'alcool).
* Gérer des réserves concentrées pour shortfills avec simulations de boosters.
* Proposer un assistant de calcul étape par étape.
* Gérer le multi-arômes, sauvegarder et partager des compositions.
* Calculer des résistances (coils et mesh) et appliquer la loi d'Ohm.
* Partager des recettes ou les exporter en PDF.

---

## 🛠️ Stack Technique et Cibles de Déploiement

L'application est construite comme une **PWA (Progressive Web App)** sans framework JavaScript lourd (Vanilla JS / HTML5 / CSS3 via Tailwind). Elle est empaquetée pour 3 plateformes :

1. **Web (PWA / GitHub Pages)** :
   * Les sources de production sont générées dans le dossier `/docs`.
   * GitHub Pages est configuré pour servir le dossier `/docs` comme racine du site web.
2. **Mobile (Android via Capacitor)** :
   * Le wrapper Capacitor se synchronise sur le dossier `/www`.
   * Compile un APK autonome final `JE-DIY.apk`.
3. **Desktop (Windows via Electron)** :
   * Wrapper Electron personnalisé dans le dossier `/electron`.
   * Utilise un lanceur C# (`launcher.cs`) compilé en `.exe` pour créer un exécutable autonome et portable : `Je-DIY_portable.exe` dans `/electron/dist/`.

---

## 📁 Structure des Répertoires

```
jediy/
├── src/                       # 📂 Code source unique et brut de l'application
│   ├── assets/                # CSS, polices, et images
│   ├── Audit_Electric.md      # Documentation et formules d'audit électrique
│   ├── Audit_Liquide.md       # Règles physiques de calcul d'e-liquide
│   ├── app.js                 # Logique JS principale de l'application
│   ├── index.html             # Point d'entrée PWA principal
│   ├── test_runner.html       # Interface d'exécution des tests unitaires
│   ├── tests.js               # Cas de tests physiques et mathématiques
│   ├── tailwind.config.js     # Fichier de configuration de Tailwind CSS
│   └── JE-DIY.apk             # Fichier APK source officiel compilé
├── docs/                      # 🚀 [GÉNÉRÉ] Build final pour la version Web (GitHub Pages)
├── www/                       # 📱 [GÉNÉRÉ] Build final pour la version Android (Capacitor)
├── android/                   # 🤖 Projet natif Android Studio (géré par Capacitor)
├── electron/                  # 💻 Wrapper Desktop Windows
│   ├── dist/                  # Exécutable final et outils d'archivage
│   │   ├── Je-DIY_portable.exe # [GÉNÉRÉ - Ignoré par Git] Exécutable portable final
│   │   ├── split-archive.bat  # Découpe le gros .exe en morceaux de 10 Mo pour Git
│   │   └── rebuild-archive.bat # Reconstitue le .exe à partir des morceaux
│   ├── build-app.js           # Script de packaging et compilation .NET du launcher
│   ├── build-ico.js           # Générateur d'icônes .ico pour le lanceur
│   ├── launcher.cs            # Code source C# du lanceur portable .NET
│   └── main.js                # Code de démarrage Electron
├── build-all.bat              # ⚡ Script batch tout-en-un à la racine
├── build.js                   # 🔧 Compilateur local (copie /src vers /www et /docs)
└── generate-icons.js          # 🎨 Assistant de génération des icônes Android
```

---

## ⚙️ Workflows de Build et Commandes

### 1. Build Web Local (PWA)
Pour compiler localement le code source de `/src` vers `/www` (Android) et `/docs` (Web) :
```bash
npm run build
# Équivaut à lancer : node build.js
```

### 2. Build Android (APK)
Pour mettre à jour et compiler l'application Android :
```bash
# Synchronise le dossier www/ avec le projet Android
npm run cap-sync

# Lance la compilation de l'APK de debug (nécessite Gradle et JDK installés)
npm run build-apk
```

### 3. Build Windows (Electron portable)
Pour générer l'exécutable portable Windows :
```bash
cd electron
npm run package
# Équivaut à lancer : node build-ico.js && node build-app.js
```

### 4. Build Général Tout-En-Un (build-all.bat)
Ce script interactif, situé à la racine, permet de lancer l'intégralité du processus de build en une seule fois :
1. Compiles les sources web vers `/www` et `/docs`.
2. Propose de synchroniser Capacitor et d'ouvrir Android Studio.
3. Compiles la version portable Windows Electron.
4. Propose de découper l'exécutable final en blocs de 10 Mo.

---

## ⚠️ Contraintes Techniques et Points de Vigilance (Pièges)

### 📌 Encodage des scripts batch (CMD Windows)
* **Problème** : Les accents (`é`, `à`, etc.) et le caractère esperluette (`&`) provoquent des plantages ou des fermetures soudaines et invisibles du terminal Windows (CMD).
* **Règle** : Les fichiers `.bat` (comme `build-all.bat`) doivent être encodés en **Pure ASCII**. Il ne faut utiliser aucun accent et remplacer les caractères spéciaux (par exemple, utiliser `et` à la place de `&`).

### 📌 Verrous de fichiers Windows (Erreur `EPERM`)
* **Problème** : Lors de la recompilation Electron, l'antivirus Windows Defender ou les processus d'indexation système verrouillent le dossier temporaire de packaging, provoquant des erreurs de permissions fatales.
* **Solution** : Le script `electron/build-app.js` génère les packages temporaires dans un dossier suffixé par un timestamp unique (ex: `Je-DIY-win32-x64-[Date]`), éliminant tout verrouillage résiduel.

### 📌 Limitation de taille de fichiers sur GitHub (100 Mo)
* **Problème** : L'exécutable `Je-DIY_portable.exe` pèse environ 109 Mo, ce qui dépasse la limite stricte de GitHub pour un commit direct (100 Mo).
* **Solution** : 
  * Le fichier `Je-DIY_portable.exe` est marqué comme **ignoré** dans `.gitignore`.
  * Pour le sauvegarder sur GitHub, utilisez le script `split-archive.bat` qui utilise 7-Zip (via le module auto-extractible local ou le système) pour découper l'exécutable en morceaux de 10 Mo nommés `Je-DIY_portable.7z.001`, `Je-DIY_portable.7z.002`, etc.
  * Ces blocs fragmentés sont versionnés et poussés sur GitHub.
  * Pour restaurer l'exécutable localement après un clone, il suffit d'exécuter `rebuild-archive.bat`.

### 📌 Règle d'exclusion globale APK dans `.gitignore`
* **Problème** : `.gitignore` exclut tous les fichiers `*.apk` par défaut. L'APK officiel du projet, localisé dans `/src/JE-DIY.apk` et copié dans `/docs/JE-DIY.apk`, serait ignoré par Git, cassant le téléchargement sur le site web de production.
* **Solution** : Des exceptions explicites ont été configurées dans `.gitignore` pour autoriser le suivi de ces deux fichiers :
  ```gitignore
  !src/JE-DIY.apk
  !docs/JE-DIY.apk
  ```

---

## 📝 Bonnes Pratiques de Codage

* **Pas de Framework lourd** : Ne pas ajouter de framework comme React, Vue ou Angular sans demande explicite. L'application doit rester légère et rapide.
* **Intégrité de la structure** : Aucun fichier source ne doit résider à la racine du projet. Tout le code opérationnel appartient à `/src`.
* **Synchronisation** : Dès qu'une modification est faite dans `/src`, le script de compilation (`build.js`) doit être exécuté pour propager les modifications à la fois dans `/www` (Android) et `/docs` (GitHub Pages).
