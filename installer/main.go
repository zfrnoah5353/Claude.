// Installer-sur-mon-PC.exe
// À lancer sur le PC que l'on veut voir, contrôler et allumer à distance.
// Il demande les droits administrateur puis exécute setup.ps1 (embarqué).
package main

import (
	"bufio"
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

//go:embed setup.ps1
var script []byte

func isAdmin() bool {
	f, err := os.Open(`\\.\PHYSICALDRIVE0`)
	if err != nil {
		return false
	}
	f.Close()
	return true
}

func pause() {
	fmt.Print("\n  Appuie sur Entrée pour fermer...")
	bufio.NewReader(os.Stdin).ReadString('\n')
}

func main() {
	exe, err := os.Executable()
	if err != nil {
		fmt.Println("Erreur :", err)
		pause()
		return
	}

	if !isAdmin() {
		fmt.Println("  Demande des droits administrateur... (clique sur Oui)")
		ps := fmt.Sprintf("Start-Process -FilePath '%s' -Verb RunAs", strings.ReplaceAll(exe, "'", "''"))
		if err := exec.Command("powershell", "-NoProfile", "-Command", ps).Run(); err != nil {
			fmt.Println("  Droits administrateur refusés : l'installation a besoin de ces droits.")
			pause()
		}
		return
	}

	tmp := filepath.Join(os.TempDir(), "pc-distance-setup.ps1")
	// BOM UTF-8 : Windows PowerShell 5.1 lit alors correctement les accents.
	data := append([]byte{0xEF, 0xBB, 0xBF}, script...)
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		fmt.Println("Erreur d'écriture :", err)
		pause()
		return
	}
	defer os.Remove(tmp)

	cmd := exec.Command("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
		"-File", tmp, "-ExeDir", filepath.Dir(exe))
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Println("\n  L'installation s'est arrêtée :", err)
	}
	pause()
}
