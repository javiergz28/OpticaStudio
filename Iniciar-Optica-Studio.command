#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=========================================="
echo "   Óptica Studio — Lanzador para macOS"
echo "=========================================="
echo ""

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "No se detectó Node.js en tu Mac."
  echo "Instálalo desde https://nodejs.org/es (versión LTS)"
  echo "o con Homebrew: brew install node"
  echo ""
  read -p "Presiona Enter para cerrar..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias por primera vez..."
  npm install
  echo ""
fi

echo "Abriendo Óptica Studio en http://localhost:3000 ..."
(sleep 2 && open "http://localhost:3000") &

npm run dev
