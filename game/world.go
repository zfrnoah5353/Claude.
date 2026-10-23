package main

import (
	"image/color"
	"math"
	"math/rand"
	"sort"
	"strconv"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
)

const (
	mapW = 2400.0
	mapH = 1700.0
)

var (
	portalX, portalY = 420.0, 520.0
	gateX, gateY     = 1980.0, 520.0
	spawnX, spawnY   = 1200.0, 760.0
)

type PetActor struct {
	UID    int64
	X, Y   float64
	Target *Pile
	Slot   int
	Hop    float64
	Atk    bool
}

type Pile struct {
	X, Y      float64
	Kind      int
	Variant   int
	HP, MaxHP float64
	Golden    bool
	Hit       float64
	Dead      bool
	Attackers int
}

type Orb struct {
	X, Y, VX, VY float64
	T            float64
	Amount       float64
	Gem          bool
}

type Floater struct {
	X, Y   float64
	Text   string
	T      float64
	Size   float64
	Col    color.RGBA
	Screen bool
}

type Particle struct {
	X, Y, VX, VY float64
	T, Life      float64
	R            float64
	Col          color.RGBA
	Rot          float64
}

func itoa(i int) string { return strconv.Itoa(i) }
func formatFloat(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}

func (g *Game) enterWorld(i int) {
	if i > g.s.MaxWorld {
		i = g.s.MaxWorld
	}
	g.s.World = i
	g.scene = sceneOr(g.scene)
	g.px, g.py = spawnX, spawnY
	g.moving = false
	g.piles = nil
	g.orbs = nil
	g.floats = nil
	g.parts = nil
	g.focus = nil
	g.autoHatch = nil
	g.decor = nil
	rng := rand.New(rand.NewSource(int64(i*977 + 13)))
	for len(g.decor) < 70 {
		x := 80 + rng.Float64()*(mapW-160)
		y := 80 + rng.Float64()*(mapH-160)
		if g.inPlaza(x, y, 120) || inField(x, y) {
			continue
		}
		g.decor = append(g.decor, Decor{X: x, Y: y, Kind: rng.Intn(4), Scale: 0.6 + rng.Float64()*0.5})
	}
	for k := 0; k < 26; k++ {
		g.spawnPile()
	}
	g.syncActors()
	g.updateCamera(true)
}

func sceneOr(s Scene) Scene {
	if s == SceneBoss {
		return ScenePlay
	}
	return s
}

// La place centrale : œufs, portail de rebirth, porte du monde suivant.
func (g *Game) inPlaza(x, y, pad float64) bool {
	return x > 300-pad && x < 2100+pad && y > 300-pad && y < 620+pad
}

// Champs de bonbons : trois grandes zones autour de la place.
var fields = []Rect{{140, 700, 900, 860}, {1360, 700, 900, 860}, {1060, 800, 280, 760}}

func inField(x, y float64) bool {
	for _, f := range fields {
		if f.Inset(-60).In(x, y) {
			return true
		}
	}
	return false
}

func (g *Game) spawnPile() {
	f := fields[g.rng.Intn(len(fields))]
	for try := 0; try < 20; try++ {
		x := f.X + g.rng.Float64()*f.W
		y := f.Y + g.rng.Float64()*f.H
		if dist(x, y, spawnX, spawnY) < 80 {
			continue
		}
		ok := true
		for _, p := range g.piles {
			if dist(x, y, p.X, p.Y) < 95 {
				ok = false
				break
			}
		}
		if !ok {
			continue
		}
		kind := 0
		r := g.rng.Float64()
		if r < 0.06 {
			kind = 2
		} else if r < 0.36 {
			kind = 1
		}
		w := worlds[g.s.World]
		hp := pileHP[kind] * w.Scale * (0.85 + g.rng.Float64()*0.3)
		golden := g.rng.Float64() < 0.01*float64(g.s.Upgrades["golden"])+0.005
		g.piles = append(g.piles, &Pile{X: x, Y: y, Kind: kind, Variant: g.rng.Intn(3), HP: hp, MaxHP: hp, Golden: golden})
		return
	}
}

func (g *Game) syncActors() {
	old := map[int64]*PetActor{}
	for _, a := range g.actors {
		old[a.UID] = a
	}
	g.actors = g.actors[:0]
	for _, p := range g.sortedPets() {
		if !p.Equip {
			continue
		}
		a := old[p.UID]
		if a == nil {
			a = &PetActor{UID: p.UID, X: g.px + g.rng.Float64()*40 - 20, Y: g.py + 30}
		}
		a.Slot = len(g.actors)
		g.actors = append(g.actors, a)
	}
}

func (g *Game) updateCamera(snap bool) {
	tx := clamp(g.px, ScreenW/2, mapW-ScreenW/2)
	ty := clamp(g.py-170, ScreenH/2, mapH-ScreenH/2)
	if snap {
		g.camX, g.camY = tx, ty
	} else {
		g.camX = lerp(g.camX, tx, 0.12)
		g.camY = lerp(g.camY, ty, 0.12)
	}
}

func (g *Game) toScreen(x, y float64) (float64, float64) {
	sx, sy := x-g.camX+ScreenW/2, y-g.camY+ScreenH/2
	if g.shake > 0 {
		sx += math.Sin(g.t*90) * g.shake * 8
		sy += math.Cos(g.t*77) * g.shake * 6
	}
	return sx, sy
}

func (g *Game) toWorld(sx, sy float64) (float64, float64) {
	return sx + g.camX - ScreenW/2, sy + g.camY - ScreenH/2
}

// ---------- mise à jour du monde ----------

func (g *Game) updatePlay() {
	g.buildHUD()
	g.buildPanels()
	g.buildOverlays()

	canAct := g.panel == PanelNone && g.hatch == nil && g.popup == nil
	if canAct {
		g.handleShortcuts()
		g.movePlayer()
	}
	g.updatePets()
	g.updatePiles()
	g.updateFX()
	g.updateCamera(false)
	if g.shake > 0 {
		g.shake -= dt * 2
	}

	// interactions de proximité
	g.nearEgg = nil
	for _, e := range worlds[g.s.World].Eggs {
		if dist(g.px, g.py, e.X, e.Y+40) < 120 {
			g.nearEgg = e
		}
	}
	g.nearPortal = dist(g.px, g.py, portalX, portalY+40) < 130
	g.nearGate = dist(g.px, g.py, gateX, gateY+40) < 130
	if canAct && inpututil.IsKeyJustPressed(ebiten.KeyE) {
		switch {
		case g.nearEgg != nil:
			g.tryHatch(g.nearEgg, false)
		case g.nearPortal:
			g.openPanel(PanelRebirth)
		case g.nearGate:
			g.openPanel(PanelWorlds)
		}
	}
	if g.autoHatch != nil && g.hatch == nil {
		if g.nearEgg != g.autoHatch {
			g.autoHatch = nil
		} else {
			g.autoHatchT -= dt
			if g.autoHatchT <= 0 {
				g.tryHatch(g.autoHatch, true)
				g.autoHatchT = 0.15
			}
		}
	}
	if g.hatch != nil {
		g.updateHatch()
	}

	// clics dans le monde
	if canAct && g.ui.click && !g.ui.block && !g.ui.used {
		mx, my := g.toWorld(g.ui.mx, g.ui.my)
		if p := g.pileAt(mx, my); p != nil {
			g.tapPile(p)
		} else if e := g.eggAt(mx, my); e != nil {
			if g.nearEgg == e {
				g.tryHatch(e, false)
			} else {
				g.moving, g.mvx, g.mvy = true, e.X, e.Y+60
			}
		} else {
			g.moving, g.mvx, g.mvy = true, mx, my
		}
	}
	if g.comboT > 0 {
		g.comboT -= dt
		if g.comboT <= 0 {
			g.combo = 0
		}
	}
}

func (g *Game) handleShortcuts() {
	keys := map[ebiten.Key]PanelID{ebiten.KeyP: PanelPets, ebiten.KeyI: PanelIndex, ebiten.KeyB: PanelShop,
		ebiten.KeyJ: PanelQuests, ebiten.KeyC: PanelWorlds, ebiten.KeyR: PanelRebirth, ebiten.KeyG: PanelGift}
	for k, p := range keys {
		if inpututil.IsKeyJustPressed(k) {
			g.openPanel(p)
		}
	}
	if inpututil.IsKeyJustPressed(ebiten.KeyEscape) {
		g.openPanel(PanelSettings)
	}
	if inpututil.IsKeyJustPressed(ebiten.KeyF) {
		g.s.AutoCollect = !g.s.AutoCollect
	}
}

func (g *Game) openPanel(p PanelID) {
	g.panel = p
	g.tab = 0
	g.scroll = 0
	g.audio.play("click", g.t)
}

func (g *Game) speed() float64 { return 300 * (1 + 0.08*float64(g.s.Upgrades["speed"])) }

func (g *Game) movePlayer() {
	dx, dy := 0.0, 0.0
	if ebiten.IsKeyPressed(ebiten.KeyW) || ebiten.IsKeyPressed(ebiten.KeyArrowUp) {
		dy--
	}
	if ebiten.IsKeyPressed(ebiten.KeyS) || ebiten.IsKeyPressed(ebiten.KeyArrowDown) {
		dy++
	}
	if ebiten.IsKeyPressed(ebiten.KeyA) || ebiten.IsKeyPressed(ebiten.KeyArrowLeft) {
		dx--
	}
	if ebiten.IsKeyPressed(ebiten.KeyD) || ebiten.IsKeyPressed(ebiten.KeyArrowRight) {
		dx++
	}
	if dx != 0 || dy != 0 {
		g.moving = false
	} else if g.moving {
		ddx, ddy := g.mvx-g.px, g.mvy-g.py
		d := math.Hypot(ddx, ddy)
		if d < 8 {
			g.moving = false
		} else {
			dx, dy = ddx/d, ddy/d
		}
	}
	l := math.Hypot(dx, dy)
	if l > 0 {
		sp := g.speed()
		g.px += dx / l * sp * dt
		g.py += dy / l * sp * dt
		g.walk += dt * 14
	} else {
		g.walk = 0
	}
	g.px = clamp(g.px, 60, mapW-60)
	g.py = clamp(g.py, 200, mapH-40)
}

func (g *Game) pileAt(x, y float64) *Pile {
	var best *Pile
	bd := 1e9
	for _, p := range g.piles {
		if p.Dead {
			continue
		}
		r := pileSize[p.Kind] * 0.55
		d := dist(x, y, p.X, p.Y-r*0.6)
		if d < r && d < bd {
			best, bd = p, d
		}
	}
	return best
}

func (g *Game) eggAt(x, y float64) *EggDef {
	for _, e := range worlds[g.s.World].Eggs {
		if math.Abs(x-e.X) < 80 && y > e.Y-140 && y < e.Y+50 {
			return e
		}
	}
	return nil
}

func (g *Game) tapPile(p *Pile) {
	g.focus = p
	for _, a := range g.actors {
		a.Target = p
	}
	if g.comboT > 0 {
		g.combo++
	} else {
		g.combo = 1
	}
	if g.combo > 50 {
		g.combo = 50
	}
	g.comboT = 0.9
	dmg := g.tapDamage() * (1 + 0.04*float64(g.combo-1))
	crit := g.rng.Float64() < g.critChance()
	if crit {
		dmg *= 3
	}
	g.s.Stats.Taps++
	if dmg > g.s.Stats.BestHit {
		g.s.Stats.BestHit = dmg
	}
	g.damagePile(p, dmg)
	g.audio.play("tap", g.t)
	if crit {
		g.addFloat(p.X+g.rng.Float64()*40-20, p.Y-pileSize[p.Kind], "CRIT ! -"+fmtNum(dmg), 30, orange)
	} else {
		g.addFloat(p.X+g.rng.Float64()*40-20, p.Y-pileSize[p.Kind], "-"+fmtNum(dmg), 22, white)
	}
	for i := 0; i < 4; i++ {
		g.burst(p.X, p.Y-pileSize[p.Kind]*0.4, worlds[g.s.World].PileCols[g.rng.Intn(len(worlds[g.s.World].PileCols))], 1)
	}
}

func (g *Game) damagePile(p *Pile, dmg float64) {
	if p.Dead {
		return
	}
	p.HP -= dmg
	p.Hit = 0.12
	if p.HP <= 0 {
		g.breakPile(p)
	}
}

func (g *Game) breakPile(p *Pile) {
	p.Dead = true
	g.s.Stats.Piles++
	value := p.MaxHP * g.coinPerHP() * g.coinMult()
	if p.Golden {
		value *= 5
	}
	n := 3 + p.Kind*3
	for i := 0; i < n; i++ {
		a := g.rng.Float64() * 2 * math.Pi
		sp := 120 + g.rng.Float64()*180
		g.orbs = append(g.orbs, &Orb{X: p.X, Y: p.Y - 30, VX: math.Cos(a) * sp, VY: math.Sin(a)*sp - 120, Amount: value / float64(n)})
	}
	if p.Kind == 2 && g.rng.Float64() < 0.25 {
		gems := float64(1 + g.rng.Intn(3))
		g.orbs = append(g.orbs, &Orb{X: p.X, Y: p.Y - 30, VX: 0, VY: -260, Amount: gems, Gem: true})
	}
	cols := worlds[g.s.World].PileCols
	for i := 0; i < 14; i++ {
		g.burst(p.X, p.Y-30, cols[g.rng.Intn(len(cols))], 1.6)
	}
	g.audio.play("pop", g.t)
	if g.focus == p {
		g.focus = nil
	}
}

func (g *Game) burst(x, y float64, c color.RGBA, power float64) {
	a := g.rng.Float64() * 2 * math.Pi
	sp := (80 + g.rng.Float64()*200) * power
	g.parts = append(g.parts, &Particle{X: x, Y: y, VX: math.Cos(a) * sp, VY: math.Sin(a)*sp - 150*power, Life: 0.5 + g.rng.Float64()*0.4, R: 4 + g.rng.Float64()*4, Col: c, Rot: g.rng.Float64() * 6})
}

func (g *Game) addFloat(x, y float64, s string, size float64, c color.RGBA) {
	g.floats = append(g.floats, &Floater{X: x, Y: y, Text: s, Size: size, Col: c})
}

func (g *Game) updatePets() {
	n := len(g.actors)
	if n == 0 {
		return
	}
	for _, p := range g.piles {
		p.Attackers = 0
	}
	for _, a := range g.actors {
		if a.Target != nil && !a.Target.Dead {
			a.Target.Attackers++
		}
	}
	mult := g.damageMult()
	for _, a := range g.actors {
		op := g.s.pet(a.UID)
		if op == nil {
			continue
		}
		if a.Target != nil && (a.Target.Dead || dist(a.Target.X, a.Target.Y, g.px, g.py) > 700) {
			a.Target = nil
		}
		if a.Target == nil && g.focus != nil && !g.focus.Dead {
			a.Target = g.focus
			g.focus.Attackers++
		}
		if a.Target == nil && g.s.AutoCollect {
			a.Target = g.autoTarget()
			if a.Target != nil {
				a.Target.Attackers++
			}
		}
		var tx, ty float64
		a.Atk = false
		if a.Target != nil {
			ang := float64(a.Slot)/float64(n)*2*math.Pi + g.t*0.3
			r := pileSize[a.Target.Kind]*0.45 + 12
			tx, ty = a.Target.X+math.Cos(ang)*r, a.Target.Y+math.Sin(ang)*r*0.45+4
		} else {
			// formation en arc derrière le joueur, sur deux rangées si besoin
			row := a.Slot / 6
			inRow := n - row*6
			if inRow > 6 {
				inRow = 6
			}
			col := float64(a.Slot%6) - float64(inRow-1)/2
			tx = g.px + col*56
			ty = g.py + 34 + float64(row)*46 + math.Abs(col)*8
		}
		dx, dy := tx-a.X, ty-a.Y
		d := math.Hypot(dx, dy)
		sp := 520.0
		if d > 600 {
			sp = 1400
		}
		if d > 6 {
			step := math.Min(d, sp*dt)
			a.X += dx / d * step
			a.Y += dy / d * step
			a.Hop += dt * 12
		} else if a.Target != nil {
			a.Atk = true
			a.Hop += dt * 16
			dmg := g.petPower(op) * mult * dt
			g.damagePile(a.Target, dmg)
			// expérience : un niveau toutes les 25 s + 15 s par niveau d'attaque
			if op.Level < 25 {
				op.XP += dt
				need := 25 + 15*float64(op.Level)
				if op.XP >= need {
					op.XP -= need
					op.Level++
					g.addFloat(a.X, a.Y-60, "Niveau "+itoa(op.Level)+" !", 22, mint)
					g.audio.play("levelup", g.t)
				}
			}
		} else {
			a.Hop = 0
		}
	}
}

func (g *Game) autoTarget() *Pile {
	var best *Pile
	bd := 480.0
	for _, p := range g.piles {
		if p.Dead || p.Attackers >= 2 {
			continue
		}
		d := dist(p.X, p.Y, g.px, g.py)
		if d < bd {
			best, bd = p, d
		}
	}
	return best
}

func (g *Game) updatePiles() {
	alive := g.piles[:0]
	for _, p := range g.piles {
		if !p.Dead {
			if p.Hit > 0 {
				p.Hit -= dt
			}
			alive = append(alive, p)
		}
	}
	g.piles = alive
	g.spawnT -= dt
	if len(g.piles) < 30 && g.spawnT <= 0 {
		g.spawnPile()
		g.spawnT = 0.5
	}
}

func (g *Game) updateFX() {
	keep := g.orbs[:0]
	for _, o := range g.orbs {
		o.T += dt
		if o.T < 0.35 {
			o.X += o.VX * dt
			o.Y += o.VY * dt
			o.VX *= 0.92
			o.VY = o.VY*0.92 + 600*dt
		} else {
			dx, dy := g.px-o.X, g.py-50-o.Y
			d := math.Hypot(dx, dy)
			sp := 500 + (o.T-0.35)*1800
			if d < 24 {
				if o.Gem {
					g.s.Gems += o.Amount
					g.addFloat(g.px, g.py-160, "+"+fmtNum(o.Amount)+" gemmes", 26, sky)
				} else {
					g.addCoins(o.Amount, true)
					g.pickup += o.Amount
				}
				g.audio.play("coin", g.t)
				continue
			}
			o.X += dx / d * math.Min(d, sp*dt)
			o.Y += dy / d * math.Min(d, sp*dt)
		}
		keep = append(keep, o)
	}
	g.orbs = keep

	// les gains sont regroupés en un seul « +X » toutes les 0,4 s
	g.pickupT -= dt
	if g.pickup > 0 && g.pickupT <= 0 {
		g.addFloat(g.px+g.rng.Float64()*50-25, g.py-135, "+"+fmtNum(g.pickup), 24, yellow)
		g.pickup = 0
		g.pickupT = 0.4
	}
	kf := g.floats[:0]
	for _, f := range g.floats {
		f.T += dt
		f.Y -= 50 * dt
		if f.T < 1.1 {
			kf = append(kf, f)
		}
	}
	g.floats = kf
	if len(g.floats) > 40 {
		g.floats = g.floats[len(g.floats)-40:]
	}

	kp := g.parts[:0]
	for _, p := range g.parts {
		p.T += dt
		p.X += p.VX * dt
		p.Y += p.VY * dt
		p.VY += 700 * dt
		p.Rot += dt * 8
		if p.T < p.Life {
			kp = append(kp, p)
		}
	}
	g.parts = kp
}

// ---------- rendu du monde ----------

type drawable struct {
	y float64
	f func()
}

func sortDrawables(ds []drawable) {
	sort.SliceStable(ds, func(i, j int) bool { return ds[i].y < ds[j].y })
}

func (g *Game) drawWorld(dst *ebiten.Image) {
	w := worlds[g.s.World]
	dst.Fill(w.Edge)
	// sol en damier
	const tile = 120.0
	x0, y0 := g.toScreen(0, 0)
	fillRect(dst, x0, y0, mapW, mapH, w.Ground)
	startX := math.Floor((g.camX-ScreenW/2)/tile) * tile
	startY := math.Floor((g.camY-ScreenH/2)/tile) * tile
	for ty := startY; ty < g.camY+ScreenH/2+tile; ty += tile {
		for tx := startX; tx < g.camX+ScreenW/2+tile; tx += tile {
			if tx < 0 || ty < 0 || tx >= mapW || ty >= mapH {
				continue
			}
			if (int(tx/tile)+int(ty/tile))%2 == 0 {
				sx, sy := g.toScreen(tx, ty)
				fillRect(dst, sx, sy, tile, tile, w.Ground2)
			}
		}
	}
	// bordure de la carte
	bx, by := g.toScreen(0, 0)
	rrectC(dst, bx-4, by-4, mapW+8, mapH+8, 30, nil, 10, ink)

	// place centrale
	px, py := g.toScreen(300, 300)
	rrect(dst, px, py, 1800, 320, 60, w.Plaza, 5)
	// champs
	for _, f := range fields {
		fx, fy := g.toScreen(f.X-30, f.Y-30)
		rrectC(dst, fx, fy, f.W+60, f.H+60, 50, alpha(white, 0.18), 4, alpha(ink, 0.25))
	}
	// allée
	ax, ay := g.toScreen(1140, 620)
	rrect(dst, ax, ay, 120, 180, 0, w.Plaza, 0)

	var ds []drawable
	for i := range g.decor {
		d := g.decor[i]
		ds = append(ds, drawable{d.Y, func() {
			sx, sy := g.toScreen(d.X, d.Y)
			if sx < -150 || sx > ScreenW+150 || sy < -50 || sy > ScreenH+300 {
				return
			}
			blit(dst, decorSprite(w.Theme, d.Kind), sx, sy+10, d.Scale)
		}})
	}
	for _, p := range g.piles {
		p := p
		ds = append(ds, drawable{p.Y, func() { g.drawPile(dst, p) }})
	}
	for _, e := range w.Eggs {
		e := e
		ds = append(ds, drawable{e.Y + 40, func() { g.drawEggStand(dst, e) }})
	}
	ds = append(ds, drawable{portalY + 60, func() { g.drawPortal(dst) }})
	ds = append(ds, drawable{gateY + 60, func() { g.drawGate(dst) }})
	ds = append(ds, drawable{g.py, func() {
		sx, sy := g.toScreen(g.px, g.py)
		drawAvatar(dst, sx, sy, 110, hexc("#3DD68C"), ink, g.walk, false)
	}})
	for _, a := range g.actors {
		a := a
		ds = append(ds, drawable{a.Y, func() {
			op := g.s.pet(a.UID)
			if op == nil {
				return
			}
			sx, sy := g.toScreen(a.X, a.Y)
			hop := math.Abs(math.Sin(a.Hop)) * 10
			if a.Atk {
				hop = math.Abs(math.Sin(a.Hop)) * 16
			}
			ellipse(dst, sx, sy, 18, 5, 0, alpha(ink, 0.15), 0)
			drawPet(dst, op, sx, sy-hop, 58, g.t+float64(a.Slot))
		}})
	}
	sortDrawables(ds)
	for _, d := range ds {
		d.f()
	}

	// cible verrouillée
	if g.focus != nil && !g.focus.Dead {
		sx, sy := g.toScreen(g.focus.X, g.focus.Y)
		ellipse(dst, sx, sy+2, pileSize[g.focus.Kind]*0.6, 16, 0, nil, 0)
		shape(dst, pathEllipse(sx, sy+2, pileSize[g.focus.Kind]*0.6, 16, 0), nil, 3, alpha(yellow, 0.9))
	}

	for _, o := range g.orbs {
		sx, sy := g.toScreen(o.X, o.Y)
		if o.Gem {
			gemIcon(dst, sx, sy, 26)
		} else {
			coinIcon(dst, sx, sy, 20)
		}
	}
	for _, p := range g.parts {
		sx, sy := g.toScreen(p.X, p.Y)
		a := 1 - p.T/p.Life
		rrect(dst, sx-p.R, sy-p.R*0.5, p.R*2, p.R, p.R*0.5, alpha(p.Col, a), 0)
	}
	for _, f := range g.floats {
		sx, sy := g.toScreen(f.X, f.Y)
		a := clamp(1.6-f.T*1.5, 0, 1)
		sc := 1.0
		if f.T < 0.12 {
			sc = 0.6 + f.T/0.12*0.4
		}
		txtO(dst, f.Text, sx, sy, f.Size*sc, alpha(f.Col, a), AC, 3*a)
	}

	// invite d'interaction
	if g.hatch == nil {
		switch {
		case g.nearEgg != nil:
			e := g.nearEgg
			label := "Ouvrir · " + fmtNum(e.Price)
			if g.s.Passes["triple"] && g.s.Coins >= e.Price*3 {
				label = "Ouvrir x3 · " + fmtNum(e.Price*3)
			}
			g.drawPrompt(dst, e.X, e.Y-175, label)
		case g.nearPortal:
			g.drawPrompt(dst, portalX, portalY-200, "Rebirth")
		case g.nearGate:
			g.drawPrompt(dst, gateX, gateY-200, "Voyager")
		}
	}
}

func (g *Game) drawPrompt(dst *ebiten.Image, wx, wy float64, label string) {
	sx, sy := g.toScreen(wx, wy)
	w := txtW(label, 20, 700) + 62
	box(dst, sx-w/2, sy-21, w, 42, 21, white, alpha(ink, 0.3), 4)
	rrect(dst, sx-w/2+8, sy-14, 28, 28, 8, yellow, 3)
	txtB(dst, "E", sx-w/2+22, sy-1, 17, ink, AC)
	txtB(dst, label, sx-w/2+46, sy-1, 20, ink, AL)
}

func (g *Game) drawPile(dst *ebiten.Image, p *Pile) {
	sx, sy := g.toScreen(p.X, p.Y)
	if sx < -120 || sx > ScreenW+120 || sy < -40 || sy > ScreenH+160 {
		return
	}
	sc := pileSize[p.Kind] / 140
	if p.Hit > 0 {
		sc *= 1 + p.Hit*0.8
	}
	blit(dst, pileSprite(worlds[g.s.World], p.Kind, p.Variant, p.Golden), sx, sy+12*sc, sc)
	if p.HP < p.MaxHP {
		bw := pileSize[p.Kind] * 0.9
		y := sy - pileSize[p.Kind]*0.95 - 10
		rrect(dst, sx-bw/2, y, bw, 12, 6, white, 3)
		f := clamp(p.HP/p.MaxHP, 0, 1)
		if f > 0.02 {
			rrect(dst, sx-bw/2+2, y+2, (bw-4)*f, 8, 4, green, 0)
		}
	}
}

func (g *Game) drawEggStand(dst *ebiten.Image, e *EggDef) {
	sx, sy := g.toScreen(e.X, e.Y)
	if sx < -200 || sx > ScreenW+200 {
		return
	}
	near := g.nearEgg == e
	if near {
		circle(dst, sx, sy-60, 80+3*math.Sin(g.t*4), alpha(hexc("#FFF3B8"), 0.8), 0)
	}
	bob := math.Sin(g.t*2+e.X) * 4
	blit(dst, eggSprite(e), sx, sy-10+bob, 1)
	box(dst, sx-85, sy-14, 170, 74, 18, white, alpha(ink, 0.3), 5)
	txtB(dst, e.Name, sx, sy+10, 22, ink, AC)
	coinIcon(dst, sx-txtW(fmtNum(e.Price), 19, 700)/2-12, sy+38, 22)
	col := ink
	if g.s.Coins < e.Price {
		col = hexc("#C2185B")
	}
	txtB(dst, fmtNum(e.Price), sx+12, sy+37, 19, col, AC)
}

func (g *Game) drawPortal(dst *ebiten.Image) {
	sx, sy := g.toScreen(portalX, portalY)
	if sx < -250 || sx > ScreenW+250 {
		return
	}
	rrect(dst, sx-100, sy-210, 200, 250, 100, hexc("#6B5BD6"), 6)
	for i := 0; i < 5; i++ {
		r := 80 - float64(i)*14
		c := hsv(260+float64(i)*18+g.t*40, 0.45, 1)
		circle(dst, sx, sy-100, r+3*math.Sin(g.t*3+float64(i)), c, 0)
	}
	for i := 0; i < 6; i++ {
		a := g.t*1.5 + float64(i)*math.Pi/3
		star(dst, sx+math.Cos(a)*60, sy-100+math.Sin(a)*60, 9, 0.45, a, white, 0)
	}
	box(dst, sx-80, sy+10, 160, 44, 16, yellow, hexc("#F2A900"), 4)
	txtB(dst, "REBIRTH "+itoa(g.s.Rebirths+1), sx, sy+31, 20, ink, AC)
}

func (g *Game) drawGate(dst *ebiten.Image) {
	sx, sy := g.toScreen(gateX, gateY)
	if sx < -250 || sx > ScreenW+250 {
		return
	}
	next := g.s.World + 1
	rrect(dst, sx-110, sy-220, 30, 260, 10, white, 5)
	rrect(dst, sx+80, sy-220, 30, 260, 10, white, 5)
	rrect(dst, sx-120, sy-240, 240, 50, 20, mint, 5)
	txtB(dst, "MONDES", sx, sy-215, 24, ink, AC)
	inner := hexc("#BDE9FF")
	if next < len(worlds) {
		inner = worlds[next].Ground
	}
	rrect(dst, sx-78, sy-188, 156, 226, 16, alpha(inner, 0.85), 0)
	label := "Tous les mondes"
	if next < len(worlds) {
		if next > g.s.MaxWorld {
			label = worlds[next].Name
			drawIcon(dst, "lock", sx, sy-110, 50)
		} else {
			label = worlds[next].Name
		}
	}
	box(dst, sx-100, sy+10, 200, 44, 16, white, alpha(ink, 0.3), 4)
	txtB(dst, label, sx, sy+31, 18, ink, AC)
}
