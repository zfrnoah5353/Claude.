#!/data/data/com.termux/files/usr/bin/bash
# Installe MonBot sur un téléphone Android (application Termux).
# Utilisation : bash installer-telephone.sh   (le fichier monbot.tar.gz doit être dans Download)
set -e
[ -d "$HOME/storage" ] || { termux-setup-storage; sleep 8; }
ARCHIVE="$(find "$HOME/storage/shared/Download" -maxdepth 3 -name 'monbot*.tar.gz' 2>/dev/null | head -1)"
if [ ! -f "$ARCHIVE" ]; then echo "❌ Fichier monbot.tar.gz introuvable dans Téléchargements."; exit 1; fi

echo "📦 Installation de Node.js et ffmpeg (quelques minutes)…"
pkg update -y >/dev/null 2>&1 || true
pkg install -y nodejs ffmpeg termux-api >/dev/null 2>&1 || pkg install -y nodejs ffmpeg

echo "📂 Copie du bot…"
mkdir -p "$HOME/monbot"
tar -xzf "$ARCHIVE" -C "$HOME/monbot"
cd "$HOME/monbot"
echo "📥 Installation des modules du bot…"
npm install --no-audit --no-fund || npm install --no-audit --no-fund --ignore-scripts

# Script de lancement : tourne en boucle (relance si plantage) et garde le téléphone éveillé
cat > "$HOME/monbot/demarrer.sh" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null
cd "$HOME/monbot"
pkill -f "node .*src/index.js" 2>/dev/null
while true; do
  node --env-file=.env --no-warnings src/index.js >> bot.log 2>&1
  echo "Redémarrage dans 5 s" >> bot.log
  sleep 5
done
EOF
chmod +x "$HOME/monbot/demarrer.sh"

# Démarrage automatique quand le téléphone s'allume (application Termux:Boot)
mkdir -p "$HOME/.termux/boot"
printf '#!/data/data/com.termux/files/usr/bin/bash\nnohup "$HOME/monbot/demarrer.sh" >/dev/null 2>&1 &\n' > "$HOME/.termux/boot/monbot.sh"
chmod +x "$HOME/.termux/boot/monbot.sh"

# Raccourcis faciles
grep -q "alias bot-start" "$HOME/.bashrc" 2>/dev/null || cat >> "$HOME/.bashrc" <<'EOF'
alias bot-start='nohup ~/monbot/demarrer.sh >/dev/null 2>&1 & echo "Bot lancé"'
alias bot-stop='pkill -f demarrer.sh; pkill -f "src/index.js"; termux-wake-unlock; echo "Bot arrêté"'
alias bot-log='tail -n 30 ~/monbot/bot.log'
EOF

nohup "$HOME/monbot/demarrer.sh" >/dev/null 2>&1 &
sleep 20
tail -n 5 "$HOME/monbot/bot.log"
echo ""
echo "✅ MonBot tourne sur ton téléphone !"
echo "   Panel : ouvre Chrome sur http://localhost:3000"
echo "   Commandes : bot-start · bot-stop · bot-log"
