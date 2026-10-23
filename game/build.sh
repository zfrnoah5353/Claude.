#!/bin/sh
# Compile Sweet Pets Factory pour Windows (.exe) depuis n'importe quel OS.
# Prérequis : Go 1.22+ (https://go.dev/dl/).
set -e
cd "$(dirname "$0")"
# Icône et infos de version du .exe (déjà générées dans rsrc_windows_amd64.syso) :
#   go run github.com/tc-hib/go-winres@v0.3.3 make --in winres/winres.json --arch amd64
mkdir -p ../dist
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H=windowsgui" -o ../dist/SweetPetsFactory.exe .
echo "OK : dist/SweetPetsFactory.exe"
