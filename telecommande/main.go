// Telecommande.exe
// À lancer sur l'appareil depuis lequel on veut allumer / contrôler son PC.
// Lit allumage.cfg (créé par Installer-sur-mon-PC.exe) placé à côté de l'exe.
//
// Usage sans menu (pour des raccourcis) :
//
//	Telecommande.exe allumer
//	Telecommande.exe controler
//	Telecommande.exe tout        (allume, attend, puis prend le contrôle)
package main

import (
	"bufio"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const rustdeskFallback = "https://github.com/rustdesk/rustdesk/releases/download/1.4.4/rustdesk-1.4.4-x86_64.exe"

type config struct {
	Nom     string
	MAC     string
	Adresse string
	Port    int
	ID      string
}

// Un seul lecteur du clavier : toutes les saisies passent par ce canal.
var lines = make(chan string)

func init() {
	go func() {
		r := bufio.NewReader(os.Stdin)
		for {
			s, err := r.ReadString('\n')
			if s != "" || err == nil {
				lines <- s
			}
			if err != nil {
				close(lines)
				return
			}
		}
	}()
}

func readLine() string {
	s, ok := <-lines
	if !ok {
		os.Exit(0)
	}
	return s
}

func ask(q, def string) string {
	if def != "" {
		fmt.Printf("  %s [%s] : ", q, def)
	} else {
		fmt.Printf("  %s : ", q)
	}
	s := strings.TrimSpace(readLine())
	if s == "" {
		return def
	}
	return s
}

func pause() {
	fmt.Print("\n  Appuie sur Entrée pour continuer...")
	readLine()
}

// ---------------------------------------------------------------- config

func cfgPath() string {
	exe, err := os.Executable()
	if err != nil {
		return "allumage.cfg"
	}
	return filepath.Join(filepath.Dir(exe), "allumage.cfg")
}

func loadConfig(path string) (config, error) {
	c := config{Port: 9}
	data, err := os.ReadFile(path)
	if err != nil {
		return c, err
	}
	text := strings.TrimPrefix(string(data), "\uFEFF")
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		v = strings.TrimSpace(v)
		switch strings.ToLower(strings.TrimSpace(k)) {
		case "nom":
			c.Nom = v
		case "mac":
			c.MAC = v
		case "adresse":
			c.Adresse = v
		case "port":
			if p, err := strconv.Atoi(v); err == nil && p > 0 && p < 65536 {
				c.Port = p
			}
		case "id":
			c.ID = strings.ReplaceAll(v, " ", "")
		}
	}
	return c, nil
}

func saveConfig(path string, c config) error {
	s := fmt.Sprintf("# Fichier pour Telecommande.exe\nnom=%s\nmac=%s\nadresse=%s\nport=%d\nid=%s\n",
		c.Nom, c.MAC, c.Adresse, c.Port, c.ID)
	return os.WriteFile(path, []byte(s), 0o600)
}

func editConfig(c config) config {
	fmt.Println("\n  --- Configuration ---")
	fmt.Println("  (les infos sont dans PC-a-distance-INFOS.txt sur le bureau du PC)")
	c.Nom = ask("Nom du PC", orDefault(c.Nom, "MonPC"))
	for {
		c.MAC = ask("Adresse MAC (ex : AA-BB-CC-DD-EE-FF)", c.MAC)
		if _, err := parseMAC(c.MAC); err == nil {
			break
		}
		fmt.Println("  Adresse MAC invalide, recommence.")
	}
	c.Adresse = ask("IP publique ou nom DynDNS (vide = seulement à la maison)", c.Adresse)
	if p, err := strconv.Atoi(ask("Port", strconv.Itoa(c.Port))); err == nil && p > 0 && p < 65536 {
		c.Port = p
	}
	c.ID = strings.ReplaceAll(ask("ID RustDesk", c.ID), " ", "")
	return c
}

func orDefault(s, d string) string {
	if s == "" {
		return d
	}
	return s
}

// ---------------------------------------------------------------- Wake-on-LAN

func parseMAC(s string) ([]byte, error) {
	clean := strings.NewReplacer(":", "", "-", "", ".", "", " ", "").Replace(strings.TrimSpace(s))
	b, err := hex.DecodeString(clean)
	if err != nil || len(b) != 6 {
		return nil, errors.New("adresse MAC invalide")
	}
	return b, nil
}

func magicPacket(mac []byte) []byte {
	p := make([]byte, 0, 102)
	for i := 0; i < 6; i++ {
		p = append(p, 0xFF)
	}
	for i := 0; i < 16; i++ {
		p = append(p, mac...)
	}
	return p
}

// broadcastTargets : 255.255.255.255 + l'adresse de diffusion de chaque réseau local.
func broadcastTargets() []string {
	seen := map[string]bool{"255.255.255.255": true}
	out := []string{"255.255.255.255"}
	ifaces, _ := net.Interfaces()
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			ip4 := ipn.IP.To4()
			if ip4 == nil || len(ipn.Mask) != 4 {
				continue
			}
			b := make(net.IP, 4)
			for i := range b {
				b[i] = ip4[i] | ^ipn.Mask[i]
			}
			if s := b.String(); !seen[s] {
				seen[s] = true
				out = append(out, s)
			}
		}
	}
	return out
}

func sendUDP(addr string, pkt []byte) error {
	conn, err := net.DialTimeout("udp", addr, 5*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err := conn.Write(pkt); err != nil {
		return err
	}
	// 2 envois de plus par sécurité (UDP peut perdre un paquet) ;
	// leurs erreurs éventuelles (ICMP) n'annulent pas le premier envoi.
	for i := 0; i < 2; i++ {
		time.Sleep(100 * time.Millisecond)
		conn.Write(pkt)
	}
	return nil
}

func wake(c config) bool {
	mac, err := parseMAC(c.MAC)
	if err != nil {
		fmt.Println("  [ERREUR]", err, "- corrige la configuration (menu 4).")
		return false
	}
	pkt := magicPacket(mac)
	fmt.Printf("\n  Allumage de %s (%s)...\n", orDefault(c.Nom, "ton PC"), c.MAC)

	sent := 0
	for _, b := range broadcastTargets() {
		for _, port := range []int{9, 7} {
			if sendUDP(net.JoinHostPort(b, strconv.Itoa(port)), pkt) == nil {
				sent++
			}
		}
	}
	if sent > 0 {
		fmt.Println("  [OK] Signal envoyé sur le réseau local (si tu es à la maison).")
	}

	if c.Adresse != "" {
		addr := net.JoinHostPort(c.Adresse, strconv.Itoa(c.Port))
		if err := sendUDP(addr, pkt); err != nil {
			fmt.Println("  [!] Envoi par internet impossible :", err)
		} else {
			fmt.Printf("  [OK] Signal envoyé par internet vers %s.\n", addr)
			sent++
		}
	} else {
		fmt.Println("  [i] Pas d'adresse internet configurée : allumage seulement depuis la maison.")
	}

	if sent == 0 {
		fmt.Println("  [ERREUR] Aucun signal n'a pu être envoyé. Vérifie ta connexion.")
		return false
	}
	fmt.Println("  Le PC devrait démarrer d'ici 30 à 60 secondes.")
	return true
}

// ---------------------------------------------------------------- RustDesk

func rustdeskPath() string {
	if runtime.GOOS != "windows" {
		if p, err := exec.LookPath("rustdesk"); err == nil {
			return p
		}
		return ""
	}
	cands := []string{
		filepath.Join(os.Getenv("ProgramFiles"), "RustDesk", "rustdesk.exe"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "TelecommandePC", "rustdesk.exe"),
	}
	for _, p := range cands {
		if st, err := os.Stat(p); err == nil && st.Size() > 1<<20 {
			return p
		}
	}
	return ""
}

func latestRustdeskURL() string {
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/rustdesk/rustdesk/releases/latest", nil)
	req.Header.Set("User-Agent", "TelecommandePC")
	cl := &http.Client{Timeout: 20 * time.Second}
	resp, err := cl.Do(req)
	if err != nil {
		return rustdeskFallback
	}
	defer resp.Body.Close()
	var rel struct {
		Assets []struct {
			Name string `json:"name"`
			URL  string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if resp.StatusCode != 200 || json.NewDecoder(resp.Body).Decode(&rel) != nil {
		return rustdeskFallback
	}
	re := regexp.MustCompile(`^rustdesk-[\d.]+-x86_64\.exe$`)
	for _, a := range rel.Assets {
		if re.MatchString(a.Name) {
			return a.URL
		}
	}
	return rustdeskFallback
}

type progress struct {
	total, done int64
	last        time.Time
}

func (p *progress) Write(b []byte) (int, error) {
	p.done += int64(len(b))
	if time.Since(p.last) > 300*time.Millisecond {
		p.last = time.Now()
		if p.total > 0 {
			fmt.Printf("\r  Téléchargement de RustDesk : %3d %%", p.done*100/p.total)
		} else {
			fmt.Printf("\r  Téléchargement de RustDesk : %d Mo", p.done>>20)
		}
	}
	return len(b), nil
}

func downloadRustdesk() (string, error) {
	if runtime.GOOS != "windows" {
		return "", errors.New("installe RustDesk depuis https://rustdesk.com")
	}
	dir := filepath.Join(os.Getenv("LOCALAPPDATA"), "TelecommandePC")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	dst := filepath.Join(dir, "rustdesk.exe")
	url := latestRustdeskURL()
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("téléchargement refusé (%s)", resp.Status)
	}
	tmp := dst + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	_, err = io.Copy(f, io.TeeReader(resp.Body, &progress{total: resp.ContentLength}))
	f.Close()
	fmt.Println()
	if err != nil {
		os.Remove(tmp)
		return "", err
	}
	return dst, os.Rename(tmp, dst)
}

func control(c config) bool {
	if c.ID == "" {
		fmt.Println("  [ERREUR] ID RustDesk manquant : corrige la configuration (menu 4).")
		return false
	}
	p := rustdeskPath()
	if p == "" {
		fmt.Println("\n  RustDesk n'est pas encore sur cet appareil, téléchargement (une seule fois)...")
		var err error
		if p, err = downloadRustdesk(); err != nil {
			fmt.Println("  [ERREUR]", err)
			return false
		}
	}
	fmt.Printf("\n  Connexion à %s (ID %s)...\n", orDefault(c.Nom, "ton PC"), c.ID)
	fmt.Println("  Tape le mot de passe dans la fenêtre RustDesk (coche \"Se souvenir\").")
	if err := exec.Command(p, "--connect", c.ID).Start(); err != nil {
		fmt.Println("  [ERREUR] Impossible de lancer RustDesk :", err)
		return false
	}
	return true
}

// interactive = la touche Entrée raccourcit l'attente.
func wakeThenControl(c config, interactive bool) {
	if !wake(c) {
		return
	}
	for i := 60; i > 0; i-- {
		if interactive {
			fmt.Printf("\r  Démarrage du PC... connexion dans %2d s (Entrée = maintenant) ", i)
			select {
			case <-lines:
				i = 0
			case <-time.After(time.Second):
			}
		} else {
			fmt.Printf("\r  Démarrage du PC... connexion dans %2d s ", i)
			time.Sleep(time.Second)
		}
	}
	fmt.Println()
	control(c)
}

// ---------------------------------------------------------------- main

func main() {
	path := cfgPath()
	c, err := loadConfig(path)
	firstRun := err != nil || c.MAC == ""

	if len(os.Args) > 1 {
		if firstRun {
			fmt.Println("  allumage.cfg introuvable à côté de Telecommande.exe.")
			pause()
			os.Exit(1)
		}
		switch strings.ToLower(os.Args[1]) {
		case "allumer", "wake":
			wake(c)
		case "controler", "contrôler", "control":
			control(c)
		case "tout", "all":
			wakeThenControl(c, false)
		default:
			fmt.Println("  Arguments possibles : allumer | controler | tout")
		}
		time.Sleep(3 * time.Second)
		return
	}

	fmt.Println()
	fmt.Println("  ==========================================")
	fmt.Println("     TÉLÉCOMMANDE PC")
	fmt.Println("  ==========================================")

	if firstRun {
		fmt.Println("\n  Pas de fichier allumage.cfg à côté de ce programme.")
		fmt.Println("  Copie celui du bureau de ton PC ici, ou remplis les infos :")
		c = editConfig(c)
		if err := saveConfig(path, c); err != nil {
			fmt.Println("  [!] Impossible d'enregistrer :", err)
		}
	}

	for {
		fmt.Printf("\n  PC : %s   MAC : %s   ID : %s\n", orDefault(c.Nom, "?"), c.MAC, orDefault(c.ID, "?"))
		fmt.Println()
		fmt.Println("   1. Allumer le PC")
		fmt.Println("   2. Voir et contrôler le PC")
		fmt.Println("   3. Allumer PUIS contrôler")
		fmt.Println("   4. Modifier la configuration")
		fmt.Println("   0. Quitter")
		switch ask("Ton choix", "") {
		case "1":
			wake(c)
			pause()
		case "2":
			control(c)
			pause()
		case "3":
			wakeThenControl(c, true)
			pause()
		case "4":
			c = editConfig(c)
			if err := saveConfig(path, c); err != nil {
				fmt.Println("  [!] Impossible d'enregistrer :", err)
			} else {
				fmt.Println("  [OK] Configuration enregistrée.")
			}
		case "0", "q", "Q":
			return
		}
	}
}
