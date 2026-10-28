# visual-baseline

صور المرجع للفحص البصري (`.github/workflows/visual.yml`) — لا تُنشر على الموقع.
Baseline screenshots of the visual check (`.github/workflows/visual.yml`); GitHub Pages does not serve this branch.

- `current/`: صور المرجع الحالية · the current baselines (`<page>-<device>-<light|dark>-<ar|en>.png`, `info.json` = the commit they came from)
- `changes/<date>_<commit>_<run>/`: قبل/بعد/الفرق لكل تغيّر · before / after / diff of each detected change

اعتماد شكل جديد · Accept a new look: Actions → Visual → Run workflow → ✓ accept (or `gh workflow run visual.yml -f accept=true`).
