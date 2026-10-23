package main

import (
	"math"

	"github.com/hajimehoshi/ebiten/v2"
)

const (
	arenaW = 1600.0
	arenaH = 800.0
	golemX = 800.0
	golemY = 520.0
)

type BossFight struct {
	HP, MaxHP      float64
	Left           float64
	WeakA          float64
	WeakT          float64
	SlamT          float64
	SlamX, SlamY   float64
	Warn           float64
	Stun           float64
	Hit            float64
	Done           bool
	Win            bool
	DPS            float64
	savedX, savedY float64
}

func (g *Game) startBoss() {
	dps := math.Max(g.teamDPS(), 10)
	hp := dps*55 + g.tapDamage()*60
	g.boss = &BossFight{HP: hp, MaxHP: hp, Left: 90, WeakT: 4, SlamT: 6, DPS: dps, savedX: g.px, savedY: g.py}
	g.bossAvail = 0
	g.scene = SceneBoss
	g.px, g.py = golemX, 720
	g.orbs, g.floats, g.parts = nil, nil, nil
	g.camX, g.camY = g.bossCam()
	g.focus = nil
	for _, a := range g.actors {
		a.Target = nil
		a.X, a.Y = g.px, g.py+30
	}
	g.audio.play("boss", g.t)
}

// La caméra garde le golem et le joueur à l'écran.
func (g *Game) bossCam() (float64, float64) {
	x := clamp((g.px+golemX)/2, ScreenW/2, arenaW-ScreenW/2)
	return x, clamp(golemY-94, ScreenH/2, arenaH-ScreenH/2)
}

func (g *Game) weakPoint() (float64, float64) {
	b := g.boss
	return golemX + math.Cos(b.WeakA)*90, golemY - 150 + math.Sin(b.WeakA)*55
}

func (g *Game) updateBoss() {
	b := g.boss
	u := &g.ui
	g.buildBossHUD()
	g.buildOverlays()

	if !b.Done {
		b.Left -= dt
		if b.Stun > 0 {
			b.Stun -= dt
		} else if g.popup == nil {
			g.movePlayerArena()
		}
		// point faible qui se déplace
		b.WeakT -= dt
		if b.WeakT <= 0 {
			b.WeakA = g.rng.Float64() * 2 * math.Pi
			b.WeakT = 4
		}
		// attaque « écrasement »
		b.SlamT -= dt
		if b.SlamT <= 0 && b.Warn <= 0 {
			b.SlamX, b.SlamY = g.px, g.py
			b.Warn = 1.4
		}
		if b.Warn > 0 {
			b.Warn -= dt
			if b.Warn <= 0 {
				b.SlamT = 5 + g.rng.Float64()*2
				g.shake = 0.8
				g.audio.play("slam", g.t)
				if dist(g.px, g.py, b.SlamX, b.SlamY) < 130 {
					b.Stun = 2
					g.combo = 0
					g.addFloat(g.px, g.py-150, "Étourdi !", 30, red)
				}
				for i := 0; i < 20; i++ {
					g.burst(b.SlamX, b.SlamY, hexc("#6FD66F"), 1.4)
				}
			}
		}
		// les pets attaquent
		mult := g.damageMult()
		n := len(g.actors)
		for _, a := range g.actors {
			op := g.s.pet(a.UID)
			if op == nil {
				continue
			}
			ang := math.Pi*0.1 + float64(a.Slot)/math.Max(1, float64(n-1))*math.Pi*0.8
			if n == 1 {
				ang = math.Pi / 2
			}
			tx, ty := golemX+math.Cos(ang)*210, golemY+20+math.Sin(ang)*90
			dx, dy := tx-a.X, ty-a.Y
			d := math.Hypot(dx, dy)
			a.Atk = d < 8
			if d > 6 {
				a.X += dx / d * math.Min(d, 600*dt)
				a.Y += dy / d * math.Min(d, 600*dt)
				a.Hop += dt * 12
			} else {
				a.Hop += dt * 16
				g.hitBoss(g.petPower(op) * mult * dt)
			}
		}
		// clics sur le golem
		if u.click && !u.used && !u.block && g.popup == nil {
			mx, my := g.toWorld(u.mx, u.my)
			wx, wy := g.weakPoint()
			if b.Stun > 0 {
				g.audio.play("error", g.t)
			} else if dist(mx, my, wx, wy) < 34 {
				g.tapBoss(mx, my, true)
			} else if math.Abs(mx-golemX) < 150 && my > golemY-300 && my < golemY+40 {
				g.tapBoss(mx, my, false)
			}
		}
		if b.HP <= 0 {
			g.endBoss(true)
		} else if b.Left <= 0 {
			g.endBoss(false)
		}
	}
	if g.comboT > 0 {
		g.comboT -= dt
		if g.comboT <= 0 {
			g.combo = 0
		}
	}
	if b.Hit > 0 {
		b.Hit -= dt
	}
	if g.shake > 0 {
		g.shake -= dt * 2
	}
	g.updateFX()
	cx, cy := g.bossCam()
	g.camX = lerp(g.camX, cx, 0.12)
	g.camY = lerp(g.camY, cy, 0.12)
}

func (g *Game) movePlayerArena() {
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
	if l := math.Hypot(dx, dy); l > 0 {
		g.px += dx / l * g.speed() * dt
		g.py += dy / l * g.speed() * dt
		g.walk += dt * 14
	} else {
		g.walk = 0
	}
	g.px = clamp(g.px, 80, arenaW-80)
	g.py = clamp(g.py, golemY+110, arenaH-30)
}

func (g *Game) hitBoss(d float64) {
	b := g.boss
	b.HP -= d
	b.Hit = 0.1
}

func (g *Game) tapBoss(x, y float64, weak bool) {
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
	if weak {
		dmg *= 3
	}
	if crit {
		dmg *= 3
	}
	g.s.Stats.Taps++
	g.hitBoss(dmg)
	g.audio.play("boss", g.t)
	label := "-" + fmtNum(dmg)
	col := white
	size := 24.0
	if weak {
		label = "POINT FAIBLE ! " + label
		col = yellow
		size = 30
	} else if crit {
		label = "CRIT ! " + label
		col = orange
		size = 30
	}
	g.addFloat(x, y-20, label, size, col)
	for i := 0; i < 5; i++ {
		g.burst(x, y, hexc("#6FD66F"), 1)
	}
}

func (g *Game) endBoss(win bool) {
	b := g.boss
	b.Done = true
	b.Win = win
	s := g.s
	s.BossTimer = 600
	var body string
	coins := 0.0
	gems := 0.0
	if win {
		s.Stats.Bosses++
		s.BossWins++
		coins = math.Max(1000, g.estimatedCPS()*90)
		gems = float64(15 + 5*s.Rebirths)
		body = "Tu gagnes " + fmtNum(coins) + " pièces et " + fmtNum(gems) + " gemmes."
		if s.BossWins == 1 || g.rng.Float64() < 0.2 {
			best := 0.0
			for _, p := range s.Pets {
				best = math.Max(best, g.petPower(p))
			}
			op := s.addPet(golemDef.ID, 0, g.rng.Float64() < 0.1)
			op.Bonus = math.Max(50, best*2.5)
			body += " Et le Gummy Golem rejoint ton équipe (puissance " + fmtNum(g.petPower(op)) + ") !"
			if s.equippedCount() < s.slots() {
				op.Equip = true
			}
		}
		g.audio.play("legend", g.t)
	} else {
		frac := clamp(1-b.HP/b.MaxHP, 0, 1)
		coins = math.Floor(math.Max(200, g.estimatedCPS()*30) * frac)
		body = "Le golem s'est enfui… Tu récupères " + fmtNum(coins) + " pièces pour tes efforts. Améliore tes pets et reviens !"
	}
	title := "VICTOIRE !"
	if !win {
		title = "Temps écoulé"
	}
	g.popup = &Popup{Title: title, Body: body, Btn: "Retour", OnOK: func() {
		g.addCoins(coins, false)
		s.Gems += gems
		g.scene = ScenePlay
		g.boss = nil
		g.px, g.py = b.savedX, b.savedY
		g.orbs, g.floats, g.parts = nil, nil, nil
		g.syncActors()
		g.updateCamera(true)
		g.combo = 0
	}}
}

func (g *Game) buildBossHUD() {
	u := &g.ui
	u.layer = 0
	b := g.boss
	u.draw(func(dst *ebiten.Image) {
		r := Rect{ScreenW/2 - 300, 14, 600, 84}
		box(dst, r.X, r.Y, r.W, r.H, 24, cream, alpha(ink, 0.4), 4)
		txtB(dst, "GUMMY GOLEM", r.CX(), r.Y+22, 26, ink, AC)
		progressBar(dst, r.X+20, r.Y+42, r.W-40, 30, b.HP/b.MaxHP, red)
		txtB(dst, fmtNum(math.Max(0, b.HP))+" / "+fmtNum(b.MaxHP), r.CX(), r.Y+57, 16, ink, AC)
		tr := Rect{ScreenW - 220, 18, 200, 48}
		box(dst, tr.X, tr.Y, tr.W, tr.H, 20, white, alpha(ink, 0.3), 4)
		txtB(dst, "Temps "+fmtTime(b.Left), tr.CX(), tr.CY()-1, 22, ink, AC)
		tip := "Clique le point faible (x3) · Esquive la zone rouge avec ZQSD"
		wd := txtW(tip, 18, 600) + 40
		box(dst, ScreenW/2-wd/2, ScreenH-62, wd, 44, 20, white, alpha(ink, 0.3), 4)
		txt(dst, tip, ScreenW/2, ScreenH-41, 18, ink, AC)
		if g.combo > 1 {
			txtO(dst, "COMBO x"+itoa(g.combo), ScreenW/2, ScreenH-100, 28, orange, AC, 3)
		}
		if b.Stun > 0 {
			txtO(dst, "ÉTOURDI", ScreenW/2, ScreenH/2-200, 44, red, AC, 4)
		}
	})
	u.surface(Rect{ScreenW/2 - 300, 14, 600, 84})
}

func (g *Game) drawBoss(dst *ebiten.Image) {
	b := g.boss
	dst.Fill(hexc("#1B1630"))
	x0, y0 := g.toScreen(0, 0)
	fillRect(dst, x0, y0, arenaW, arenaH, hexc("#3B2F6B"))
	// dalles de l'arène
	for i := 0; i < 8; i++ {
		ellipse(dst, x0+golemX, y0+golemY+60, 700-float64(i)*80, 300-float64(i)*34, 0, alpha(hexc("#6B5BD6"), 0.12), 0)
	}
	rrectC(dst, x0-4, y0-4, arenaW+8, arenaH+8, 30, nil, 10, ink)
	for i := 0; i < 14; i++ {
		x := x0 + 60 + float64(i)*115
		star(dst, x, y0+40+math.Sin(float64(i))*20, 6, 0.45, 0, alpha(white, 0.6), 0)
	}

	// zone d'impact
	if b.Warn > 0 {
		sx, sy := g.toScreen(b.SlamX, b.SlamY)
		f := 1 - b.Warn/1.4
		ellipse(dst, sx, sy, 130, 60, 0, alpha(red, 0.18+0.2*f), 0)
		shape(dst, pathEllipse(sx, sy, 130*f, 60*f, 0), alpha(red, 0.35), 0, nil)
		shape(dst, pathEllipse(sx, sy, 130, 60, 0), nil, 4, alpha(red, 0.9))
		txtO(dst, "!", sx, sy-10, 40, red, AC, 4)
	}

	var ds []drawable
	ds = append(ds, drawable{golemY + 40, func() {
		sx, sy := g.toScreen(golemX, golemY+40)
		sc := 1.0
		if b.Hit > 0 {
			sc = 1.03
		}
		lift := 0.0
		if b.Warn > 0 {
			lift = (1 - b.Warn/1.4) * 60
		}
		ellipse(dst, sx, sy, 200, 40, 0, alpha(ink, 0.3), 0)
		blit(dst, petSprite(golemDef, 0, false), sx, sy-lift, 2.4*sc)
		wx, wy := g.weakPoint()
		wsx, wsy := g.toScreen(wx, wy-lift)
		p := 0.5 + 0.5*math.Sin(g.t*8)
		circle(dst, wsx, wsy, 30+p*6, alpha(yellow, 0.35), 0)
		circle(dst, wsx, wsy, 20, yellow, 4)
		circle(dst, wsx, wsy, 8, red, 0)
	}})
	ds = append(ds, drawable{g.py, func() {
		sx, sy := g.toScreen(g.px, g.py)
		drawAvatar(dst, sx, sy, 110, hexc("#3DD68C"), ink, g.walk, b.Stun <= 0 && g.combo > 3)
		if b.Stun > 0 {
			for i := 0; i < 3; i++ {
				a := g.t*5 + float64(i)*2.1
				star(dst, sx+math.Cos(a)*30, sy-125+math.Sin(a)*8, 8, 0.45, a, yellow, 2)
			}
		}
	}})
	for _, a := range g.actors {
		a := a
		ds = append(ds, drawable{a.Y, func() {
			op := g.s.pet(a.UID)
			if op == nil {
				return
			}
			sx, sy := g.toScreen(a.X, a.Y)
			hop := math.Abs(math.Sin(a.Hop)) * 14
			ellipse(dst, sx, sy, 18, 5, 0, alpha(ink, 0.2), 0)
			drawPet(dst, op, sx, sy-hop, 58, g.t+float64(a.Slot))
		}})
	}
	sortDrawables(ds)
	for _, d := range ds {
		d.f()
	}
	for _, p := range g.parts {
		sx, sy := g.toScreen(p.X, p.Y)
		a := 1 - p.T/p.Life
		rrect(dst, sx-p.R, sy-p.R*0.5, p.R*2, p.R, p.R*0.5, alpha(p.Col, a), 0)
	}
	for _, f := range g.floats {
		sx, sy := g.toScreen(f.X, f.Y)
		a := clamp(1.6-f.T*1.5, 0, 1)
		txtO(dst, f.Text, sx, sy, f.Size, alpha(f.Col, a), AC, 3*a)
	}
}
