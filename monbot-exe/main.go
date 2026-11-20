// MonBot.exe : ouvre le panel du bot Discord MonBot dans une fenêtre Windows.
// Le bot sert lui-même le panel à son adresse (localhost:3000 ou tunnel trycloudflare).
package main

import (
	_ "embed"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	webview2 "github.com/jchv/go-webview2"
)

//go:embed home.html
var homeHTML string

type config struct {
	Addr string `json:"addr"`
}

var (
	dir string
	cfg config
)

func js(v string) string { b, _ := json.Marshal(v); return string(b) }

func cfgPath() string { return filepath.Join(dir, "config.json") }

func load() {
	b, err := os.ReadFile(cfgPath())
	if err == nil {
		_ = json.Unmarshal(b, &cfg)
	}
}

func save() {
	b, _ := json.MarshalIndent(cfg, "", "  ")
	_ = os.WriteFile(cfgPath(), b, 0o600)
}

// normalize ajoute http:// ou https:// et enlève les espaces / la barre finale.
func normalize(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimRight(s, "/")
	if s == "" {
		return s
	}
	if !strings.Contains(s, "://") {
		low := strings.ToLower(s)
		if strings.HasPrefix(low, "localhost") || strings.HasPrefix(low, "127.") || strings.HasPrefix(low, "192.168.") || strings.HasPrefix(low, "10.") {
			s = "http://" + s
		} else {
			s = "https://" + s
		}
	}
	return s
}

func reachable(addr string, timeout time.Duration) error {
	c := http.Client{Timeout: timeout}
	r, err := c.Get(addr)
	if err != nil {
		return err
	}
	r.Body.Close()
	return nil
}

func main() {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	dir = filepath.Join(base, "MonBot")
	_ = os.MkdirAll(dir, 0o700)
	load()

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  filepath.Join(dir, "webview"),
		WindowOptions: webview2.WindowOptions{
			Title: "MonBot", Width: 1280, Height: 820, IconId: 1, Center: true,
		},
	})
	if w == nil {
		msgBox("MonBot", "Impossible d'ouvrir la fenêtre.\n\nInstalle « Microsoft Edge WebView2 Runtime » (gratuit, sur le site de Microsoft) puis relance MonBot.")
		return
	}
	defer w.Destroy()

	home := func() { w.SetHtml(homeHTML) }

	// Les vérifications réseau tournent en arrière-plan pour ne pas figer la fenêtre ;
	// le résultat revient à la page par window.onResult(message, état).
	reply := func(text, kind string) {
		w.Dispatch(func() { w.Eval("window.onResult && window.onResult(" + js(text) + "," + js(kind) + ")") })
	}
	open := func(addr string) {
		cfg.Addr = addr
		save()
		w.Dispatch(func() { w.Navigate(addr) })
	}

	_ = w.Bind("saved", func() string { return cfg.Addr })
	_ = w.Bind("connect", func(raw string) {
		addr := normalize(raw)
		u, err := url.Parse(addr)
		if err != nil || u.Host == "" {
			reply("Adresse invalide.", "err")
			return
		}
		go func() {
			if err := reachable(addr, 8*time.Second); err != nil {
				if strings.Contains(addr, "localhost") || strings.Contains(addr, "127.0.0.1") {
					reply("Le bot ne répond pas sur ce PC. Il est bien lancé ?", "err")
				} else {
					reply("Le bot ne répond pas à cette adresse. Elle a peut-être changé : regarde le dernier MP de MonBot.", "err")
				}
				return
			}
			reply("Connecté ✓", "ok")
			open(addr)
		}()
	})
	// Au premier affichage : adresse retenue, sinon le bot sur ce PC.
	started := false
	_ = w.Bind("autostart", func() {
		if started {
			return
		}
		started = true
		go func() {
			if cfg.Addr != "" {
				reply("Connexion à l'adresse retenue…", "")
				if reachable(cfg.Addr, 5*time.Second) == nil {
					open(cfg.Addr)
					return
				}
				reply("Le bot ne répond pas à l'adresse retenue. Si elle a changé, colle la nouvelle (dernier MP de MonBot).", "err")
				return
			}
			if reachable("http://localhost:3000", 2*time.Second) == nil {
				open("http://localhost:3000")
			}
		}()
	})
	_ = w.Bind("monbotHome", func() { w.Dispatch(home) })
	// F2 partout (y compris dans le panel) : revenir à l'écran d'adresse.
	w.Init(`window.addEventListener('keydown', function (e) {
		if (e.key === 'F2') { e.preventDefault(); if (window.monbotHome) window.monbotHome(); }
	}, true);`)

	home()
	w.Run()
}
