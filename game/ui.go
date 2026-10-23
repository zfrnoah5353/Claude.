package main

import (
	"image"
	"image/color"
	"math"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
)

// ---------- interface en mode immédiat ----------
// Pendant Update on construit l'interface : chaque élément enregistre une
// commande de dessin et peut tester un clic. Draw rejoue ensuite les commandes.

type uiCmd struct {
	clip *Rect
	f    func(dst *ebiten.Image)
}

type UI struct {
	cmds    []uiCmd
	layer   int
	top     int
	mx, my  float64
	click   bool
	down    bool
	used    bool
	block   bool
	clip    *Rect
	wheel   float64
	pointer bool
}

func (u *UI) begin(top int) {
	u.cmds = u.cmds[:0]
	u.layer, u.top = 0, top
	x, y := ebiten.CursorPosition()
	u.mx, u.my = (float64(x)-viewOX)/viewK, (float64(y)-viewOY)/viewK
	u.click = inpututil.IsMouseButtonJustPressed(ebiten.MouseButtonLeft)
	u.down = ebiten.IsMouseButtonPressed(ebiten.MouseButtonLeft)
	u.used, u.block, u.pointer = false, false, false
	u.clip = nil
	_, u.wheel = ebiten.Wheel()
}

func (u *UI) draw(f func(dst *ebiten.Image)) { u.cmds = append(u.cmds, uiCmd{u.clip, f}) }

func (u *UI) hover(r Rect) bool {
	if u.layer != u.top {
		return false
	}
	if u.clip != nil && !u.clip.In(u.mx, u.my) {
		return false
	}
	return r.In(u.mx, u.my)
}

// surface : zone opaque qui empêche les clics d'atteindre le monde.
func (u *UI) surface(r Rect) {
	if u.hover(r) {
		u.block = true
	}
}

func (u *UI) hit(r Rect) bool {
	if u.hover(r) {
		u.block = true
		u.pointer = true
		if u.click && !u.used {
			u.used = true
			return true
		}
	}
	return false
}

func (u *UI) render(dst *ebiten.Image) {
	for _, c := range u.cmds {
		d := dst
		if c.clip != nil {
			r := c.clip
			d = dst.SubImage(image.Rect(int(r.X*S), int(r.Y*S), int((r.X+r.W)*S), int((r.Y+r.H)*S))).(*ebiten.Image)
		}
		c.f(d)
	}
}

// ---------- widgets ----------

func (g *Game) button(r Rect, label string, fill color.RGBA, enabled bool) bool {
	u := &g.ui
	h := u.hover(r)
	clicked := u.hit(r)
	if clicked && !enabled {
		g.audio.play("error", g.t)
		clicked = false
	}
	f, sh := fill, darken(fill, 0.3)
	if !enabled {
		f, sh = grayBtn, hexc("#B3AED0")
	} else if h {
		f = lighten(f, 0.12)
	}
	dy := 0.0
	if h && u.down && enabled {
		dy = 3
	}
	size := math.Min(r.H*0.44, 44)
	u.draw(func(dst *ebiten.Image) {
		box(dst, r.X, r.Y+dy, r.W, r.H, math.Min(r.H*0.36, 18), f, sh, 4)
		if enabled {
			txtO(dst, label, r.CX(), r.CY()+dy-1, size, white, AC, 3)
		} else {
			txtB(dst, label, r.CX(), r.CY()+dy-1, size, hexc("#6E6890"), AC)
		}
	})
	if clicked {
		g.audio.play("click", g.t)
	}
	return clicked
}

func (g *Game) iconButton(x, y float64, icon, label string, fill color.RGBA, badge string) bool {
	u := &g.ui
	r := Rect{x, y, 64, 64}
	h := u.hover(r)
	clicked := u.hit(r)
	f := fill
	if h {
		f = lighten(f, 0.15)
	}
	dy := 0.0
	if h && u.down {
		dy = 3
	}
	u.draw(func(dst *ebiten.Image) {
		box(dst, r.X, r.Y+dy, r.W, r.H, 18, f, darken(fill, 0.3), 4)
		drawIcon(dst, icon, r.CX(), r.CY()+dy, 36)
		txtO(dst, label, r.CX(), r.Y+r.H+14, 14, white, AC, 3)
		if badge != "" {
			bw := math.Max(26, txtW(badge, 14, 700)+12)
			rrect(dst, r.X+r.W-bw/2-4, r.Y-10, bw, 26, 13, hexc("#D81E4A"), 3)
			txtB(dst, badge, r.X+r.W-4, r.Y+2, 14, white, AC)
		}
	})
	if clicked {
		g.audio.play("click", g.t)
	}
	return clicked
}

func (g *Game) toggle(r Rect, on bool) bool {
	u := &g.ui
	clicked := u.hit(r)
	u.draw(func(dst *ebiten.Image) {
		c := grayBtn
		if on {
			c = green
		}
		rrect(dst, r.X, r.Y, r.W, r.H, r.H/2, c, 3)
		kx := r.X + r.H/2
		if on {
			kx = r.X + r.W - r.H/2
		}
		circle(dst, kx, r.CY(), r.H/2-5, white, 3)
	})
	return clicked
}

func (g *Game) pill(x, y float64, icon string, value string) Rect {
	w := txtW(value, 24, 700) + 66
	r := Rect{x, y, w, 46}
	g.ui.surface(r)
	g.ui.draw(func(dst *ebiten.Image) {
		box(dst, r.X, r.Y, r.W, r.H, 23, cream, alpha(ink, 0.35), 4)
		drawIcon(dst, icon, r.X+24, r.CY(), 32)
		txtB(dst, value, r.X+46, r.CY()-1, 24, ink, AL)
	})
	return r
}

func progressBar(dst *ebiten.Image, x, y, w, h, f float64, c color.RGBA) {
	rrect(dst, x, y, w, h, h/2, white, 3)
	f = clamp(f, 0, 1)
	if f > 0.01 {
		rrect(dst, x+3, y+3, math.Max(h-6, (w-6)*f), h-6, (h-6)/2, c, 0)
	}
}

// panelFrame dessine la fenêtre d'un panneau et renvoie sa zone de contenu.
func (g *Game) panelFrame(title string, accent color.RGBA, w, h float64) Rect {
	u := &g.ui
	u.layer = 1
	r := Rect{(ScreenW - w) / 2, (ScreenH-h)/2 + 16, w, h}
	full := Rect{0, 0, ScreenW, ScreenH}
	u.draw(func(dst *ebiten.Image) {
		fillRect(dst, 0, 0, ScreenW, ScreenH, alpha(hexc("#1B1030"), 0.45))
		box(dst, r.X, r.Y, r.W, r.H, 30, cream, alpha(ink, 0.45), 5)
		tw := txtW(title, 30, 700) + 70
		box(dst, r.CX()-tw/2, r.Y-30, tw, 58, 22, accent, darken(accent, 0.3), 5)
		txtO(dst, title, r.CX(), r.Y-2, 30, white, AC, 4)
	})
	cr := Rect{r.X + r.W - 46, r.Y - 22, 58, 58}
	if g.ui.hit(cr) || inpututil.IsKeyJustPressed(ebiten.KeyEscape) {
		g.panel = PanelNone
		g.audio.play("click", g.t)
	}
	u.draw(func(dst *ebiten.Image) {
		box(dst, cr.X, cr.Y, cr.W, cr.H, 18, red, darken(red, 0.3), 4)
		drawIcon(dst, "close", cr.CX(), cr.CY(), 34)
	})
	u.surface(full)
	return Rect{r.X + 28, r.Y + 44, r.W - 56, r.H - 68}
}

func (g *Game) tabs(x, y float64, names []string, col color.RGBA) {
	for i, n := range names {
		w := txtW(n, 20, 700) + 40
		r := Rect{x, y, w, 42}
		fill := white
		if g.tab == i {
			fill = col
		}
		if g.ui.hit(r) && g.tab != i {
			g.tab = i
			g.scroll = 0
			g.audio.play("click", g.t)
		}
		sel := g.tab == i
		n := n
		g.ui.draw(func(dst *ebiten.Image) {
			box(dst, r.X, r.Y, r.W, r.H, 16, fill, alpha(ink, 0.3), 4)
			if sel {
				txtO(dst, n, r.CX(), r.CY()-1, 20, white, AC, 3)
			} else {
				txtB(dst, n, r.CX(), r.CY()-1, 20, ink, AC)
			}
		})
		x += w + 12
	}
}

// ---------- HUD ----------

func (g *Game) buildHUD() {
	u := &g.ui
	u.layer = 0
	s := g.s
	w := worlds[s.World]

	cr := g.pill(100, 14, "coin", fmtNum(s.Coins))
	g.pill(cr.X+cr.W+12, 14, "gem", fmtNum(s.Gems))

	// bannière du monde
	sub := "Rebirth " + itoa(s.Rebirths) + " · Pièces x" + trimF(rebirthMult(s.Rebirths)*w.CoinMult)
	u.draw(func(dst *ebiten.Image) {
		r := Rect{ScreenW/2 - 170, 10, 340, 64}
		box(dst, r.X, r.Y, r.W, r.H, 22, w.Banner, darken(w.Banner, 0.25), 4)
		txtB(dst, w.Name, r.CX(), r.Y+24, 27, ink, AC)
		txt(dst, sub, r.CX(), r.Y+48, 16, ink, AC)
	})
	u.surface(Rect{ScreenW/2 - 170, 10, 340, 64})

	// suivi de quête
	g.buildQuestTracker()

	// potions et boss (haut droite)
	y := 14.0
	for _, p := range potions {
		left := s.Potions[p.ID]
		if left <= 0 {
			continue
		}
		p := p
		yy := y
		u.draw(func(dst *ebiten.Image) {
			label := p.Name[len("Potion de "):] + " " + fmtTime(left)
			wd := txtW(label, 17, 700) + 52
			x := ScreenW - 16 - wd
			box(dst, x, yy, wd, 38, 19, cream, alpha(ink, 0.3), 4)
			circle(dst, x+20, yy+19, 12, p.Col, 3)
			txtB(dst, label, x+38, yy+18, 17, ink, AL)
		})
		y += 46
	}
	if g.bossAvail <= 0 {
		yy := y
		t := s.BossTimer
		u.draw(func(dst *ebiten.Image) {
			label := "Boss dans " + fmtTime(t)
			wd := txtW(label, 17, 700) + 52
			x := ScreenW - 16 - wd
			box(dst, x, yy, wd, 38, 19, cream, alpha(ink, 0.3), 4)
			drawIcon(dst, "skull", x+20, yy+19, 22)
			txtB(dst, label, x+38, yy+18, 17, ink, AL)
		})
	}

	// menus latéraux
	ly := 168.0
	if g.iconButton(16, ly, "paw", "Pets", pink, "") {
		g.openPanel(PanelPets)
	}
	if g.iconButton(16, ly+96, "book", "Index", lilac, badgeN(g.indexClaimable())) {
		g.openPanel(PanelIndex)
	}
	if g.iconButton(16, ly+192, "bag", "Boutique", green, "") {
		g.openPanel(PanelShop)
	}
	if g.iconButton(16, ly+288, "list", "Quêtes", yellow, badgeN(g.questsClaimable())) {
		g.openPanel(PanelQuests)
	}
	rx := float64(ScreenW - 80)
	ry := 168.0
	if g.iconButton(rx, ry, "globe", "Mondes", mint, "") {
		g.openPanel(PanelWorlds)
	}
	gb := ""
	if g.giftReady() {
		gb = "!"
	}
	if g.iconButton(rx, ry+96, "gift", "Cadeau", orange, gb) {
		g.openPanel(PanelGift)
	}
	rb := ""
	if s.Coins >= rebirthCost(s.Rebirths) {
		rb = "!"
	}
	if g.iconButton(rx, ry+192, "portal", "Rebirth", hexc("#8C7BFF"), rb) {
		g.openPanel(PanelRebirth)
	}
	if g.iconButton(rx, ry+288, "gear", "Réglages", hexc("#C9C2E6"), "") {
		g.openPanel(PanelSettings)
	}

	// pets équipés
	eq := []*OwnedPet{}
	for _, p := range g.sortedPets() {
		if p.Equip {
			eq = append(eq, p)
		}
	}
	slots := s.slots()
	cell := 58.0
	bw := float64(slots)*(cell+8) + 8
	br := Rect{100, ScreenH - 16 - cell - 16, bw, cell + 16}
	if u.hit(br) {
		g.openPanel(PanelPets)
	}
	u.draw(func(dst *ebiten.Image) {
		txtO(dst, "Équipés "+itoa(len(eq))+"/"+itoa(slots), br.X+4, br.Y-14, 17, white, AL, 3)
		box(dst, br.X, br.Y, br.W, br.H, 20, cream, alpha(ink, 0.35), 4)
		for i := 0; i < slots; i++ {
			x := br.X + 8 + float64(i)*(cell+8)
			y := br.Y + 8
			if i < len(eq) {
				d := petDefs[eq[i].Def]
				rrectC(dst, x, y, cell, cell, 14, lighten(d.Body, 0.75), 3, rarityCol[d.Rarity])
				petIcon(dst, eq[i], x+3, y+2, cell-6)
			} else {
				rrectC(dst, x, y, cell, cell, 14, nil, 3, muted)
				txtB(dst, "+", x+cell/2, y+cell/2-2, 28, muted, AC)
			}
		}
	})

	// récolte auto + pièces/s
	ar := Rect{ScreenW - 16 - 250, ScreenH - 16 - 56, 250, 56}
	u.surface(ar)
	u.draw(func(dst *ebiten.Image) {
		box(dst, ar.X, ar.Y, ar.W, ar.H, 20, cream, alpha(ink, 0.35), 4)
		txtB(dst, "Récolte auto (F)", ar.X+16, ar.CY()-1, 18, ink, AL)
	})
	if g.toggle(Rect{ar.X + ar.W - 76, ar.Y + 13, 60, 30}, s.AutoCollect) {
		s.AutoCollect = !s.AutoCollect
		g.audio.play("click", g.t)
	}
	cps := g.cps
	u.draw(func(dst *ebiten.Image) {
		txtO(dst, "+"+fmtNum(cps)+"/s", ar.X+ar.W-8, ar.Y-16, 20, yellow, AR, 3)
	})

	// combo
	if g.combo > 1 {
		c := g.combo
		ct := g.comboT
		u.draw(func(dst *ebiten.Image) {
			x, y := float64(ScreenW/2), float64(ScreenH-120)
			box(dst, x-110, y-24, 220, 48, 20, orange, darken(orange, 0.3), 4)
			txtO(dst, "COMBO x"+itoa(c), x, y-2, 26, white, AC, 3)
			progressBar(dst, x-80, y+30, 160, 14, ct/0.9, yellow)
		})
	}

	// boss disponible
	if g.bossAvail > 0 {
		r := Rect{ScreenW/2 - 190, 92, 380, 60}
		label := "COMBATTRE LE GOLEM · " + fmtTime(g.bossAvail)
		if g.button(r, label, red, true) {
			g.startBoss()
		}
	}

	// auto-éclosion
	if g.nearEgg != nil && s.Passes["auto"] {
		on := g.autoHatch == g.nearEgg
		label := "Auto-éclosion : NON"
		col := lilac
		if on {
			label = "Auto-éclosion : OUI"
			col = green
		}
		if g.button(Rect{ScreenW/2 - 140, ScreenH - 92, 280, 54}, label, col, true) {
			if on {
				g.autoHatch = nil
			} else {
				g.autoHatch = g.nearEgg
				g.autoHatchT = 0
			}
		}
	}

	// aide au démarrage
	hint := ""
	switch {
	case s.Stats.Piles < 3:
		hint = "Clique sur les tas de bonbons pour les casser · ZQSD / flèches pour marcher"
	case s.Stats.Hatched == 0 && s.Coins >= 500:
		hint = "Tu as assez de pièces ! Va au Candy Egg et appuie sur E"
	case s.Stats.Hatched == 0:
		hint = "Récolte 500 pièces pour ouvrir ton premier œuf"
	}
	if hint != "" && g.combo <= 1 {
		u.draw(func(dst *ebiten.Image) {
			wd := txtW(hint, 19, 600) + 40
			x := float64(ScreenW)/2 - wd/2
			y := float64(ScreenH - 150)
			box(dst, x, y, wd, 44, 20, white, alpha(ink, 0.3), 4)
			txt(dst, hint, ScreenW/2, y+21, 19, ink, AC)
		})
	}

	// notifications
	for i, t := range g.toasts {
		t := t
		i := i
		u.draw(func(dst *ebiten.Image) {
			a := clamp(math.Min(t.T*5, (3.2-t.T)*3), 0, 1)
			wd := txtW(t.Text, 20, 700) + 44
			y := 168 + float64(i)*52 - (1-a)*16
			c := white
			if cc, ok := t.Col.(color.RGBA); ok {
				c = lighten(cc, 0.55)
			}
			box(dst, ScreenW/2-wd/2, y, wd, 44, 20, alpha(c, a), alpha(ink, 0.3*a), 4*a)
			txtB(dst, t.Text, ScreenW/2, y+21, 20, alpha(ink, a), AC)
		})
	}
}

func badgeN(n int) string {
	if n <= 0 {
		return ""
	}
	return itoa(n)
}

func (g *Game) buildQuestTracker() {
	q, prog := g.questProgress()
	r := Rect{100, 74, 300, 70}
	if q == nil {
		return
	}
	done := prog >= q.Goal
	if g.ui.hit(r) {
		g.openPanel(PanelQuests)
	}
	g.ui.draw(func(dst *ebiten.Image) {
		fill := cream
		if done {
			fill = lighten(green, 0.6)
		}
		box(dst, r.X, r.Y, r.W, r.H, 18, fill, alpha(ink, 0.3), 4)
		txtB(dst, "Quête "+itoa(g.s.Quest+1)+" · "+q.Text, r.X+14, r.Y+20, 17, ink, AL)
		progressBar(dst, r.X+14, r.Y+38, r.W-28, 20, prog/q.Goal, yellow)
		label := fmtNum(math.Min(prog, q.Goal)) + " / " + fmtNum(q.Goal)
		if done {
			label = "Terminé ! Clique pour réclamer"
		}
		txtB(dst, label, r.CX(), r.Y+47, 13, ink, AC)
	})
}

// ---------- surcouches : éclosion, fenêtres, titre ----------

func (g *Game) buildOverlays() {
	u := &g.ui
	if g.hatch != nil {
		u.layer = 2
		h := g.hatch
		u.surface(Rect{0, 0, ScreenW, ScreenH})
		u.draw(func(dst *ebiten.Image) { g.drawHatch(dst, h) })
		if h.T > 1.3 && u.hit(Rect{0, 0, ScreenW, ScreenH}) {
			h.Close = true
		}
		return
	}
	if g.popup != nil {
		u.layer = 2
		p := g.popup
		r := Rect{ScreenW/2 - 270, ScreenH/2 - 150, 540, 300}
		lines := wrap(p.Body, 21, r.W-60)
		u.surface(Rect{0, 0, ScreenW, ScreenH})
		u.draw(func(dst *ebiten.Image) {
			fillRect(dst, 0, 0, ScreenW, ScreenH, alpha(hexc("#1B1030"), 0.5))
			box(dst, r.X, r.Y, r.W, r.H, 28, cream, alpha(ink, 0.45), 5)
			txtO(dst, p.Title, r.CX(), r.Y+44, 32, yellow, AC, 4)
			for i, l := range lines {
				txt(dst, l, r.CX(), r.Y+100+float64(i)*28, 21, ink, AC)
			}
		})
		bw := 220.0
		if p.Cancel {
			if g.button(Rect{r.CX() - bw - 10, r.Y + r.H - 80, bw, 56}, "Annuler", red, true) {
				g.popup = nil
				return
			}
			if g.button(Rect{r.CX() + 10, r.Y + r.H - 80, bw, 56}, p.Btn, green, true) {
				g.popup = nil
				if p.OnOK != nil {
					p.OnOK()
				}
			}
			return
		}
		if g.button(Rect{r.CX() - bw/2, r.Y + r.H - 80, bw, 56}, p.Btn, green, true) || inpututil.IsKeyJustPressed(ebiten.KeyEnter) {
			g.popup = nil
			if p.OnOK != nil {
				p.OnOK()
			}
		}
	}
}

func (g *Game) updateTitle() {
	u := &g.ui
	r := Rect{ScreenW/2 - 170, 400, 340, 100}
	if g.button(r, "JOUER", green, true) || inpututil.IsKeyJustPressed(ebiten.KeyEnter) || inpututil.IsKeyJustPressed(ebiten.KeySpace) {
		g.scene = ScenePlay
		g.audio.play("reveal", g.t)
	}
	_ = u
}

func (g *Game) drawTitle(dst *ebiten.Image) {
	dst.Fill(hexc("#BDE9FF"))
	ellipse(dst, 260, 560, 520, 250, 0, hexc("#A6E8C4"), 5)
	ellipse(dst, 1100, 540, 470, 260, 0, hexc("#8EDDB4"), 5)
	fillRect(dst, 0, 580, ScreenW, 140, hexc("#FFE6F0"))
	line(dst, 0, 580, ScreenW, 580, 5, ink)
	for i, c := range [][3]float64{{120, 70, 80}, {1000, 150, 100}, {60, 220, 60}, {760, 60, 70}} {
		x := c[0] + math.Sin(g.t*0.3+float64(i))*20
		rrect(dst, x, c[1], c[2]*1.6, c[2]*0.55, c[2]*0.3, white, 4)
	}
	// sucettes
	for _, l := range [][3]float64{{70, 330, 1}, {1210, 350, 0.9}} {
		x, y, k := l[0], l[1], l[2]
		rrect(dst, x-7*k, y, 14*k, 230*k, 7*k, white, 4)
		circle(dst, x, y, 46*k, pink, 5)
		circle(dst, x, y, 26*k, white, 4)
		circle(dst, x, y, 11*k, pink, 4)
	}
	pets := []struct {
		id      string
		x, y, s float64
	}{{"gumdrop_bunny", 200, 600, 200}, {"jelly_cat", 370, 610, 130}, {"mochi_dragon", 1080, 600, 210}, {"lollipop_fox", 900, 610, 130}}
	for i, p := range pets {
		bob := math.Abs(math.Sin(g.t*2.5+float64(i)*1.3)) * 14
		blit(dst, petSprite(petDefs[p.id], 0, false), p.x, p.y-bob, p.s/petTex)
	}
	cx := float64(ScreenW / 2)
	tag := Rect{cx - 100, 40, 200, 44}
	box(dst, tag.X, tag.Y, tag.W, tag.H, 14, yellow, hexc("#F2A900"), 4)
	txtB(dst, "Bienvenue dans", tag.CX(), tag.CY()-1, 24, ink, AC)
	wob := math.Sin(g.t*2) * 4
	txtO(dst, "SWEET PETS", cx, 170+wob, 128, pink, AC, 9)
	fr := Rect{cx - 190, 240, 380, 92}
	box(dst, fr.X, fr.Y, fr.W, fr.H, 20, mint, hexc("#2DB784"), 5)
	txtO(dst, "FACTORY", cx, fr.CY()-2, 66, white, AC, 6)
	txtB(dst, "Récolte des bonbons, ouvre des œufs, collectionne 42 pets !", cx, 625, 24, ink, AC)
	txt(dst, "ZQSD / WASD / flèches : marcher · Clic : casser · E : interagir", cx, 665, 19, ink, AC)
	txt(dst, "v1.0 · Mise à jour 1 : Choco Land", 20, 700, 15, alpha(ink, 0.7), AL)
}
