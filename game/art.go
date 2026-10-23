package main

import (
	"fmt"
	"image/color"
	"math"
	"math/rand"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/vector"
)

// Les dessins détaillés (pets, œufs, tas, décor) sont rendus une fois dans des
// sprites mis en cache, puis simplement copiés à l'écran.

var spriteCache = map[string]*ebiten.Image{}

func cached(key string, w, h int, draw func(dst *ebiten.Image)) *ebiten.Image {
	if img, ok := spriteCache[key]; ok {
		return img
	}
	img := ebiten.NewImage(w, h)
	old := S
	S = 1
	draw(img)
	S = old
	spriteCache[key] = img
	return img
}

// blit dessine img centrée horizontalement en x, avec son bas en y (ancrage aux pieds).
func blit(dst, img *ebiten.Image, x, y, scale float64, cs ...float32) {
	op := &ebiten.DrawImageOptions{Filter: ebiten.FilterLinear}
	w, h := img.Bounds().Dx(), img.Bounds().Dy()
	op.GeoM.Translate(-float64(w)/2, -float64(h))
	op.GeoM.Scale(scale, scale)
	op.GeoM.Translate(x, y)
	op.GeoM.Scale(S, S)
	if len(cs) == 4 {
		op.ColorScale.Scale(cs[0], cs[1], cs[2], cs[3])
	}
	dst.DrawImage(img, op)
}

// blitC dessine img centrée sur (x, y) à la taille size (en px).
func blitC(dst, img *ebiten.Image, x, y, size float64, rot float64) {
	op := &ebiten.DrawImageOptions{Filter: ebiten.FilterLinear}
	w := float64(img.Bounds().Dx())
	h := float64(img.Bounds().Dy())
	op.GeoM.Translate(-w/2, -h/2)
	op.GeoM.Rotate(rot)
	op.GeoM.Scale(size/w, size/w)
	op.GeoM.Translate(x, y)
	op.GeoM.Scale(S, S)
	dst.DrawImage(img, op)
}

// ---------- pets ----------

const petTex = 160

var (
	goldBody  = hexc("#FFD23F")
	goldBelly = hexc("#FFF1A8")
)

func petSprite(d *PetDef, tier int, locked bool) *ebiten.Image {
	key := fmt.Sprintf("pet|%s|%d|%v", d.ID, tier, locked)
	return cached(key, petTex, petTex, func(dst *ebiten.Image) {
		drawPetShape(dst, d, tier, petTex, locked)
	})
}

func drawPetShape(dst *ebiten.Image, d *PetDef, tier int, size float64, locked bool) {
	s := size / 100
	P := func(v float64) float64 { return v * s }
	body, belly := d.Body, d.Belly
	earIn := hexc("#FFB3CF")
	trim := hexc("#FFD23F")
	mane := hexc("#FF8FB8")
	halo := hexc("#FFE27A")
	eye := hexc("#2B1B3A")
	cheek := alpha(hexc("#FF7FA8"), 0.7)
	line := ink
	switch tier {
	case 1:
		body = mix(body, goldBody, 0.65)
		belly = mix(belly, goldBelly, 0.7)
		trim = hexc("#FFF6C8")
	case 2:
		body = mix(body, hexc("#FF9AE6"), 0.5)
		belly = hexc("#FFFFFF")
	}
	if locked {
		dark := hexc("#3A3358")
		body, belly, earIn, trim, mane, halo = dark, dark, dark, dark, dark, dark
		line = hexc("#1B1630")
	}
	sw := P(3.2)
	E := func(cx, cy, rx, ry, rot float64, fill color.Color) {
		shape(dst, pathEllipse(P(cx), P(cy), P(rx), P(ry), rad(rot)), fill, sw, line)
	}
	F := func(cx, cy, rx, ry float64, fill color.Color) {
		shape(dst, pathEllipse(P(cx), P(cy), P(rx), P(ry), 0), fill, 0, nil)
	}
	Poly := func(fill color.Color, stroke bool, pts ...float64) {
		for i := range pts {
			pts[i] = P(pts[i])
		}
		w := 0.0
		if stroke {
			w = sw
		}
		concaveFill = !convex(pts)
		shape(dst, pathPoly(pts...), fill, w, line)
		concaveFill = false
	}

	F(50, 93, 28, 5, alpha(ink, 0.18))

	if d.Extra == "wings" {
		E(13, 54, 11, 19, -20, belly)
		E(87, 54, 11, 19, 20, belly)
	}
	if d.Extra == "tail" {
		E(84, 74, 9, 17, 40, body)
		F(88, 66, 4, 6, belly)
	}
	switch d.Ear {
	case "long":
		E(35, 22, 8, 19, 0, body)
		F(35, 24, 3.5, 12, earIn)
		E(65, 22, 8, 19, 0, body)
		F(65, 24, 3.5, 12, earIn)
	case "point":
		Poly(body, true, 20, 44, 27, 10, 47, 30)
		Poly(earIn, false, 27, 38, 29, 20, 40, 31)
		Poly(body, true, 80, 44, 73, 10, 53, 30)
		Poly(earIn, false, 73, 38, 71, 20, 60, 31)
	case "floppy":
		E(17, 46, 10, 19, 20, body)
		E(83, 46, 10, 19, -20, body)
	case "round":
		E(26, 30, 12, 12, 0, body)
		F(26, 30, 6, 6, earIn)
		E(74, 30, 12, 12, 0, body)
		F(74, 30, 6, 6, earIn)
	case "horn":
		Poly(trim, true, 28, 34, 33, 8, 45, 30)
		Poly(trim, true, 72, 34, 67, 8, 55, 30)
	}

	if d.Extra == "golem" {
		shape(dst, pathRoundRect(P(16), P(26), P(68), P(64), P(22)), body, sw, line)
	} else {
		E(50, 58, 34, 32, 0, body)
	}
	F(50, 71, 20, 15, belly)
	if tier == 2 && !locked {
		cols := []string{"#FF5A6E", "#FFB020", "#FFE27A", "#3DD68C", "#4DA3FF", "#B069FF"}
		for i, c := range cols {
			F(36+float64(i)*5.6, 72, 2.6, 9, alpha(hexc(c), 0.85))
		}
	}
	if d.Extra == "golem" && !locked {
		F(28, 42, 5, 4, darken(body, 0.15))
		F(72, 80, 4, 3, darken(body, 0.15))
		F(70, 38, 3, 3, darken(body, 0.15))
	}

	if !locked {
		F(38, 54, 5.5, 5.5, eye)
		F(62, 54, 5.5, 5.5, eye)
		F(40, 52, 2, 2, white)
		F(64, 52, 2, 2, white)
		F(28, 64, 5, 5, cheek)
		F(72, 64, 5, 5, cheek)
		p := &vector.Path{}
		p.MoveTo(float32(P(44)), float32(P(62)))
		p.QuadTo(float32(P(50)), float32(P(69)), float32(P(56)), float32(P(62)))
		strokePath(dst, p, P(2.5), eye)
		if d.Extra == "golem" {
			strokeLine := func(x0, y0, x1, y1 float64) {
				q := &vector.Path{}
				q.MoveTo(float32(P(x0)), float32(P(y0)))
				q.LineTo(float32(P(x1)), float32(P(y1)))
				strokePath(dst, q, P(3), eye)
			}
			strokeLine(31, 44, 43, 47)
			strokeLine(69, 44, 57, 47)
		}
	} else {
		F(38, 54, 5.5, 5.5, hexc("#1B1630"))
		F(62, 54, 5.5, 5.5, hexc("#1B1630"))
	}

	switch d.Extra {
	case "crown":
		Poly(trim, true, 32, 33, 35, 12, 43, 24, 50, 8, 57, 24, 65, 12, 68, 33)
	case "unicorn":
		Poly(trim, true, 50, 2, 43, 28, 57, 28)
		E(30, 35, 7, 7, 0, mane)
		E(25, 47, 6, 6, 0, mane)
	case "halo":
		shape(dst, pathEllipse(P(50), P(14), P(17), P(5), 0), nil, P(4), halo)
	}
}

// drawPet dessine un pet animé (rebond, aura de rareté, scintillements).
func drawPet(dst *ebiten.Image, op *OwnedPet, x, y, size, t float64) {
	d := petDefs[op.Def]
	if d == nil {
		return
	}
	if op.Tier == 2 {
		for i := 0; i < 3; i++ {
			c := hsv(t*120+float64(i)*120, 0.5, 1)
			circle(dst, x, y-size*0.48, size*(0.5+0.04*float64(i)), alpha(c, 0.18), 0)
		}
	} else if d.Rarity >= Legendary {
		circle(dst, x, y-size*0.48, size*0.52, alpha(rarityCol[d.Rarity], 0.22+0.08*math.Sin(t*4)), 0)
	}
	blit(dst, petSprite(d, op.Tier, false), x, y, size/petTex)
	if op.Shiny {
		for i := 0; i < 3; i++ {
			ph := t*2 + float64(i)*2.1
			a := 0.5 + 0.5*math.Sin(ph*1.7)
			sparkle(dst, x+math.Cos(ph)*size*0.42, y-size*0.55+math.Sin(ph*1.3)*size*0.3, size*0.09*a+1, alpha(white, a))
		}
	}
}

// petIcon : pet dans une case d'inventaire (taille = côté de la case).
func petIcon(dst *ebiten.Image, op *OwnedPet, x, y, size float64) {
	d := petDefs[op.Def]
	blit(dst, petSprite(d, op.Tier, false), x+size/2, y+size*0.98, size/petTex)
}

// ---------- œufs ----------

func eggSprite(e *EggDef) *ebiten.Image {
	return cached("egg|"+e.ID, 120, 140, func(dst *ebiten.Image) {
		drawEgg(dst, 60, 74, 1.3, e.Shell, e.Spot)
	})
}

func drawEgg(dst *ebiten.Image, cx, cy, k float64, shell, spot color.RGBA) {
	ellipse(dst, cx, cy, 36*k, 46*k, 0, shell, 4)
	circle(dst, cx-15*k, cy-10*k, 7*k, spot, 0)
	circle(dst, cx+13*k, cy+10*k, 9*k, spot, 0)
	circle(dst, cx+7*k, cy-22*k, 5*k, spot, 0)
	ellipse(dst, cx-18*k, cy-24*k, 6*k, 10*k, rad(30), alpha(white, 0.55), 0)
}

// ---------- avatar du joueur ----------

func drawAvatar(dst *ebiten.Image, x, y, h float64, shirt, pants color.RGBA, walk float64, cheer bool) {
	k := h / 130
	x0 := x - 35*k
	y0 := y - 130*k
	sw := 3.5 * k
	if sw < 2.5 {
		sw = 2.5
	}
	skin := hexc("#FFD9A8")
	ll := math.Sin(walk) * 6 * k
	ellipse(dst, x, y+2*k, 34*k, 8*k, 0, alpha(ink, 0.18), 0)
	rrect(dst, x0+14*k, y0+88*k-ll, 20*k, 40*k, 6*k, pants, sw)
	rrect(dst, x0+36*k, y0+88*k+ll, 20*k, 40*k, 6*k, pants, sw)
	if cheer {
		rrect(dst, x0-2*k, y0+6*k, 12*k, 42*k, 6*k, skin, sw)
		rrect(dst, x0+60*k, y0+6*k, 12*k, 42*k, 6*k, skin, sw)
	} else {
		rrect(dst, x0, y0+40*k+ll*0.6, 12*k, 42*k, 6*k, skin, sw)
		rrect(dst, x0+58*k, y0+40*k-ll*0.6, 12*k, 42*k, 6*k, skin, sw)
	}
	rrect(dst, x0+10*k, y0+38*k, 50*k, 50*k, 8*k, shirt, sw)
	rrect(dst, x0+17*k, y0, 36*k, 36*k, 10*k, skin, sw)
	rrect(dst, x0+23*k, y0+11*k, 5*k, 7*k, 3*k, ink, 0)
	rrect(dst, x0+42*k, y0+11*k, 5*k, 7*k, 3*k, ink, 0)
	p := &vector.Path{}
	p.MoveTo(float32(x0+29*k), float32(y0+24*k))
	p.QuadTo(float32(x0+35*k), float32(y0+29*k), float32(x0+41*k), float32(y0+24*k))
	strokePath(dst, p, 2.5*k, ink)
}

// ---------- tas de bonbons ----------

// Types de tas : 0 petit, 1 moyen, 2 coffre.
var pileHP = [3]float64{15, 80, 600}
var pileSize = [3]float64{70, 110, 120}

func pileSprite(w *WorldDef, kind, variant int, golden bool) *ebiten.Image {
	key := fmt.Sprintf("pile|%s|%d|%d|%v", w.Theme, kind, variant, golden)
	return cached(key, 180, 150, func(dst *ebiten.Image) {
		rng := rand.New(rand.NewSource(int64(kind*31 + variant*7 + len(w.Theme))))
		cols := w.PileCols
		pick := func() color.RGBA {
			c := cols[rng.Intn(len(cols))]
			if golden {
				c = mix(c, goldBody, 0.75)
			}
			return c
		}
		ellipse(dst, 90, 138, 70, 10, 0, alpha(ink, 0.16), 0)
		if kind == 2 {
			drawChest(dst, w, golden)
			return
		}
		type it struct{ x, y, r float64 }
		var items []it
		if kind == 0 {
			items = []it{{68, 120, 24}, {110, 122, 22}, {90, 98, 22}}
		} else {
			items = []it{{48, 124, 24}, {90, 126, 26}, {132, 124, 24}, {68, 98, 24}, {112, 98, 24}, {90, 72, 24}}
		}
		for _, i := range items {
			drawCandy(dst, w.Theme, i.x, i.y, i.r, pick(), rng)
		}
		if golden {
			sparkle(dst, 140, 50, 12, white)
			sparkle(dst, 40, 70, 8, white)
		}
	})
}

func drawCandy(dst *ebiten.Image, theme string, x, y, r float64, c color.RGBA, rng *rand.Rand) {
	switch theme {
	case "choco":
		// tablette / truffe
		if rng.Intn(2) == 0 {
			rrect(dst, x-r, y-r*1.2, r*2, r*1.5, r*0.3, c, 4)
			line(dst, x, y-r*1.1, x, y+r*0.2, 3, darken(c, 0.25))
			line(dst, x-r*0.9, y-r*0.45, x+r*0.9, y-r*0.45, 3, darken(c, 0.25))
		} else {
			ellipse(dst, x, y-r*0.6, r, r*0.85, 0, c, 4)
			ellipse(dst, x, y-r*1.05, r*0.7, r*0.3, 0, lighten(c, 0.35), 0)
		}
	case "ice":
		// boule de glace avec coulure
		circle(dst, x, y-r*0.8, r, c, 4)
		ellipse(dst, x+r*0.4, y-r*0.05, r*0.25, r*0.35, 0, c, 0)
		circle(dst, x-r*0.35, y-r*1.2, r*0.25, alpha(white, 0.6), 0)
		for i := 0; i < 3; i++ {
			a := rng.Float64() * 2 * math.Pi
			line(dst, x+math.Cos(a)*r*0.5, y-r*0.8+math.Sin(a)*r*0.5, x+math.Cos(a)*r*0.5+5, y-r*0.8+math.Sin(a)*r*0.5+3, 3, hsv(rng.Float64()*360, 0.6, 1))
		}
	case "galaxy":
		circle(dst, x, y-r*0.8, r*1.15, alpha(c, 0.25), 0)
		star(dst, x, y-r*0.8, r*1.05, 0.5, rng.Float64(), c, 4)
		circle(dst, x-r*0.3, y-r*1.0, r*0.18, alpha(white, 0.7), 0)
	default:
		// boule de gomme (gumdrop)
		p := &vector.Path{}
		p.MoveTo(float32(x-r), float32(y))
		p.Arc(float32(x), float32(y-r*0.2), float32(r), math.Pi*0.94, math.Pi*2.06, vector.Clockwise)
		p.Close()
		shape(dst, p, c, 4, ink)
		ellipse(dst, x-r*0.35, y-r*0.75, r*0.22, r*0.32, rad(30), alpha(white, 0.6), 0)
		for i := 0; i < 3; i++ {
			circle(dst, x+(rng.Float64()-0.5)*r*1.2, y-r*0.2-rng.Float64()*r*0.6, 2, alpha(white, 0.8), 0)
		}
	}
}

func drawChest(dst *ebiten.Image, w *WorldDef, golden bool) {
	bodyC := hexc("#FF8FB8")
	switch w.Theme {
	case "choco":
		bodyC = hexc("#8A5A3C")
	case "ice":
		bodyC = hexc("#7FD6FF")
	case "galaxy":
		bodyC = hexc("#6B5BD6")
	}
	trim := hexc("#FFD54A")
	if golden {
		bodyC = goldBody
		trim = hexc("#FFF6C8")
	}
	rrect(dst, 28, 70, 124, 66, 10, bodyC, 4.5)
	rrect(dst, 22, 44, 136, 36, 14, lighten(bodyC, 0.15), 4.5)
	rrect(dst, 80, 44, 20, 92, 3, trim, 4)
	rrect(dst, 76, 68, 28, 26, 6, trim, 4)
	circle(dst, 90, 80, 4, ink, 0)
	sparkle(dst, 150, 36, 10, white)
}

// ---------- décor ----------

type Decor struct {
	X, Y  float64
	Kind  int
	Scale float64
}

func decorSprite(theme string, kind int) *ebiten.Image {
	return cached(fmt.Sprintf("deco|%s|%d", theme, kind), 200, 260, func(dst *ebiten.Image) {
		drawDecor(dst, theme, kind)
	})
}

func drawDecor(dst *ebiten.Image, theme string, kind int) {
	cx, by := 100.0, 250.0
	ellipse(dst, cx, by-4, 56, 10, 0, alpha(ink, 0.15), 0)
	switch theme {
	case "meadow":
		switch kind {
		case 0: // sucette géante
			rrect(dst, cx-7, by-150, 14, 150, 7, white, 4)
			circle(dst, cx, by-170, 52, pink, 5)
			circle(dst, cx, by-170, 32, white, 4)
			circle(dst, cx, by-170, 14, pink, 4)
		case 1: // buisson
			circle(dst, cx-34, by-40, 34, hexc("#8EDDB4"), 5)
			circle(dst, cx+30, by-42, 36, hexc("#8EDDB4"), 5)
			circle(dst, cx, by-62, 40, hexc("#A6E8C4"), 5)
			circle(dst, cx-10, by-70, 6, pink, 0)
			circle(dst, cx+22, by-50, 6, yellow, 0)
		case 2: // sucre d'orge
			p := &vector.Path{}
			p.MoveTo(float32(cx+10), float32(by-10))
			p.LineTo(float32(cx+10), float32(by-150))
			p.Arc(float32(cx-18), float32(by-150), 28, 0, math.Pi, vector.CounterClockwise)
			strokePath(dst, p, 26, ink)
			strokePath(dst, p, 18, white)
			for i := 0; i < 6; i++ {
				yy := by - 20 - float64(i)*22
				line(dst, cx+2, yy, cx+18, yy-10, 6, red)
			}
		default: // fleur bonbon
			rrect(dst, cx-4, by-90, 8, 90, 4, hexc("#2DB784"), 3)
			for i := 0; i < 6; i++ {
				a := float64(i) * math.Pi / 3
				circle(dst, cx+math.Cos(a)*22, by-100+math.Sin(a)*22, 16, lilac, 4)
			}
			circle(dst, cx, by-100, 15, yellow, 4)
		}
	case "choco":
		switch kind {
		case 0: // arbre chocolat
			rrect(dst, cx-12, by-120, 24, 120, 8, hexc("#6B4430"), 4)
			circle(dst, cx-30, by-140, 40, hexc("#4A2C20"), 5)
			circle(dst, cx+30, by-140, 40, hexc("#4A2C20"), 5)
			circle(dst, cx, by-175, 46, hexc("#5A3424"), 5)
			circle(dst, cx-10, by-190, 6, pink, 0)
			circle(dst, cx+20, by-160, 6, white, 0)
			circle(dst, cx-30, by-150, 6, yellow, 0)
		case 1: // cupcake
			poly(dst, hexc("#FF8FB8"), 4.5, cx-50, by-80, cx+50, by-80, cx+38, by-6, cx-38, by-6)
			circle(dst, cx-30, by-92, 26, hexc("#F3E0C8"), 5)
			circle(dst, cx+30, by-92, 26, hexc("#F3E0C8"), 5)
			circle(dst, cx, by-112, 32, hexc("#F3E0C8"), 5)
			circle(dst, cx, by-150, 12, red, 4)
		case 2: // fontaine de chocolat (rochers)
			ellipse(dst, cx, by-40, 70, 40, 0, hexc("#8A5A3C"), 5)
			ellipse(dst, cx, by-50, 50, 24, 0, hexc("#5A3424"), 0)
		default:
			rrect(dst, cx-40, by-90, 80, 90, 8, hexc("#6B4430"), 5)
			for i := 0; i < 3; i++ {
				line(dst, cx-40, by-90+float64(i+1)*22, cx+40, by-90+float64(i+1)*22, 3, hexc("#4A2C20"))
			}
			line(dst, cx, by-90, cx, by, 3, hexc("#4A2C20"))
		}
	case "ice":
		switch kind {
		case 0: // cornet géant
			poly(dst, hexc("#E8A85A"), 5, cx-40, by-130, cx+40, by-130, cx, by-8)
			line(dst, cx-30, by-110, cx+16, by-60, 3, hexc("#C47A3D"))
			line(dst, cx+30, by-110, cx-16, by-60, 3, hexc("#C47A3D"))
			circle(dst, cx, by-150, 44, pink, 5)
			circle(dst, cx, by-200, 34, mint, 5)
			circle(dst, cx, by-238, 10, red, 4)
		case 1: // sapin givré
			poly(dst, hexc("#A8DCFF"), 5, cx, by-230, cx+60, by-110, cx-60, by-110)
			poly(dst, hexc("#CFEFFF"), 5, cx, by-170, cx+70, by-30, cx-70, by-30)
			circle(dst, cx-20, by-90, 6, white, 0)
			circle(dst, cx+25, by-140, 6, white, 0)
		case 2: // esquimau
			rrect(dst, cx-8, by-60, 16, 60, 6, hexc("#F3D9B8"), 4)
			rrect(dst, cx-34, by-170, 68, 120, 30, lilac, 5)
			rrect(dst, cx-34, by-170, 68, 40, 30, pink, 0)
		default: // bonhomme de neige glace
			circle(dst, cx, by-50, 46, white, 5)
			circle(dst, cx, by-122, 32, white, 5)
			circle(dst, cx-10, by-128, 4, ink, 0)
			circle(dst, cx+10, by-128, 4, ink, 0)
			poly(dst, orange, 3, cx, by-120, cx+24, by-116, cx, by-112)
		}
	case "galaxy":
		switch kind {
		case 0: // planète
			circle(dst, cx, by-130, 56, hexc("#FF8FB8"), 5)
			ellipse(dst, cx, by-130, 90, 20, rad(-15), nil, 6)
			ellipse(dst, cx, by-130, 90, 20, rad(-15), nil, 3)
			circle(dst, cx-20, by-150, 10, alpha(white, 0.5), 0)
		case 1: // cristal
			poly(dst, hexc("#7FD6FF"), 5, cx, by-200, cx+34, by-120, cx+20, by-10, cx-20, by-10, cx-34, by-120)
			poly(dst, alpha(white, 0.4), 0, cx, by-190, cx+12, by-120, cx, by-30)
			poly(dst, hexc("#B69CFF"), 5, cx+50, by-120, cx+70, by-70, cx+60, by-10, cx+36, by-10, cx+30, by-70)
		case 2: // fusée bonbon
			rrect(dst, cx-30, by-180, 60, 150, 30, white, 5)
			circle(dst, cx, by-130, 16, sky, 5)
			poly(dst, red, 5, cx-30, by-70, cx-56, by-20, cx-30, by-30)
			poly(dst, red, 5, cx+30, by-70, cx+56, by-20, cx+30, by-30)
		default: // étoile gélifiée
			star(dst, cx, by-90, 70, 0.48, 0.2, yellow, 5)
			circle(dst, cx-16, by-100, 6, ink, 0)
			circle(dst, cx+16, by-100, 6, ink, 0)
		}
	}
}

// ---------- icônes d'interface ----------

func drawIcon(dst *ebiten.Image, name string, cx, cy, s float64) {
	k := s / 34
	X := func(v float64) float64 { return cx + (v-17)*k }
	Y := func(v float64) float64 { return cy + (v-17)*k }
	sw := 3 * k
	switch name {
	case "paw":
		ellipse(dst, X(17), Y(23), 8*k, 6.5*k, 0, white, sw)
		for _, p := range [][2]float64{{7, 14}, {14, 8}, {21, 8}, {28, 14}} {
			circle(dst, X(p[0]), Y(p[1]), 3.4*k, white, 2.5*k)
		}
	case "book":
		rrect(dst, X(5), Y(6), 24*k, 22*k, 3*k, white, sw)
		line(dst, X(17), Y(6), X(17), Y(28), sw, ink)
	case "bag":
		poly(dst, white, sw, X(8), Y(12), X(26), Y(12), X(28), Y(28), X(6), Y(28))
		p := &vector.Path{}
		p.MoveTo(float32(X(12)), float32(Y(12)))
		p.LineTo(float32(X(12)), float32(Y(9)))
		p.Arc(float32(X(17)), float32(Y(9)), float32(5*k), math.Pi, 2*math.Pi, vector.Clockwise)
		p.LineTo(float32(X(22)), float32(Y(12)))
		strokePath(dst, p, sw, ink)
	case "list":
		rrect(dst, X(7), Y(4), 20*k, 26*k, 3*k, white, sw)
		for _, yy := range []float64{12, 18} {
			line(dst, X(11), Y(yy), X(23), Y(yy), sw, ink)
		}
		line(dst, X(11), Y(24), X(18), Y(24), sw, ink)
	case "globe":
		circle(dst, X(17), Y(17), 12*k, white, sw)
		ellipse(dst, X(17), Y(17), 5*k, 12*k, 0, nil, sw)
		line(dst, X(5), Y(17), X(29), Y(17), sw, ink)
	case "gift":
		rrect(dst, X(5), Y(14), 24*k, 16*k, 2*k, white, sw)
		rrect(dst, X(3), Y(9), 28*k, 7*k, 2*k, white, sw)
		line(dst, X(17), Y(9), X(17), Y(30), sw, ink)
		ellipse(dst, X(13), Y(6), 4*k, 3*k, rad(20), nil, 2.5*k)
		ellipse(dst, X(21), Y(6), 4*k, 3*k, rad(-20), nil, 2.5*k)
	case "portal":
		circle(dst, X(17), Y(17), 12*k, white, sw)
		circle(dst, X(17), Y(17), 7*k, lilac, sw)
		circle(dst, X(17), Y(17), 2.5*k, white, 0)
	case "gear":
		for i := 0; i < 8; i++ {
			a := float64(i) * math.Pi / 4
			line(dst, X(17), Y(17), X(17+math.Cos(a)*13), Y(17+math.Sin(a)*13), 6*k, ink)
		}
		circle(dst, X(17), Y(17), 10*k, white, sw)
		circle(dst, X(17), Y(17), 4*k, grayBtn, sw)
	case "skull":
		rrect(dst, X(6), Y(5), 22*k, 20*k, 9*k, white, sw)
		rrect(dst, X(11), Y(22), 12*k, 8*k, 3*k, white, sw)
		circle(dst, X(12), Y(15), 3.5*k, ink, 0)
		circle(dst, X(22), Y(15), 3.5*k, ink, 0)
	case "coin":
		circle(dst, X(17), Y(17), 13*k, yellow, sw)
		circleC(dst, X(17), Y(17), 6*k, nil, sw, hexc("#F2A900"))
	case "gem":
		poly(dst, sky, sw, X(17), Y(3), X(28), Y(12), X(24), Y(28), X(10), Y(28), X(6), Y(12))
		p := &vector.Path{}
		p.MoveTo(float32(X(6)), float32(Y(12)))
		p.LineTo(float32(X(28)), float32(Y(12)))
		p.LineTo(float32(X(17)), float32(Y(28)))
		p.LineTo(float32(X(10)), float32(Y(28)))
		strokePath(dst, p, 2*k, ink)
	case "sound":
		poly(dst, white, sw, X(5), Y(13), X(11), Y(13), X(18), Y(6), X(18), Y(28), X(11), Y(21), X(5), Y(21))
		p := &vector.Path{}
		p.Arc(float32(X(19)), float32(Y(17)), float32(8*k), -0.8, 0.8, vector.Clockwise)
		strokePath(dst, p, sw, ink)
	case "lock":
		rrect(dst, X(7), Y(15), 20*k, 15*k, 3*k, yellow, sw)
		p := &vector.Path{}
		p.MoveTo(float32(X(11)), float32(Y(15)))
		p.LineTo(float32(X(11)), float32(Y(11)))
		p.Arc(float32(X(17)), float32(Y(11)), float32(6*k), math.Pi, 2*math.Pi, vector.Clockwise)
		p.LineTo(float32(X(23)), float32(Y(15)))
		strokePath(dst, p, sw, ink)
	case "potion":
		rrect(dst, X(13), Y(3), 8*k, 8*k, 2*k, white, sw)
		circle(dst, X(17), Y(21), 10*k, white, sw)
	case "close":
		line(dst, X(9), Y(9), X(25), Y(25), 5*k, white)
		line(dst, X(25), Y(9), X(9), Y(25), 5*k, white)
	}
}

func coinIcon(dst *ebiten.Image, cx, cy, s float64) { drawIcon(dst, "coin", cx, cy, s) }
func gemIcon(dst *ebiten.Image, cx, cy, s float64)  { drawIcon(dst, "gem", cx, cy, s) }
