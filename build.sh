#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p dist
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o dist/Installer-sur-mon-PC.exe ./installer
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o dist/Telecommande.exe ./telecommande
ls -la dist
