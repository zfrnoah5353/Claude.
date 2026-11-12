// Installeur en un clic : Blender + uv + connecteur "MCP for Blender" pour Claude Desktop.
// Après ça, Claude construit les modèles 3D en direct dans la fenêtre Blender.
package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"syscall"
)

func step(n int, msg string) { fmt.Printf("\n[%d/5] %s\n", n, msg) }

func run(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout, cmd.Stderr, cmd.Stdin = os.Stdout, os.Stderr, os.Stdin
	return cmd.Run()
}

func exists(p string) bool { _, err := os.Stat(p); return err == nil }

func firstGlob(patterns ...string) string {
	for _, p := range patterns {
		m, _ := filepath.Glob(p)
		if len(m) > 0 {
			sort.Strings(m)
			return m[len(m)-1] // la version la plus récente
		}
	}
	return ""
}

func findBlender() string {
	if p, err := exec.LookPath("blender"); err == nil {
		return p
	}
	return firstGlob(
		filepath.Join(os.Getenv("ProgramFiles"), "Blender Foundation", "Blender*", "blender.exe"),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "Steam", "steamapps", "common", "Blender", "blender.exe"),
	)
}

func findUvx() string {
	if p, err := exec.LookPath("uvx"); err == nil {
		return p
	}
	return firstGlob(
		filepath.Join(os.Getenv("USERPROFILE"), ".local", "bin", "uvx.exe"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "WinGet", "Links", "uvx.exe"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "WinGet", "Packages", "astral-sh.uv*", "uvx.exe"),
	)
}

func claudeInstalled() bool {
	return exists(filepath.Join(os.Getenv("LOCALAPPDATA"), "AnthropicClaude")) ||
		exists(filepath.Join(os.Getenv("APPDATA"), "Claude")) ||
		firstGlob(filepath.Join(os.Getenv("LOCALAPPDATA"), "Packages", "Claude_*")) != ""
}

func winget(id string) error {
	if _, err := exec.LookPath("winget"); err != nil {
		return fmt.Errorf("winget est introuvable sur ce PC")
	}
	return run("winget", "install", "-e", "--id", id,
		"--accept-source-agreements", "--accept-package-agreements")
}

func finish(code int) {
	fmt.Print("\nAppuie sur Entrée pour fermer...")
	bufio.NewReader(os.Stdin).ReadString('\n')
	os.Exit(code)
}

func main() {
	// Console en UTF-8 pour afficher les accents correctement.
	syscall.NewLazyDLL("kernel32.dll").NewProc("SetConsoleOutputCP").Call(65001)

	fmt.Println("=== Claude + Blender : construction 3D en direct ===")

	step(1, "Blender")
	blender := findBlender()
	if blender == "" {
		fmt.Println("Blender n'est pas installé, installation...")
		if err := winget("BlenderFoundation.Blender"); err != nil {
			fmt.Println("Installation automatique impossible :", err)
			fmt.Println("Installe Blender depuis https://www.blender.org/download/ puis relance ce programme.")
			finish(1)
		}
		blender = findBlender()
	}
	fmt.Println("OK :", blender)

	step(2, "Claude Desktop")
	if claudeInstalled() {
		fmt.Println("OK : déjà installé")
	} else {
		fmt.Println("Claude Desktop n'est pas installé, installation...")
		if err := winget("Anthropic.Claude"); err != nil {
			fmt.Println("Installation automatique impossible :", err)
			fmt.Println("Installe-le depuis https://claude.ai/download, ouvre-le une fois, puis relance ce programme.")
			finish(1)
		}
	}

	step(3, "uv (lance le connecteur)")
	uvx := findUvx()
	if uvx == "" {
		if err := winget("astral-sh.uv"); err != nil {
			fmt.Println("winget a échoué, essai avec l'installeur officiel de uv...")
			run("powershell", "-ExecutionPolicy", "ByPass", "-NoProfile", "-Command",
				"irm https://astral.sh/uv/install.ps1 | iex")
		}
		uvx = findUvx()
	}
	if uvx == "" {
		fmt.Println("uv est installé mais introuvable pour l'instant : ferme cette fenêtre et relance ce programme.")
		finish(1)
	}
	fmt.Println("OK :", uvx)

	step(4, "Connecteur MCP for Blender (addon Blender + config de Claude)")
	if err := run(uvx, "mcp-for-blender", "setup", "--yes"); err != nil {
		fmt.Println("La configuration a échoué :", err)
		finish(1)
	}

	step(5, "Ouverture de Blender")
	if blender != "" {
		if err := exec.Command(blender).Start(); err != nil {
			fmt.Println("Impossible d'ouvrir Blender automatiquement, ouvre-le à la main.")
		}
	} else {
		fmt.Println("Ouvre Blender à la main.")
	}

	fmt.Println("\n=== Terminé ===")
	fmt.Println("1. Quitte Claude complètement (clic droit sur l'icône près de l'horloge > Quitter), puis rouvre-le.")
	fmt.Println("2. Laisse Blender ouvert.")
	fmt.Println("3. Dans Claude Desktop, demande par exemple : « Construis une voiture de sport dans Blender ».")
	finish(0)
}
