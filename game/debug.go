package main

import (
	"image"
	"image/png"
	"os"
	"path/filepath"
	"runtime/pprof"
	"sync"
	"time"

	"github.com/hajimehoshi/ebiten/v2"
)

// Scénario de test automatique (variable SPF_SHOTS=dossier) : joue une
// partie accélérée et enregistre des captures d'écran de chaque écran.

var (
	shotDir    = os.Getenv("SPF_SHOTS")
	pendingTag string
	offscreen  *ebiten.Image
	profFile   *os.File
)

type step struct {
	at   float64
	do   func(g *Game)
	shot string
}

func (g *Game) nearestPile() *Pile {
	var best *Pile
	bd := 1e9
	for _, p := range g.piles {
		if d := dist(p.X, p.Y, g.px, g.py); !p.Dead && d < bd {
			best, bd = p, d
		}
	}
	return best
}

func script() []step {
	var st []step
	add := func(at float64, shot string, do func(g *Game)) { st = append(st, step{at, do, shot}) }
	add(0.5, "01_title", nil)
	add(1.0, "", func(g *Game) { g.scene = ScenePlay })
	add(2.0, "02_play", nil)
	for t := 2.1; t < 5; t += 0.12 {
		add(t, "", func(g *Game) {
			if p := g.nearestPile(); p != nil {
				g.tapPile(p)
			}
		})
	}
	add(5.0, "03_tapping", nil)
	add(5.2, "", func(g *Game) { e := worlds[0].Eggs[1]; g.px, g.py = e.X, e.Y+70; g.updateCamera(true) })
	add(6.0, "04_near_egg", nil)
	add(6.1, "", func(g *Game) { g.s.Passes["triple"] = true; g.tryHatch(worlds[0].Eggs[1], false) })
	add(6.6, "05_hatch_wobble", nil)
	add(7.9, "06_hatch_reveal", nil)
	add(8.5, "", func(g *Game) { g.hatch = nil })
	panels := []struct {
		p PanelID
		n string
	}{{PanelPets, "07_pets"}, {PanelIndex, "08_index"}, {PanelShop, "09_shop"}, {PanelQuests, "10_quests"}, {PanelWorlds, "11_worlds"}, {PanelGift, "12_gift"}, {PanelRebirth, "13_rebirth"}, {PanelSettings, "14_settings"}}
	t := 9.0
	for _, p := range panels {
		p := p
		add(t, "", func(g *Game) {
			g.openPanel(p.p)
			if p.p == PanelPets {
				g.selUID = g.sortedPets()[0].UID
			}
		})
		add(t+0.5, p.n, nil)
		t += 0.8
	}
	add(t, "", func(g *Game) { g.tab = 2 })
	add(t+0.3, "", func(g *Game) { g.openPanel(PanelShop); g.tab = 2 })
	add(t+0.8, "09b_shop_passes", nil)
	add(t+1.0, "", func(g *Game) { g.openPanel(PanelIndex); g.tab = 1 })
	add(t+1.5, "08b_index_choco", nil)
	add(t+1.7, "", func(g *Game) { g.panel = PanelNone; g.s.BossTimer = 0.05 })
	t += 2.5
	add(t, "15_boss_avail", nil)
	add(t+0.2, "", func(g *Game) { g.startBoss() })
	add(t+1.5, "16_boss", nil)
	for k := t + 1.6; k < t+5; k += 0.1 {
		add(k, "", func(g *Game) {
			if g.boss != nil && !g.boss.Done {
				wx, wy := g.weakPoint()
				g.tapBoss(wx, wy, true)
			}
		})
	}
	add(t+6.0, "17_boss_slam", nil)
	add(t+6.2, "", func(g *Game) {
		if g.boss != nil && !g.boss.Done {
			g.boss.HP = 0
		}
	})
	add(t+7.0, "18_boss_win", nil)
	add(t+7.2, "", func(g *Game) {
		if g.popup != nil {
			p := g.popup
			g.popup = nil
			p.OnOK()
		}
		g.s.MaxWorld = 3
		g.enterWorld(1)
	})
	add(t+8.0, "19_choco", nil)
	add(t+8.2, "", func(g *Game) { g.enterWorld(2) })
	add(t+9.0, "20_ice", nil)
	add(t+9.2, "", func(g *Game) { g.enterWorld(3) })
	add(t+10.0, "21_galaxy", nil)
	add(t+10.2, "", func(g *Game) {
		g.enterWorld(0)
		g.px, g.py = portalX+300, portalY+100
		g.updateCamera(true)
	})
	add(t+11.0, "22_portal", nil)
	add(t+11.5, "", func(g *Game) { g.quit = true })
	return st
}

var steps []step
var stepIdx int

func debugInit() {
	if shotDir == "" {
		return
	}
	steps = script()
	_ = os.MkdirAll(shotDir, 0o755)
	if f, err := os.Create(filepath.Join(shotDir, "cpu.prof")); err == nil {
		profFile = f
		_ = pprof.StartCPUProfile(f)
		time.AfterFunc(45*time.Second, debugStop)
	}
}

var profMu sync.Mutex

func debugStop() {
	profMu.Lock()
	defer profMu.Unlock()
	if profFile != nil {
		pprof.StopCPUProfile()
		profFile.Close()
		profFile = nil
	}
}

func (g *Game) debugUpdate() {
	if shotDir == "" {
		return
	}
	if pendingTag != "" && pendingTag[0] != '@' && offscreen != nil {
		b := offscreen.Bounds()
		px := make([]byte, 4*b.Dx()*b.Dy())
		offscreen.ReadPixels(px)
		img := &image.RGBA{Pix: px, Stride: 4 * b.Dx(), Rect: b}
		if f, err := os.Create(filepath.Join(shotDir, pendingTag+".png")); err == nil {
			_ = png.Encode(f, img)
			f.Close()
		}
		pendingTag = ""
	}
	if os.Getenv("SPF_ICON") != "" && g.t > 0.2 && g.t < 0.22 {
		img := cached("appicon", 256, 256, func(dst *ebiten.Image) {
			circle(dst, 128, 128, 124, hexc("#BDE9FF"), 6)
			drawPetShape(dst, petDefs["gumdrop_bunny"], 0, 236, false)
		})
		px := make([]byte, 4*256*256)
		img.ReadPixels(px)
		if f, err := os.Create(os.Getenv("SPF_ICON")); err == nil {
			_ = png.Encode(f, &image.RGBA{Pix: px, Stride: 4 * 256, Rect: image.Rect(0, 0, 256, 256)})
			f.Close()
		}
	}
	for stepIdx < len(steps) && g.t >= steps[stepIdx].at {
		s := steps[stepIdx]
		stepIdx++
		if s.do != nil {
			s.do(g)
		}
		if s.shot != "" {
			pendingTag = "@" + s.shot
		}
	}
}

func (g *Game) debugDraw(screen *ebiten.Image) {
	if len(pendingTag) > 0 && pendingTag[0] == '@' {
		if offscreen == nil {
			offscreen = ebiten.NewImage(ScreenW, ScreenH)
		}
		offscreen.Clear()
		offscreen.DrawImage(screen, nil)
		pendingTag = pendingTag[1:]
	}
}
