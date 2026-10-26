#!/usr/bin/env bash
# Ejecutar desde una terminal con acceso a api.github.com.
set -euo pipefail
cd "$(dirname "$0")/.."
repo_name=ypf-health-monitor
if ! gh api user --jq .login >/dev/null; then
  echo 'No se pudo acceder a GitHub. Comprobá conexión y gh auth status desde tu terminal.' >&2
  exit 1
fi
login=$(gh api user --jq .login)
user_id=$(gh api user --jq .id)
repository="$login/$repo_name"
if git remote get-url origin >/dev/null 2>&1; then
  echo 'Ya existe origin. No se cambiará ni se publicará sobre un repositorio existente automáticamente.' >&2
  git remote get-url origin
  exit 1
fi
if gh repo view "$repository" --json name >/dev/null 2>&1; then
  echo "El repositorio $repository ya existe. Configurá origin explícitamente antes de subir." >&2
  exit 1
fi
node tests/health.test.js
node tests/crawl.test.js
node tests/demo.test.js
npm run demo
git add .github .gitignore README.md config.json package.json package-lock.json src tests web scripts
git -c user.name="$login" -c user.email="$user_id+$login@users.noreply.github.com" commit -m 'Crear monitor YPF con dashboard, demo y GitHub Actions'
gh repo create "$repository" --public --source=. --remote=origin --push --description 'Prototipo de monitoreo web con Playwright, BFS/DFS, histórico JSON y dashboard de salud'
gh api --method POST "repos/$repository/pages" -f build_type=workflow >/dev/null
# La rama main se publica con CI y un recorrido inicial de hasta 3 páginas.
# La demo no consulta YPF ni escribe el histórico real.
if ! gh workflow run monitor.yml --repo "$repository" --ref main -f mode=demo -f strategy=bfs -f max_pages=3; then
  echo "Repositorio creado. Cuando GitHub registre el workflow, ejecutá: gh workflow run monitor.yml --repo $repository --ref main -f mode=demo -f strategy=bfs -f max_pages=3" >&2
  exit 1
fi
printf 'Repositorio: https://github.com/%s\nActions: https://github.com/%s/actions\nPages (al completar deploy): https://%s.github.io/%s/\n' "$repository" "$repository" "$login" "$repo_name"
