// SetupForge — configurateur de PC et de setup, gratuit et hors ligne.
// Un seul exécutable : il sert l'interface embarquée sur 127.0.0.1 et
// l'ouvre dans une fenêtre d'application (Edge/Chrome) ou le navigateur par défaut.
package main

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

//go:embed web
var webFS embed.FS

const (
	appName     = "SetupForge"
	defaultPort = 47615
	signature   = "setupforge-1"
	maxStore    = 8 << 20
)

var (
	mu       sync.Mutex
	lastPing = time.Now().Add(45 * time.Second) // délai de grâce au démarrage
	byeAt    time.Time
	dataDir  string
)

func main() {
	dataDir = configDir()
	_ = os.MkdirAll(dataDir, 0o755)

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", defaultPort))
	if err != nil {
		// Déjà lancé ? On rouvre simplement la fenêtre sur l'instance existante.
		if alreadyRunning(defaultPort) {
			openUI(fmt.Sprintf("http://127.0.0.1:%d/", defaultPort))
			return
		}
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			fmt.Fprintln(os.Stderr, "impossible d'ouvrir un port local :", err)
			os.Exit(1)
		}
	}
	port := ln.Addr().(*net.TCPAddr).Port
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)

	sub, _ := fs.Sub(webFS, "web")
	static := http.FileServer(http.FS(sub))
	mux := http.NewServeMux()
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		lastPing, byeAt = time.Now(), time.Time{}
		mu.Unlock()
		io.WriteString(w, signature)
	})
	mux.HandleFunc("/api/bye", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		byeAt = time.Now()
		mu.Unlock()
	})
	mux.HandleFunc("/api/store", handleStore)
	mux.HandleFunc("/data/", func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/data/")
		if !strings.HasSuffix(name, ".json") || strings.ContainsAny(name, "/\\") {
			http.NotFound(w, r)
			return
		}
		b, err := webFS.ReadFile("web/data/" + name + ".gz")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Cache-Control", "max-age=86400")
		w.Write(b)
	})
	mux.Handle("/", static)

	srv := &http.Server{Handler: guard(mux, port), ReadHeaderTimeout: 10 * time.Second}
	go srv.Serve(ln)

	fmt.Println(appName, "→", url)
	if os.Getenv("SETUPFORGE_NOBROWSER") == "" {
		openUI(url)
	} else {
		mu.Lock()
		lastPing = time.Now().Add(24 * time.Hour)
		mu.Unlock()
	}

	// L'app se ferme toute seule quand la fenêtre est fermée.
	for {
		time.Sleep(time.Second)
		mu.Lock()
		idle := time.Since(lastPing)
		bye := !byeAt.IsZero() && time.Since(byeAt) > 4*time.Second
		mu.Unlock()
		if bye || idle > 150*time.Second {
			return
		}
	}
}

// guard refuse tout ce qui ne vient pas de la machine locale (anti DNS-rebinding / CSRF).
func guard(h http.Handler, port int) http.Handler {
	hosts := map[string]bool{
		fmt.Sprintf("127.0.0.1:%d", port): true,
		fmt.Sprintf("localhost:%d", port): true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hosts[r.Host] {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if o := r.Header.Get("Origin"); o != "" && !hosts[strings.TrimPrefix(o, "http://")] {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		h.ServeHTTP(w, r)
	})
}

func storePath() string { return filepath.Join(dataDir, "store.json") }

func handleStore(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		b, err := os.ReadFile(storePath())
		if err != nil {
			b = []byte("{}")
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(b)
	case http.MethodPut:
		b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxStore))
		if err != nil || len(b) == 0 || b[0] != '{' {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		tmp := storePath() + ".tmp"
		if err := os.WriteFile(tmp, b, 0o644); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := os.Rename(tmp, storePath()); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func configDir() string {
	if d := os.Getenv("SETUPFORGE_DATA"); d != "" {
		return d
	}
	base, err := os.UserConfigDir()
	if err != nil {
		base = "."
	}
	return filepath.Join(base, appName)
}

func alreadyRunning(port int) bool {
	c := http.Client{Timeout: 2 * time.Second}
	resp, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/api/ping", port))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 64))
	return string(b) == signature
}

// openUI ouvre une fenêtre « application » sans barre d'adresse si Edge ou Chrome
// est présent, sinon le navigateur par défaut.
func openUI(url string) {
	if runtime.GOOS == "windows" {
		var cands []string
		for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LocalAppData"} {
			if base := os.Getenv(env); base != "" {
				cands = append(cands,
					filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
					filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
			}
		}
		for _, exe := range cands {
			if _, err := os.Stat(exe); err == nil {
				cmd := exec.Command(exe, "--app="+url, "--user-data-dir="+filepath.Join(dataDir, "fenetre"),
					"--window-size=1440,900", "--no-first-run", "--no-default-browser-check")
				if cmd.Start() == nil {
					go cmd.Wait()
					return
				}
			}
		}
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
		return
	}
	if runtime.GOOS == "darwin" {
		exec.Command("open", url).Start()
		return
	}
	exec.Command("xdg-open", url).Start()
}
