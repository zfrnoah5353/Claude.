package main

import (
	"math"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
)

type HatchResult struct {
	Pet     *OwnedPet
	New     bool
	Deleted bool
}

type HatchAnim struct {
	Egg     *EggDef
	Results []HatchResult
	T       float64
	Auto    bool
	Played  bool
	Close   bool
}

func (h *HatchAnim) best() Rarity {
	b := Common
	for _, r := range h.Results {
		if d := petDefs[r.Pet.Def]; d.Rarity > b {
			b = d.Rarity
		}
	}
	return b
}

func (g *Game) updateHatch() {
	h := g.hatch
	h.T += dt
	if h.T > 0.2 && h.T < 1 && int(h.T*10)%3 == 0 && int((h.T-dt)*10)%3 != 0 {
		g.audio.play("wobble", g.t)
	}
	if h.T >= 1 && !h.Played {
		h.Played = true
		g.audio.play("crack", g.t)
		if h.best() >= Legendary {
			g.audio.play("legend", g.t)
			g.shake = 0.6
		} else {
			g.audio.play("reveal", g.t)
		}
		for _, r := range h.Results {
			d := petDefs[r.Pet.Def]
			if d.Rarity >= Legendary {
				g.toast("Tu as obtenu "+d.Name+" ("+rarityName[d.Rarity]+") !", rarityCol[d.Rarity])
			}
		}
	}
	if h.T > 1.3 && (inpututil.IsKeyJustPressed(ebiten.KeyE) || inpututil.IsKeyJustPressed(ebiten.KeySpace) || inpututil.IsKeyJustPressed(ebiten.KeyEnter)) {
		h.Close = true
	}
	limit := 3.2
	if h.Auto {
		limit = 1.9
		if h.best() >= Legendary {
			limit = 3.4
		}
	}
	if h.T > limit {
		h.Close = true
	}
	if h.Close {
		g.hatch = nil
		if h.Auto {
			g.autoHatchT = 0.1
		}
	}
}

func easeOutBack(t float64) float64 {
	t = clamp(t, 0, 1)
	const c1, c3 = 1.70158, 2.70158
	return 1 + c3*math.Pow(t-1, 3) + c1*math.Pow(t-1, 2)
}

func (g *Game) drawHatch(dst *ebiten.Image, h *HatchAnim) {
	fillRect(dst, 0, 0, ScreenW, ScreenH, alpha(hexc("#1B1030"), 0.55))
	n := len(h.Results)
	spacing := 380.0
	for i, r := range h.Results {
		cx := float64(ScreenW)/2 + (float64(i)-float64(n-1)/2)*spacing
		cy := 330.0
		d := petDefs[r.Pet.Def]
		if h.T < 1 {
			k := h.T
			rot := math.Sin(h.T*28+float64(i)) * 0.32 * k
			sc := 1 + 0.1*math.Sin(h.T*40)*k
			blitC(dst, eggSprite(h.Egg), cx, cy, 230*sc, rot)
			continue
		}
		t := h.T - 1
		if d.Rarity >= Epic {
			nr := 12
			for j := 0; j < nr; j++ {
				a := float64(j)/float64(nr)*2*math.Pi + h.T*0.8
				x1, y1 := cx+math.Cos(a)*420, cy+math.Sin(a)*420
				x2, y2 := cx+math.Cos(a+0.13)*420, cy+math.Sin(a+0.13)*420
				poly(dst, alpha(rarityCol[d.Rarity], 0.25), 0, cx, cy, x1, y1, x2, y2)
			}
		}
		circle(dst, cx, cy, 150, alpha(lighten(rarityCol[d.Rarity], 0.5), 0.5), 0)
		if t < 0.25 {
			circle(dst, cx, cy, 80+t*900, alpha(white, 1-t*4), 0)
		}
		sc := easeOutBack(t / 0.45)
		drawPet(dst, r.Pet, cx, cy+120*sc, 260*sc, g.t)
		if t > 0.2 {
			a := clamp((t-0.2)*5, 0, 1)
			txtO(dst, d.Name, cx, cy+170, 34, alpha(white, a), AC, 4*a)
			rw := txtW(rarityName[d.Rarity], 22, 700) + 36
			box(dst, cx-rw/2, cy+196, rw, 38, 16, alpha(rarityCol[d.Rarity], a), alpha(ink, 0.3*a), 4*a)
			txtO(dst, rarityName[d.Rarity], cx, cy+214, 22, alpha(white, a), AC, 3*a)
			info := "Puissance " + fmtNum(g.petPower(r.Pet)) + " · " + fmtChance(g.realChance(h.Egg, d))
			txtO(dst, info, cx, cy+256, 20, alpha(yellow, a), AC, 3*a)
			if r.New {
				box(dst, cx+80, cy-150, 120, 40, 14, alpha(yellow, a), alpha(hexc("#F2A900"), a), 4*a)
				txtB(dst, "NOUVEAU !", cx+140, cy-131, 20, alpha(ink, a), AC)
			}
			if r.Deleted {
				box(dst, cx-70, cy-150, 140, 40, 14, alpha(grayBtn, a), alpha(ink, 0.3*a), 4*a)
				txtB(dst, "Auto-supprimé", cx, cy-131, 18, alpha(ink, a), AC)
			}
			if r.Pet.Shiny {
				box(dst, cx-200, cy-150, 130, 40, 14, alpha(sky, a), alpha(ink, 0.3*a), 4*a)
				txtB(dst, "BRILLANT !", cx-135, cy-131, 20, alpha(ink, a), AC)
			}
		}
	}
	if h.T > 1.3 {
		msg := "Clique ou appuie sur E pour continuer"
		if h.Auto {
			msg = "Auto-éclosion en cours…"
		}
		txtO(dst, msg, ScreenW/2, ScreenH-36, 22, white, AC, 3)
	}
	if h.T < 1 {
		txtO(dst, h.Egg.Name, ScreenW/2, 110, 40, white, AC, 4)
	}
}

func fmtChance(c float64) string {
	switch {
	case c >= 10:
		return formatFloat(math.Round(c)) + " %"
	case c >= 1:
		return formatFloat(math.Round(c*10)/10) + " %"
	case c >= 0.1:
		return formatFloat(math.Round(c*100)/100) + " %"
	}
	return formatFloat(math.Round(c*1000)/1000) + " %"
}
