package main

import (
	"bytes"
	_ "embed"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log"
	"math"
	"math/rand"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"

	"github.com/hajimehoshi/ebiten/v2"
)

//go:embed assets/Fredoka.ttf
var fredokaTTF []byte

//go:embed assets/icon.png
var iconPNG []byte

const (
	ScreenW = 1280
	ScreenH = 720
	dt      = 1.0 / 60
)

type Scene int

const (
	SceneTitle Scene = iota
	ScenePlay
	SceneBoss
)

type PanelID int

const (
	PanelNone PanelID = iota
	PanelPets
	PanelIndex
	PanelShop
	PanelQuests
	PanelWorlds
	PanelGift
	PanelRebirth
	PanelSettings
)

type Toast struct {
	Text string
	T    float64
	Col  interface{}
}

type Popup struct {
	Title, Body string
	Btn         string
	OnOK        func()
	Cancel      bool
}

type Game struct {
	s     *Save
	scene Scene
	t     float64
	audio *Audio
	ui    UI
	rng   *rand.Rand

	// monde
	px, py       float64
	moving       bool
	mvx, mvy     float64
	walk         float64
	camX, camY   float64
	actors       []*PetActor
	piles        []*Pile
	orbs         []*Orb
	floats       []*Floater
	parts        []*Particle
	decor        []Decor
	spawnT       float64
	focus        *Pile
	combo        int
	comboT       float64
	nearEgg      *EggDef
	nearPortal   bool
	nearGate     bool
	autoHatch    *EggDef
	autoHatchT   float64
	shake        float64
	cps          float64
	cpsAcc       float64
	cpsT         float64
	cpsHist      []float64
	bossAvail    float64
	pickup       float64
	pickupT      float64
	tutorialStep int

	// interface
	panel  PanelID
	tab    int
	scroll float64
	selUID int64
	toasts []*Toast
	hatch  *HatchAnim
	popup  *Popup
	boss   *BossFight
	saveT  float64
	quit   bool
}

func newGame() *Game {
	s, loaded := loadSave()
	g := &Game{s: s, rng: rand.New(rand.NewSource(time.Now().UnixNano()))}
	if debugMode {
		debugSave(s)
	}
	if os.Getenv("SPF_NOAUDIO") != "1" {
		g.audio = newAudio(&g.s.Muted)
	}
	g.refreshDaily()
	g.enterWorld(s.World)
	if loaded && s.LastSeen > 0 {
		away := float64(time.Now().Unix() - s.LastSeen)
		if away > 120 {
			capped := math.Min(away, 8*3600)
			earn := math.Floor(g.estimatedCPS() * capped * 0.25)
			if earn > 0 {
				g.popup = &Popup{Title: "Bon retour !", Btn: "Récupérer",
					Body: "Pendant ton absence (" + fmtTime(capped) + "), tes pets ont récolté " + fmtNum(earn) + " pièces.",
					OnOK: func() { g.addCoins(earn, false) }}
			}
		}
	}
	return g
}

func main() {
	initFont()
	ebiten.SetWindowSize(ScreenW, ScreenH)
	ebiten.SetWindowTitle("Sweet Pets Factory")
	ebiten.SetWindowResizingMode(ebiten.WindowResizingModeEnabled)
	ebiten.SetWindowClosingHandled(true)
	if ic, err := png.Decode(bytes.NewReader(iconPNG)); err == nil {
		ebiten.SetWindowIcon([]image.Image{ic})
	}
	debugInit()
	g := newGame()
	err := ebiten.RunGame(g)
	debugStop()
	if err != nil && err != ebiten.Termination {
		g.s.write()
		// Sans périphérique audio, la bibliothèque de son arrête le jeu :
		// on relance alors le jeu en mode muet plutôt que de planter.
		if os.Getenv("SPF_NOAUDIO") != "1" && isAudioError(err) {
			if exe, e := os.Executable(); e == nil {
				cmd := exec.Command(exe, os.Args[1:]...)
				cmd.Env = append(os.Environ(), "SPF_NOAUDIO=1")
				cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
				if cmd.Start() == nil {
					return
				}
			}
		}
		log.Fatal(err)
	}
}

// Placement de l'écran logique 1280x720 dans la fenêtre réelle (bandes noires si besoin).
var (
	viewK          = 1.0
	viewOX, viewOY float64
	canvas         *ebiten.Image
)

func (g *Game) Layout(ow, oh int) (int, int) {
	dsf := ebiten.Monitor().DeviceScaleFactor()
	w, h := int(float64(ow)*dsf), int(float64(oh)*dsf)
	if w < 1 || h < 1 {
		w, h = ScreenW, ScreenH
	}
	viewK = math.Min(float64(w)/ScreenW, float64(h)/ScreenH)
	viewOX = (float64(w) - ScreenW*viewK) / 2
	viewOY = (float64(h) - ScreenH*viewK) / 2
	return w, h
}

var frameN int

var (
	debugMode         = os.Getenv("SPF_DEBUG") == "1"
	perfUpd, perfDraw float64
)

func (g *Game) Update() error {
	if debugMode {
		t0 := time.Now()
		defer func() { perfUpd = perfUpd*0.9 + float64(time.Since(t0).Microseconds())/1000*0.1 }()
	}
	g.t += dt
	g.debugUpdate()
	frameN++
	if debugMode && frameN%10 == 0 {
		fmt.Printf("t=%.1f fps=%.1f\n", g.t, ebiten.ActualFPS())
	}
	if ebiten.IsWindowBeingClosed() || g.quit {
		g.s.write()
		return ebiten.Termination
	}
	top := 0
	if g.panel != PanelNone {
		top = 1
	}
	if g.hatch != nil || g.popup != nil {
		top = 2
	}
	if g.scene == SceneTitle {
		top = 0
	}
	g.ui.begin(top)

	switch g.scene {
	case SceneTitle:
		g.updateTitle()
	case ScenePlay:
		g.updatePlay()
	case SceneBoss:
		g.updateBoss()
	}

	if g.scene != SceneTitle {
		g.updateCommon()
	}
	if g.ui.pointer {
		ebiten.SetCursorShape(ebiten.CursorShapePointer)
	} else {
		ebiten.SetCursorShape(ebiten.CursorShapeDefault)
	}
	return nil
}

func (g *Game) Draw(screen *ebiten.Image) {
	t0 := time.Now()
	// rendu suréchantillonné (au moins 2x) puis réduit à la taille de la fenêtre
	rs := math.Max(2, viewK)
	cw, ch := int(math.Ceil(ScreenW*rs)), int(math.Ceil(ScreenH*rs))
	if canvas == nil || canvas.Bounds().Dx() != cw || canvas.Bounds().Dy() != ch {
		if canvas != nil {
			canvas.Deallocate()
		}
		canvas = ebiten.NewImage(cw, ch)
	}
	S = rs
	switch g.scene {
	case SceneTitle:
		g.drawTitle(canvas)
	case ScenePlay:
		g.drawWorld(canvas)
	case SceneBoss:
		g.drawBoss(canvas)
	}
	g.ui.render(canvas)
	if debugMode {
		perfDraw = perfDraw*0.9 + float64(time.Since(t0).Microseconds())/1000*0.1
		txtB(canvas, fmt.Sprintf("FPS %.0f TPS %.0f upd %.2fms draw %.2fms", ebiten.ActualFPS(), ebiten.ActualTPS(), perfUpd, perfDraw), 640, 708, 14, red, AC)
	}
	S = 1
	screen.Fill(color.Black)
	op := &ebiten.DrawImageOptions{Filter: ebiten.FilterLinear}
	op.GeoM.Scale(viewK/rs, viewK/rs)
	op.GeoM.Translate(viewOX, viewOY)
	screen.DrawImage(canvas, op)
	g.debugDraw(screen)
}

// ---------- boucle commune ----------

func (g *Game) updateCommon() {
	s := g.s
	s.Stats.Play += dt
	for k, v := range s.Potions {
		if v > 0 {
			s.Potions[k] = v - dt
			if s.Potions[k] <= 0 {
				delete(s.Potions, k)
				g.toast("Une potion vient de se terminer", nil)
			}
		}
	}
	// Minuteur du boss
	if g.scene == ScenePlay {
		if g.bossAvail > 0 {
			g.bossAvail -= dt
			if g.bossAvail <= 0 {
				g.toast("Le Gummy Golem est reparti…", nil)
				s.BossTimer = 600
			}
		} else {
			s.BossTimer -= dt
			if s.BossTimer <= 0 {
				g.bossAvail = 120
				g.audio.play("boss", g.t)
				g.toast("Le Gummy Golem est apparu ! Va le combattre !", red)
			}
		}
	}
	// pièces par seconde (moyenne glissante sur 10 s)
	g.cpsT += dt
	if g.cpsT >= 1 {
		g.cpsT = 0
		g.cpsHist = append(g.cpsHist, g.cpsAcc)
		g.cpsAcc = 0
		if len(g.cpsHist) > 10 {
			g.cpsHist = g.cpsHist[1:]
		}
		sum := 0.0
		for _, v := range g.cpsHist {
			sum += v
		}
		g.cps = sum / float64(len(g.cpsHist))
	}
	for i := 0; i < len(g.toasts); i++ {
		g.toasts[i].T += dt
	}
	for len(g.toasts) > 0 && g.toasts[0].T > 3.2 {
		g.toasts = g.toasts[1:]
	}
	g.saveT += dt
	if g.saveT > 20 {
		g.saveT = 0
		g.s.write()
	}
	if g.s.DailyDay != today() {
		g.refreshDaily()
	}
}

func (g *Game) toast(text string, col interface{}) {
	g.toasts = append(g.toasts, &Toast{Text: text, Col: col})
	if len(g.toasts) > 4 {
		g.toasts = g.toasts[1:]
	}
}

// ---------- économie ----------

func (g *Game) petPower(p *OwnedPet) float64 {
	d := petDefs[p.Def]
	base := d.Power
	if p.Bonus > 0 {
		base = p.Bonus
	}
	m := 1.0
	switch p.Tier {
	case 1:
		m = 3
	case 2:
		m = 10
	}
	if p.Shiny {
		m *= 1.5
	}
	return base * m * (1 + 0.05*float64(p.Level))
}

func (g *Game) damageMult() float64 {
	m := 1 + 0.1*float64(g.s.Upgrades["power"])
	if g.s.Potions["dmg"] > 0 {
		m *= 2
	}
	return m
}

func (g *Game) coinMult() float64 {
	s := g.s
	m := rebirthMult(s.Rebirths) * (1 + 0.1*float64(s.Upgrades["coins"])) * (1 + 0.05*float64(s.IndexClaim))
	if s.Passes["coins2"] {
		m *= 2
	}
	if s.Potions["coins"] > 0 {
		m *= 2
	}
	return m
}

func (g *Game) luckMult() float64 {
	s := g.s
	m := 1 + 0.15*float64(s.Upgrades["luck"])
	if s.Passes["luck2"] {
		m *= 2
	}
	if s.Potions["luck"] > 0 {
		m *= 2
	}
	return m
}

func (g *Game) teamDPS() float64 {
	sum := 0.0
	for _, p := range g.s.Pets {
		if p.Equip {
			sum += g.petPower(p)
		}
	}
	return sum * g.damageMult()
}

func (g *Game) tapDamage() float64 {
	base := math.Max(3, g.teamDPS()*0.25)
	return base * (1 + 0.5*float64(g.s.Upgrades["tap"]))
}

func (g *Game) critChance() float64 { return 0.08 + 0.02*float64(g.s.Upgrades["crit"]) }

func (g *Game) coinPerHP() float64 { return 3 * worlds[g.s.World].CoinMult }

func (g *Game) estimatedCPS() float64 {
	return g.teamDPS() * g.coinPerHP() * g.coinMult() * 0.8
}

func (g *Game) addCoins(v float64, track bool) {
	g.s.Coins += v
	g.s.TotalCoins += v
	if track {
		g.cpsAcc += v
	}
}

func (g *Game) spend(cost float64, gems bool) bool {
	if gems {
		if g.s.Gems < cost {
			g.audio.play("error", g.t)
			g.toast("Pas assez de gemmes", nil)
			return false
		}
		g.s.Gems -= cost
	} else {
		if g.s.Coins < cost {
			g.audio.play("error", g.t)
			g.toast("Pas assez de pièces", nil)
			return false
		}
		g.s.Coins -= cost
	}
	g.audio.play("buy", g.t)
	return true
}

// ---------- pets ----------

func (g *Game) sortedPets() []*OwnedPet {
	ps := append([]*OwnedPet(nil), g.s.Pets...)
	sort.SliceStable(ps, func(i, j int) bool {
		if ps[i].Equip != ps[j].Equip {
			return ps[i].Equip
		}
		return g.petPower(ps[i]) > g.petPower(ps[j])
	})
	return ps
}

func (g *Game) equipBest() {
	ps := g.s.Pets
	sort.SliceStable(ps, func(i, j int) bool { return g.petPower(ps[i]) > g.petPower(ps[j]) })
	for i, p := range ps {
		p.Equip = i < g.s.slots()
	}
	g.syncActors()
}

func (g *Game) toggleEquip(p *OwnedPet) {
	if p.Equip {
		p.Equip = false
	} else {
		if g.s.equippedCount() >= g.s.slots() {
			g.toast("Tous tes emplacements sont pleins", nil)
			g.audio.play("error", g.t)
			return
		}
		p.Equip = true
	}
	g.syncActors()
}

// craftable renvoie les pets identiques non équipés/verrouillés utilisables pour une fusion.
func (g *Game) craftGroup(p *OwnedPet) []*OwnedPet {
	var grp []*OwnedPet
	grp = append(grp, p)
	for _, o := range g.s.Pets {
		if o.UID != p.UID && o.Def == p.Def && o.Tier == p.Tier && !o.Lock && o.Bonus == 0 {
			grp = append(grp, o)
		}
	}
	return grp
}

func (g *Game) craft(p *OwnedPet) {
	if p.Tier >= 2 || p.Bonus > 0 {
		return
	}
	grp := g.craftGroup(p)
	if len(grp) < 5 {
		g.toast("Il faut 5 pets identiques", nil)
		g.audio.play("error", g.t)
		return
	}
	// on garde en priorité les pets équipés hors de la fusion
	sort.SliceStable(grp[1:], func(i, j int) bool { return !grp[1+i].Equip && grp[1+j].Equip })
	rm := map[int64]bool{}
	wasEquip := false
	shiny := false
	for _, o := range grp[:5] {
		rm[o.UID] = true
		wasEquip = wasEquip || o.Equip
		shiny = shiny || o.Shiny
	}
	g.s.removePets(rm)
	np := g.s.addPet(p.Def, p.Tier+1, shiny)
	np.Equip = wasEquip
	g.selUID = np.UID
	if np.Tier == 1 {
		g.s.Stats.Golden++
		g.toast(petDefs[p.Def].Name+" doré obtenu !", yellow)
	} else {
		g.s.Stats.Rainbow++
		g.toast(petDefs[p.Def].Name+" arc-en-ciel obtenu !", pink)
	}
	g.audio.play("levelup", g.t)
	g.syncActors()
}

// junkPets : pets faciles à remplacer (communs, non fusionnés, ni équipés ni verrouillés).
func (g *Game) junkPets() []*OwnedPet {
	var out []*OwnedPet
	for _, p := range g.s.Pets {
		limit := Uncommon
		if Rarity(g.s.AutoDelete) > limit {
			limit = Rarity(g.s.AutoDelete)
		}
		if !p.Equip && !p.Lock && p.Tier == 0 && !p.Shiny && p.Bonus == 0 && petDefs[p.Def].Rarity <= limit {
			out = append(out, p)
		}
	}
	return out
}

func (g *Game) deletePet(p *OwnedPet) {
	if p.Lock {
		return
	}
	g.s.removePets(map[int64]bool{p.UID: true})
	g.selUID = 0
	g.syncActors()
}

// ---------- éclosion ----------

func (g *Game) rollPet(e *EggDef) *PetDef {
	luck := g.luckMult()
	total := 0.0
	w := make([]float64, len(e.Pets))
	for i, p := range e.Pets {
		w[i] = p.Chance
		if p.Rarity >= Rare {
			w[i] *= luck
		}
		total += w[i]
	}
	r := g.rng.Float64() * total
	for i, p := range e.Pets {
		r -= w[i]
		if r <= 0 {
			return p
		}
	}
	return e.Pets[0]
}

// chance réelle (en %) d'obtenir p dans l'œuf e avec la chance actuelle
func (g *Game) realChance(e *EggDef, p *PetDef) float64 {
	luck := g.luckMult()
	total, mine := 0.0, 0.0
	for _, q := range e.Pets {
		w := q.Chance
		if q.Rarity >= Rare {
			w *= luck
		}
		total += w
		if q == p {
			mine = w
		}
	}
	return mine / total * 100
}

func (g *Game) tryHatch(e *EggDef, auto bool) bool {
	if g.hatch != nil {
		return false
	}
	n := 1
	if g.s.Passes["triple"] && g.s.Coins >= e.Price*3 {
		n = 3
	}
	free := g.s.storage() - len(g.s.Pets)
	if free <= 0 {
		g.toast("Inventaire plein ! Supprime ou fusionne des pets.", red)
		g.audio.play("error", g.t)
		g.autoHatch = nil
		return false
	}
	if n > free {
		n = free
	}
	if g.s.Coins < e.Price*float64(n) {
		g.toast("Il te faut "+fmtNum(e.Price)+" pièces", nil)
		g.audio.play("error", g.t)
		g.autoHatch = nil
		return false
	}
	g.s.Coins -= e.Price * float64(n)
	h := &HatchAnim{Egg: e, Auto: auto}
	for i := 0; i < n; i++ {
		d := g.rollPet(e)
		isNew := !g.s.Discovered[d.ID]
		shiny := g.rng.Float64() < 1.0/200
		g.s.Stats.Hatched++
		if int(d.Rarity) <= g.s.AutoDelete && !shiny && !isNew {
			// auto-suppression : le pet compte pour l'index mais ne prend pas de place
			h.Results = append(h.Results, HatchResult{Pet: &OwnedPet{Def: d.ID}, New: isNew, Deleted: true})
			continue
		}
		op := g.s.addPet(d.ID, 0, shiny)
		h.Results = append(h.Results, HatchResult{Pet: op, New: isNew})
		if g.s.equippedCount() < g.s.slots() {
			op.Equip = true
		}
	}
	g.syncActors()
	g.hatch = h
	g.audio.play("wobble", g.t)
	return true
}

// ---------- monde ----------

func (g *Game) unlockWorld(i int) {
	w := worlds[i]
	if i != g.s.MaxWorld+1 {
		return
	}
	if !g.spend(w.Unlock, false) {
		return
	}
	g.s.MaxWorld = i
	g.toast(w.Name+" débloqué !", yellow)
	g.enterWorld(i)
	g.panel = PanelNone
}

func (g *Game) doRebirth() {
	cost := rebirthCost(g.s.Rebirths)
	if g.s.Coins < cost {
		g.audio.play("error", g.t)
		return
	}
	g.s.Rebirths++
	g.s.Coins = 0
	g.s.MaxWorld = 0
	g.s.Gems += float64(10 * g.s.Rebirths)
	g.enterWorld(0)
	g.panel = PanelNone
	g.audio.play("legend", g.t)
	g.toast("Rebirth "+itoa(g.s.Rebirths)+" ! Pièces x"+trimF(rebirthMult(g.s.Rebirths)), yellow)
}

func trimF(v float64) string {
	s := fmtNum(v)
	if v < 1000 {
		s = formatFloat(v)
	}
	return s
}

// debugSave remplit une partie de test (variable d'environnement SPF_DEBUG=1).
func debugSave(s *Save) {
	s.Coins, s.Gems = 2.5e6, 800
	s.MaxWorld = 1
	s.Stats.Piles, s.Stats.Hatched = 40, 30
	for _, id := range []string{"mochi_dragon", "donut_unicorn", "lollipop_fox", "grape_cat", "cupcake_pup", "jelly_cat", "jelly_cat", "jelly_cat", "jelly_cat", "jelly_cat", "cotton_cloud", "berry_bunny"} {
		s.addPet(id, 0, false)
	}
	s.addPet("golden_king", 1, true)
	s.addPet("razz_dragon", 2, false)
	for i, p := range s.Pets {
		p.Equip = i >= len(s.Pets)-4
		p.Level = i % 7
	}
	s.BossTimer = 20
}

func isAudioError(err error) bool {
	m := strings.ToLower(err.Error())
	return strings.Contains(m, "oto") || strings.Contains(m, "audio") || strings.Contains(m, "alsa") || strings.Contains(m, "wasapi")
}
