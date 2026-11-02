# Studyflow

Aplicație pentru planificarea studiului, realizată cu React, Vite, Flask și SQLite. Flask servește interfața React compilată și oferă un API JSON pentru sarcini, obiective și date de sinteză.

## Cerințe

- Python 3.10 sau mai nou
- Node.js 20.19+ sau 22.12+

## Pornire locală în PowerShell

Instalează pachetele React și compilează interfața:

```powershell
cd app/frontend
npm.cmd install
npm.cmd run build
cd ../..
```

Instalează Flask și pornește serverul:

```powershell
python -m pip install -r app/requirements.txt
python app/main.py
```

Deschide http://127.0.0.1:5000. La prima pornire, Flask creează baza SQLite `app/studyflow.sqlite3` și adaugă câteva sarcini și obiective demonstrative. Datele rămân pe acest calculator.

## Mod de dezvoltare React

Pornește Flask într-un terminal cu `python app/main.py`. În alt terminal rulează `cd app/frontend` apoi `npm.cmd run dev`. Vite redirecționează apelurile `/api` către Flask.

Programul și datele despre concentrare sunt demonstrative în această primă versiune. Sarcinile și obiectivele se salvează în SQLite și pot fi adăugate, completate, actualizate și șterse din aplicație.

## Star Analyzer

**Demo online: https://stellar-observatory-zeta.vercel.app**

Folderul `star-analyzer/` conține un proiect separat: Stellar Observatory, un analizor de stele într-o singură pagină (HTML, CSS și JavaScript, fără compilare). Calculează luminozitatea, spectrul Planck, clasa spectrală și evoluția stelelor și le afișează în 3D cu WebGL. Instrucțiunile de pornire sunt în [star-analyzer/README.md](star-analyzer/README.md).
