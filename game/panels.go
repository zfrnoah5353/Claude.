package main

import (
	"fmt"
	"math"
	"strings"

	"github.com/hajimehoshi/ebiten/v2"
)

func (g *Game) buildPanels() {
	switch g.panel {
	case PanelPets:
		g.panelPets()
	case PanelIndex:
		g.panelIndex()
	case PanelShop:
		g.panelShop()
	case PanelQuests:
		g.panelQuests()
	case PanelWorlds:
		g.panelWorlds()
	case PanelGift:
		g.panelGift()
	case PanelRebirth:
		g.panelRebirth()
	case PanelSettings:
		g.panelSettings()
	}
	g.ui.layer = 0
}

// scrollArea gère la molette dans une zone et renvoie le décalage borné.
func (g *Game) scrollArea(r Rect, contentH float64) float64 {
	maxS := math.Max(0, contentH-r.H)
	if g.ui.hover(r) && g.ui.wheel != 0 {
		g.scroll -= g.ui.wheel * 40
	}
	g.scroll = clamp(g.scroll, 0, maxS)
	if maxS > 0 {
		f := g.scroll / maxS
		th := math.Max(40, r.H*r.H/contentH)
		g.ui.draw(func(dst *ebiten.Image) {
			rrect(dst, r.X+r.W+6, r.Y, 10, r.H, 5, alpha(ink, 0.12), 0)
			rrect(dst, r.X+r.W+6, r.Y+(r.H-th)*f, 10, th, 5, alpha(ink, 0.45), 0)
		})
	}
	return g.scroll
}

// ---------- Pets ----------

func (g *Game) panelPets() {
	c := g.panelFrame("Mes pets", pink, 1080, 600)
	u := &g.ui
	s := g.s
	pets := g.sortedPets()
	u.draw(func(dst *ebiten.Image) {
		txtB(dst, fmt.Sprintf("Inventaire %d/%d", len(s.Pets), s.storage()), c.X, c.Y+12, 19, ink, AL)
		txt(dst, fmt.Sprintf("Équipés %d/%d", s.equippedCount(), s.slots()), c.X, c.Y+36, 16, ink, AL)
	})
	if g.button(Rect{c.X + 290, c.Y, 230, 44}, "Équiper les meilleurs", green, true) {
		g.equipBest()
	}
	adNames := []string{"Aucune", "Communs", "Peu communs", "Rares"}
	if g.button(Rect{c.X + 532, c.Y, 250, 44}, "Auto-suppr. : "+adNames[s.AutoDelete+1], lilac, true) {
		s.AutoDelete++
		if s.AutoDelete > int(Rare) {
			s.AutoDelete = -1
		}
	}
	junk := g.junkPets()
	if g.button(Rect{c.X + 794, c.Y, 230, 44}, fmt.Sprintf("Vider (%d)", len(junk)), red, len(junk) > 0) {
		g.popup = &Popup{Title: "Vider l'inventaire ?", Btn: "Supprimer", Cancel: true,
			Body: fmt.Sprintf("Supprimer %d pets de faible rareté (non équipés, non verrouillés, non fusionnés) ?", len(junk)),
			OnOK: func() {
				rm := map[int64]bool{}
				for _, p := range g.junkPets() {
					rm[p.UID] = true
				}
				g.s.removePets(rm)
				g.selUID = 0
				g.syncActors()
			}}
	}

	grid := Rect{c.X, c.Y + 60, 680, c.H - 60}
	const cell, gap, cols = 102.0, 10.0, 6
	rows := (len(pets) + cols - 1) / cols
	off := g.scrollArea(grid, float64(rows)*(cell+gap))
	u.clip = &grid
	for i, p := range pets {
		x := grid.X + float64(i%cols)*(cell+gap)
		y := grid.Y + float64(i/cols)*(cell+gap) - off
		if y+cell < grid.Y || y > grid.Y+grid.H {
			continue
		}
		r := Rect{x, y, cell, cell}
		if u.hit(r) {
			g.selUID = p.UID
			g.audio.play("click", g.t)
		}
		p := p
		sel := g.selUID == p.UID
		hov := u.hover(r)
		u.draw(func(dst *ebiten.Image) {
			d := petDefs[p.Def]
			bg := lighten(d.Body, 0.78)
			if hov {
				bg = lighten(d.Body, 0.6)
			}
			sw := 3.5
			if sel {
				sw = 6
			}
			rrectC(dst, x, y, cell, cell, 18, bg, sw, rarityCol[d.Rarity])
			petIcon(dst, p, x+8, y+2, cell-16)
			txtO(dst, "Nv "+itoa(p.Level), x+8, y+cell-14, 14, white, AL, 2.5)
			if p.Equip {
				circle(dst, x+16, y+16, 11, green, 3)
				line(dst, x+11, y+16, x+15, y+20, 3, white)
				line(dst, x+15, y+20, x+22, y+11, 3, white)
			}
			if p.Lock {
				drawIcon(dst, "lock", x+cell-18, y+18, 22)
			}
			switch p.Tier {
			case 1:
				star(dst, x+cell-18, y+cell-18, 11, 0.5, 0, goldBody, 3)
			case 2:
				star(dst, x+cell-18, y+cell-18, 11, 0.5, 0, hsv(g.t*100, 0.6, 1), 3)
			}
		})
	}
	u.clip = nil

	// détail
	det := Rect{c.X + 712, c.Y + 60, c.W - 712, c.H - 60}
	sel := s.pet(g.selUID)
	u.draw(func(dst *ebiten.Image) {
		rrect(dst, det.X, det.Y, det.W, det.H, 22, white, 4)
		if sel == nil {
			txt(dst, "Choisis un pet", det.CX(), det.CY(), 20, muted, AC)
		}
	})
	if sel == nil {
		return
	}
	d := petDefs[sel.Def]
	tierName := []string{"", "Doré", "Arc-en-ciel"}[sel.Tier]
	u.draw(func(dst *ebiten.Image) {
		circle(dst, det.CX(), det.Y+88, 70, alpha(lighten(rarityCol[d.Rarity], 0.5), 0.6), 0)
		drawPet(dst, sel, det.CX(), det.Y+160, 150, g.t)
		txtB(dst, d.Name, det.CX(), det.Y+180, 22, ink, AC)
		label := rarityName[d.Rarity]
		if tierName != "" {
			label += " · " + tierName
		}
		if sel.Shiny {
			label += " · Brillant"
		}
		rw := txtW(label, 16, 700) + 26
		rrect(dst, det.CX()-rw/2, det.Y+198, rw, 30, 14, rarityCol[d.Rarity], 3)
		txtB(dst, label, det.CX(), det.Y+212, 16, white, AC)
		txtB(dst, "Puissance "+fmtNum(g.petPower(sel)), det.CX(), det.Y+246, 20, ink, AC)
		need := 25 + 15*float64(sel.Level)
		lv := "Niveau " + itoa(sel.Level)
		f := sel.XP / need
		if sel.Level >= 25 {
			lv = "Niveau max (25)"
			f = 1
		}
		txt(dst, lv, det.CX(), det.Y+272, 16, ink, AC)
		progressBar(dst, det.X+30, det.Y+284, det.W-60, 16, f, mint)
	})
	bx := det.X + 16
	bw := det.W - 32
	y := det.Y + 316
	eqLabel := "Équiper"
	if sel.Equip {
		eqLabel = "Retirer"
	}
	if g.button(Rect{bx, y, bw/2 - 6, 44}, eqLabel, green, true) {
		g.toggleEquip(sel)
	}
	lockLabel := "Verrouiller"
	if sel.Lock {
		lockLabel = "Déverrouiller"
	}
	if g.button(Rect{bx + bw/2 + 6, y, bw/2 - 6, 44}, lockLabel, sky, true) {
		sel.Lock = !sel.Lock
	}
	y += 58
	canCraft := sel.Tier < 2 && sel.Bonus == 0
	if canCraft {
		n := len(g.craftGroup(sel))
		next := []string{"doré", "arc-en-ciel"}[sel.Tier]
		label := fmt.Sprintf("Fusion %s (%d/5)", next, int(math.Min(float64(n), 5)))
		if g.button(Rect{bx, y, bw, 44}, label, orange, n >= 5) {
			g.craft(sel)
			return
		}
		y += 58
	}
	if g.button(Rect{bx, y, bw, 44}, "Supprimer", red, !sel.Lock) {
		if d.Rarity >= Legendary || sel.Tier > 0 {
			p := sel
			g.popup = &Popup{Title: "Supprimer ?", Body: "Veux-tu vraiment supprimer " + d.Name + " ? C'est définitif.", Btn: "Supprimer", Cancel: true, OnOK: func() { g.deletePet(p) }}
		} else {
			g.deletePet(sel)
		}
	}
}

// ---------- Index ----------

func (g *Game) indexCount() int {
	n := 0
	for _, p := range allPets {
		if g.s.Discovered[p.ID] {
			n++
		}
	}
	return n
}

func (g *Game) indexClaimable() int {
	n := 0
	have := g.indexCount()
	for i := g.s.IndexClaim; i < len(indexMilestones); i++ {
		if have >= g.milestoneNeed(i) {
			n++
		}
	}
	return n
}

func (g *Game) milestoneNeed(i int) int {
	need := indexMilestones[i].Need
	if need > len(allPets) {
		need = len(allPets)
	}
	return need
}

func (g *Game) panelIndex() {
	c := g.panelFrame("Index des pets", lilac, 1080, 610)
	u := &g.ui
	names := []string{}
	for _, w := range worlds {
		names = append(names, w.Name)
	}
	names = append(names, "Exclusifs")
	g.tabs(c.X, c.Y, names, lilac)

	y := c.Y + 64
	var groups []struct {
		title string
		pets  []*PetDef
		egg   *EggDef
	}
	if g.tab < len(worlds) {
		for _, e := range worlds[g.tab].Eggs {
			groups = append(groups, struct {
				title string
				pets  []*PetDef
				egg   *EggDef
			}{e.Name + " · " + fmtNum(e.Price) + " pièces", e.Pets, e})
		}
	} else {
		groups = append(groups, struct {
			title string
			pets  []*PetDef
			egg   *EggDef
		}{"Récompense du boss Gummy Golem", []*PetDef{golemDef}, nil})
	}
	for _, gr := range groups {
		gr := gr
		yy := y
		u.draw(func(dst *ebiten.Image) { txtB(dst, gr.title, c.X, yy+12, 20, ink, AL) })
		for i, p := range gr.pets {
			x := c.X + float64(i)*170
			r := Rect{x, yy + 30, 158, 168}
			p := p
			found := g.s.Discovered[p.ID]
			ch := ""
			if gr.egg != nil {
				ch = fmtChance(g.realChance(gr.egg, p))
			} else {
				ch = "20 % (100 % la 1re fois)"
			}
			u.draw(func(dst *ebiten.Image) {
				bg := hexc("#EDEAF6")
				if found {
					bg = lighten(p.Body, 0.75)
				}
				rrectC(dst, r.X, r.Y, r.W, r.H, 18, bg, 3.5, rarityCol[p.Rarity])
				blit(dst, petSprite(p, 0, !found), r.CX(), r.Y+112, 100.0/petTex)
				name := "???"
				if found {
					name = p.Name
				}
				txtB(dst, name, r.CX(), r.Y+128, 15, ink, AC)
				txt(dst, rarityName[p.Rarity]+" · "+ch, r.CX(), r.Y+150, 13, darken(rarityCol[p.Rarity], 0.2), AC)
			})
		}
		y += 214
	}

	// paliers de collection
	have := g.indexCount()
	total := len(allPets)
	by := c.Y + c.H - 60
	u.draw(func(dst *ebiten.Image) {
		txtB(dst, fmt.Sprintf("Collection : %d / %d", have, total), c.X, by+22, 20, ink, AL)
		progressBar(dst, c.X+230, by+8, 460, 28, float64(have)/float64(total), lilac)
	})
	if g.s.IndexClaim < len(indexMilestones) {
		m := indexMilestones[g.s.IndexClaim]
		need := g.milestoneNeed(g.s.IndexClaim)
		label := fmt.Sprintf("%d pets : +%s gemmes, +5 %% pièces", need, fmtNum(m.Gems))
		if g.button(Rect{c.X + 710, by, c.W - 710, 46}, label, green, have >= need) {
			g.s.Gems += m.Gems
			g.s.IndexClaim++
			g.audio.play("levelup", g.t)
			g.toast("Palier d'index réclamé !", lilac)
		}
	} else {
		u.draw(func(dst *ebiten.Image) { txtB(dst, "Tous les paliers réclamés !", c.X+c.W, by+22, 20, ink, AR) })
	}
}

// ---------- Boutique ----------

func (g *Game) panelShop() {
	c := g.panelFrame("Boutique", green, 1080, 610)
	u := &g.ui
	g.tabs(c.X, c.Y, []string{"Améliorations", "Gemmes", "Potions et passes"}, green)
	area := Rect{c.X, c.Y + 62, c.W - 20, c.H - 62}
	cardW, cardH := (area.W-16)/2, 104.0
	type item struct {
		name, desc, level, price string
		gem, ok                  bool
		buy                      func()
		cost                     float64
	}
	var items []item
	s := g.s
	switch g.tab {
	case 0, 1:
		for _, up := range upgrades {
			if up.Gem != (g.tab == 1) {
				continue
			}
			up := up
			lv := s.Upgrades[up.ID]
			it := item{name: up.Name, desc: up.Desc, level: fmt.Sprintf("Nv %d/%d", lv, up.Max), gem: up.Gem}
			if lv >= up.Max {
				it.price = "MAX"
			} else {
				cost := up.Cost(lv)
				it.price = fmtNum(cost)
				it.cost = cost
				it.ok = true
				it.buy = func() {
					if g.spend(cost, up.Gem) {
						s.Upgrades[up.ID]++
						s.Stats.Upgrades++
						if up.ID == "slot" {
							g.toast("Nouvel emplacement de pet !", green)
						}
					}
				}
			}
			items = append(items, it)
		}
	case 2:
		for _, p := range potions {
			p := p
			left := s.Potions[p.ID]
			lvl := "10 minutes"
			if left > 0 {
				lvl = "Actif : " + fmtTime(left)
			}
			items = append(items, item{name: p.Name, desc: "Cumulable : ajoute 10 minutes", level: lvl, price: fmtNum(p.Price), cost: p.Price, gem: true, ok: true, buy: func() {
				if g.spend(p.Price, true) {
					s.Potions[p.ID] += potionDuration
				}
			}})
		}
		for _, p := range passes {
			p := p
			it := item{name: p.Name, desc: p.Desc, level: "Pass permanent", gem: true}
			if s.Passes[p.ID] {
				it.price = "Acheté"
			} else {
				it.price = fmtNum(p.Price)
				it.cost = p.Price
				it.ok = true
				it.buy = func() {
					if g.spend(p.Price, true) {
						s.Passes[p.ID] = true
						g.toast("Pass "+p.Name+" activé !", green)
					}
				}
			}
			items = append(items, it)
		}
	}
	rows := (len(items) + 1) / 2
	off := g.scrollArea(area, float64(rows)*(cardH+14))
	u.clip = &area
	for i, it := range items {
		x := area.X + float64(i%2)*(cardW+16)
		y := area.Y + float64(i/2)*(cardH+14) - off
		it := it
		u.draw(func(dst *ebiten.Image) {
			box(dst, x, y, cardW, cardH, 20, white, alpha(ink, 0.25), 4)
			txtB(dst, it.name, x+20, y+26, 22, ink, AL)
			txt(dst, it.desc, x+20, y+54, 16, hexc("#5A4A7A"), AL)
			txtB(dst, it.level, x+20, y+80, 15, muted, AL)
		})
		br := Rect{x + cardW - 168, y + 28, 150, 50}
		if g.priceButton(br, it.price, it.gem, it.ok && g.affordable(it.cost, it.gem)) && it.buy != nil {
			it.buy()
		}
	}
	u.clip = nil
}

func (g *Game) affordable(cost float64, gem bool) bool {
	if gem {
		return g.s.Gems >= cost
	}
	return g.s.Coins >= cost
}

func (g *Game) priceButton(r Rect, price string, gem, enabled bool) bool {
	u := &g.ui
	clicked := u.hit(r) && enabled
	h := u.hover(r)
	fill := green
	if !enabled {
		fill = grayBtn
	} else if h {
		fill = lighten(green, 0.12)
	}
	u.draw(func(dst *ebiten.Image) {
		sh := darken(fill, 0.3)
		box(dst, r.X, r.Y, r.W, r.H, 18, fill, sh, 4)
		if price == "MAX" || price == "Acheté" {
			txtB(dst, price, r.CX(), r.CY()-1, 20, hexc("#6E6890"), AC)
			return
		}
		tw := txtW(price, 20, 700)
		ix := r.CX() - (tw+30)/2 + 12
		if gem {
			gemIcon(dst, ix, r.CY(), 24)
		} else {
			coinIcon(dst, ix, r.CY(), 24)
		}
		txtO(dst, price, ix+18+tw/2, r.CY()-1, 20, white, AC, 3)
	})
	return clicked
}

// ---------- Quêtes ----------

func (g *Game) questsClaimable() int {
	n := 0
	if q, p := g.questProgress(); q != nil && p >= q.Goal {
		n++
	}
	for _, d := range g.s.Daily {
		if !d.Claimed && g.metric(d.Kind)-d.Base >= d.Target {
			n++
		}
	}
	return n
}

func (g *Game) panelQuests() {
	c := g.panelFrame("Quêtes", yellow, 900, 580)
	u := &g.ui
	s := g.s
	u.draw(func(dst *ebiten.Image) { txtB(dst, "Aventure", c.X, c.Y+14, 24, ink, AL) })
	q, prog := g.questProgress()
	qr := Rect{c.X, c.Y + 36, c.W, 110}
	if q == nil {
		u.draw(func(dst *ebiten.Image) {
			box(dst, qr.X, qr.Y, qr.W, qr.H, 22, white, alpha(ink, 0.25), 4)
			txtB(dst, "Bravo, tu as terminé toutes les quêtes d'aventure !", qr.CX(), qr.CY(), 22, ink, AC)
		})
	} else {
		done := prog >= q.Goal
		reward := rewardText(q.Coins, q.Gems)
		u.draw(func(dst *ebiten.Image) {
			box(dst, qr.X, qr.Y, qr.W, qr.H, 22, white, alpha(ink, 0.25), 4)
			rrect(dst, qr.X+20, qr.Y+25, 60, 60, 18, pink, 4)
			txtO(dst, itoa(s.Quest+1), qr.X+50, qr.Y+54, 28, white, AC, 3)
			txtB(dst, q.Text, qr.X+100, qr.Y+32, 22, ink, AL)
			progressBar(dst, qr.X+100, qr.Y+56, 420, 26, prog/q.Goal, yellow)
			txtB(dst, fmtNum(math.Min(prog, q.Goal))+" / "+fmtNum(q.Goal), qr.X+310, qr.Y+68, 15, ink, AC)
			txtB(dst, "Récompense : "+reward, qr.X+qr.W-20, qr.Y+90, 16, hexc("#5A4A7A"), AR)
		})
		if g.button(Rect{qr.X + qr.W - 170, qr.Y + 20, 150, 44}, "Réclamer", green, done) {
			g.addCoins(q.Coins, false)
			s.Gems += q.Gems
			g.audio.play("levelup", g.t)
			g.toast("Quête terminée ! "+reward, yellow)
			g.advanceQuest()
		}
	}

	u.draw(func(dst *ebiten.Image) { txtB(dst, "Quêtes du jour (changent à minuit)", c.X, c.Y+178, 24, ink, AL) })
	for i, d := range s.Daily {
		d := d
		r := Rect{c.X, c.Y + 200 + float64(i)*96, c.W, 84}
		p := g.metric(d.Kind) - d.Base
		done := p >= d.Target
		label := fmt.Sprintf(dailyText[d.Kind], fmtNum(d.Target))
		u.draw(func(dst *ebiten.Image) {
			box(dst, r.X, r.Y, r.W, r.H, 20, white, alpha(ink, 0.25), 4)
			txtB(dst, label, r.X+20, r.Y+26, 20, ink, AL)
			progressBar(dst, r.X+20, r.Y+46, 420, 24, p/d.Target, sky)
			txtB(dst, fmtNum(math.Min(p, d.Target))+" / "+fmtNum(d.Target), r.X+230, r.Y+57, 14, ink, AC)
			gemIcon(dst, r.X+480, r.Y+42, 26)
			txtB(dst, "+"+fmtNum(d.Gems), r.X+500, r.Y+41, 20, ink, AL)
		})
		if d.Claimed {
			u.draw(func(dst *ebiten.Image) { txtB(dst, "Réclamée", r.X+r.W-95, r.CY(), 20, muted, AC) })
		} else if g.button(Rect{r.X + r.W - 170, r.Y + 18, 150, 46}, "Réclamer", green, done) {
			d.Claimed = true
			s.Gems += d.Gems
			g.audio.play("levelup", g.t)
		}
	}
}

func rewardText(coins, gems float64) string {
	var parts []string
	if coins > 0 {
		parts = append(parts, fmtNum(coins)+" pièces")
	}
	if gems > 0 {
		parts = append(parts, fmtNum(gems)+" gemmes")
	}
	return strings.Join(parts, " + ")
}

// ---------- Mondes ----------

func (g *Game) panelWorlds() {
	c := g.panelFrame("Mondes", mint, 1100, 470)
	u := &g.ui
	s := g.s
	cw := (c.W - 3*16) / 4
	for i, w := range worlds {
		i, w := i, w
		r := Rect{c.X + float64(i)*(cw+16), c.Y + 10, cw, c.H - 20}
		u.draw(func(dst *ebiten.Image) {
			box(dst, r.X, r.Y, r.W, r.H, 22, w.Ground, alpha(ink, 0.3), 4)
			rrect(dst, r.X+14, r.Y+14, r.W-28, 150, 16, w.Plaza, 3)
			blit(dst, decorSprite(w.Theme, 0), r.X+70, r.Y+160, 0.55)
			if len(w.Eggs) > 0 {
				blit(dst, eggSprite(w.Eggs[0]), r.X+r.W-70, r.Y+150, 0.8)
			}
			if i > s.MaxWorld {
				fillRect(dst, r.X+16, r.Y+16, r.W-32, 146, alpha(hexc("#1B1030"), 0.35))
				drawIcon(dst, "lock", r.CX(), r.Y+90, 60)
			}
			tc := ink
			if w.Dark {
				tc = white
			}
			txtB(dst, w.Name, r.CX(), r.Y+196, 22, tc, AC)
			txt(dst, "Pièces x"+formatFloat(w.CoinMult), r.CX(), r.Y+226, 17, tc, AC)
			txt(dst, fmt.Sprintf("Bonbons x%s plus durs", fmtNum(w.Scale)), r.CX(), r.Y+250, 15, tc, AC)
			if i > 0 {
				txt(dst, "Prix : "+fmtNum(w.Unlock)+" pièces", r.CX(), r.Y+274, 15, tc, AC)
			}
		})
		br := Rect{r.X + 16, r.Y + r.H - 70, r.W - 32, 52}
		switch {
		case i == s.World:
			u.draw(func(dst *ebiten.Image) {
				box(dst, br.X, br.Y, br.W, br.H, 18, white, alpha(ink, 0.3), 4)
				txtB(dst, "Tu es ici", br.CX(), br.CY()-1, 20, ink, AC)
			})
		case i <= s.MaxWorld:
			if g.button(br, "Voyager", sky, true) {
				g.enterWorld(i)
				g.panel = PanelNone
				g.toast("Bienvenue à "+w.Name+" !", w.Banner)
			}
		case i == s.MaxWorld+1:
			if g.button(br, "Débloquer "+fmtNum(w.Unlock), green, s.Coins >= w.Unlock) {
				g.unlockWorld(i)
			}
		default:
			if g.button(br, "Verrouillé", grayBtn, false) {
			}
		}
	}
}

// ---------- Cadeau quotidien ----------

func (g *Game) giftReward(day int) (string, func()) {
	s := g.s
	switch day {
	case 1:
		v := roundNice(math.Max(500, g.estimatedCPS()*180))
		return fmtNum(v) + " pièces", func() { g.addCoins(v, false) }
	case 2:
		return "10 gemmes", func() { s.Gems += 10 }
	case 3:
		return "Potion de pièces", func() { s.Potions["coins"] += potionDuration }
	case 4:
		return "15 gemmes", func() { s.Gems += 15 }
	case 5:
		return "Potion de chance", func() { s.Potions["luck"] += potionDuration }
	case 6:
		return "25 gemmes", func() { s.Gems += 25 }
	}
	return "50 gemmes + force", func() { s.Gems += 50; s.Potions["dmg"] += potionDuration }
}

func (g *Game) panelGift() {
	c := g.panelFrame("Cadeau du jour", orange, 1060, 420)
	u := &g.ui
	ready := g.giftReady()
	next := g.giftNextStreak()
	cur := g.s.GiftStreak
	cw := (c.W - 6*12) / 7
	for d := 1; d <= 7; d++ {
		d := d
		label, _ := g.giftReward(d)
		r := Rect{c.X + float64(d-1)*(cw+12), c.Y + 20, cw, 200}
		state := 0 // 0 à venir, 1 reçu, 2 aujourd'hui
		if ready && d == next {
			state = 2
		} else if (!ready && d <= cur) || (ready && d < next) {
			state = 1
		}
		u.draw(func(dst *ebiten.Image) {
			fill := white
			switch state {
			case 1:
				fill = hexc("#DDF8EC")
			case 2:
				fill = hexc("#FFF3B8")
			}
			sw := 4.0
			if state == 2 {
				sw = 6
			}
			rrect(dst, r.X, r.Y, r.W, r.H, 20, fill, sw)
			txtB(dst, "Jour "+itoa(d), r.CX(), r.Y+26, 20, ink, AC)
			drawIcon(dst, "gift", r.CX(), r.Y+86, 64)
			for i, l := range wrap(label, 15, r.W-14) {
				txtB(dst, l, r.CX(), r.Y+146+float64(i)*20, 15, ink, AC)
			}
			if state == 1 {
				circle(dst, r.X+r.W-18, r.Y+18, 13, green, 3)
				line(dst, r.X+r.W-24, r.Y+18, r.X+r.W-19, r.Y+23, 3, white)
				line(dst, r.X+r.W-19, r.Y+23, r.X+r.W-11, r.Y+13, 3, white)
			}
		})
	}
	br := Rect{c.CX() - 150, c.Y + 260, 300, 64}
	if ready {
		if g.button(br, "Récupérer", green, true) {
			_, give := g.giftReward(next)
			give()
			g.s.GiftStreak = next
			g.s.GiftDay = today()
			g.audio.play("levelup", g.t)
			g.toast("Cadeau du jour récupéré !", orange)
		}
	} else {
		u.draw(func(dst *ebiten.Image) {
			txtB(dst, "Reviens demain pour le jour suivant !", c.CX(), br.CY(), 22, ink, AC)
		})
	}
}

// ---------- Rebirth ----------

func (g *Game) panelRebirth() {
	c := g.panelFrame("Rebirth", hexc("#8C7BFF"), 760, 520)
	u := &g.ui
	s := g.s
	cost := rebirthCost(s.Rebirths)
	cur, nxt := rebirthMult(s.Rebirths), rebirthMult(s.Rebirths+1)
	u.draw(func(dst *ebiten.Image) {
		cx := c.CX()
		txtO(dst, "REBIRTH "+itoa(s.Rebirths+1), cx, c.Y+30, 44, yellow, AC, 5)
		box(dst, cx-230, c.Y+70, 190, 80, 20, white, alpha(ink, 0.3), 4)
		txtB(dst, "x"+formatFloat(cur), cx-135, c.Y+110, 34, ink, AC)
		poly(dst, yellow, 4, cx-20, c.Y+95, cx+10, c.Y+95, cx+10, c.Y+82, cx+34, c.Y+110, cx+10, c.Y+138, cx+10, c.Y+125, cx-20, c.Y+125)
		box(dst, cx+50, c.Y+70, 190, 80, 20, hexc("#FFF3B8"), alpha(ink, 0.3), 4)
		txtB(dst, "x"+formatFloat(nxt), cx+145, c.Y+110, 34, ink, AC)
		txt(dst, "Multiplicateur de pièces permanent", cx, c.Y+176, 18, ink, AC)
		txtB(dst, "Tu gardes : pets, gemmes, améliorations, passes", cx, c.Y+218, 19, hexc("#1E9E63"), AC)
		txtB(dst, "Tu perds : pièces et mondes débloqués", cx, c.Y+246, 19, hexc("#C2185B"), AC)
		txtB(dst, fmt.Sprintf("Bonus : +%d gemmes", 10*(s.Rebirths+1)), cx, c.Y+274, 19, ink, AC)
		progressBar(dst, cx-250, c.Y+306, 500, 34, s.Coins/cost, yellow)
		txtB(dst, fmtNum(math.Min(s.Coins, cost))+" / "+fmtNum(cost), cx, c.Y+323, 18, ink, AC)
	})
	if g.button(Rect{c.CX() - 160, c.Y + 370, 320, 64}, "Faire un Rebirth", hexc("#8C7BFF"), s.Coins >= cost) {
		g.popup = &Popup{Title: "Rebirth ?", Body: "Tes pièces et tes mondes repartent à zéro, mais tu gagnes x" + formatFloat(nxt) + " pièces pour toujours.", Btn: "C'est parti !", Cancel: true, OnOK: g.doRebirth}
	}
}

// ---------- Réglages ----------

func (g *Game) panelSettings() {
	c := g.panelFrame("Réglages", hexc("#9C93C9"), 760, 540)
	u := &g.ui
	s := g.s
	u.draw(func(dst *ebiten.Image) {
		box(dst, c.X, c.Y+10, c.W, 64, 20, white, alpha(ink, 0.25), 4)
		txtB(dst, "Son", c.X+24, c.Y+41, 22, ink, AL)
	})
	if g.toggle(Rect{c.X + c.W - 100, c.Y + 26, 70, 34}, !s.Muted) {
		s.Muted = !s.Muted
	}
	stats := [][2]string{
		{"Temps de jeu", fmtTime(s.Stats.Play)},
		{"Pièces récoltées", fmtNum(s.TotalCoins)},
		{"Œufs ouverts", fmtNum(float64(s.Stats.Hatched))},
		{"Tas cassés", fmtNum(float64(s.Stats.Piles))},
		{"Clics", fmtNum(float64(s.Stats.Taps))},
		{"Plus gros coup", fmtNum(s.Stats.BestHit)},
		{"Boss vaincus", fmtNum(float64(s.Stats.Bosses))},
		{"Pets découverts", fmt.Sprintf("%d / %d", g.indexCount(), len(allPets))},
	}
	u.draw(func(dst *ebiten.Image) {
		txtB(dst, "Statistiques", c.X, c.Y+104, 22, ink, AL)
		for i, st := range stats {
			x := c.X + float64(i%2)*(c.W/2+8)
			y := c.Y + 128 + float64(i/2)*48
			rrect(dst, x, y, c.W/2-8, 40, 14, white, 3)
			txt(dst, st[0], x+14, y+19, 17, ink, AL)
			txtB(dst, st[1], x+c.W/2-22, y+19, 17, ink, AR)
		}
		txt(dst, "Raccourcis : P pets · I index · B boutique · J quêtes · C mondes · G cadeau · R rebirth · F récolte auto", c.CX(), c.Y+340, 14, hexc("#5A4A7A"), AC)
	})
	bw := (c.W - 32) / 3
	if g.button(Rect{c.X, c.Y + c.H - 70, bw, 56}, "Sauvegarder", sky, true) {
		s.write()
		g.toast("Partie sauvegardée", sky)
	}
	if g.button(Rect{c.X + bw + 16, c.Y + c.H - 70, bw, 56}, "Recommencer", red, true) {
		g.popup = &Popup{Title: "Tout effacer ?", Body: "Ta partie sera supprimée et tu recommenceras depuis le début.", Btn: "Effacer", Cancel: true, OnOK: func() {
			g.s = newSave()
			if g.audio != nil {
				g.audio.muted = &g.s.Muted
			}
			g.refreshDaily()
			g.enterWorld(0)
			g.panel = PanelNone
			g.s.write()
		}}
	}
	if g.button(Rect{c.X + 2*(bw+16), c.Y + c.H - 70, bw, 56}, "Quitter", hexc("#8E8AA8"), true) {
		s.write()
		g.quit = true
	}
}
