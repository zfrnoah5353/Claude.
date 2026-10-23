package main

import (
	"fmt"
	"math/rand"
	"testing"
)

// TestEconomy simule un joueur qui clique 4 fois par seconde, ouvre le
// meilleur œuf abordable, achète des améliorations, débloque les mondes et
// fait des rebirths. Elle affiche la progression pour régler l'équilibrage.
func TestEconomy(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}
	initFont()
	s := newSave()
	g := &Game{s: s, rng: rand.New(rand.NewSource(1)), scene: ScenePlay}
	g.enterWorld(0)
	s.AutoDelete = int(Common)
	tapT := 0.0
	logT := 0.0
	seen := map[string]bool{}
	hatched := map[string]int{}
	mark := func(k string) {
		if !seen[k] {
			seen[k] = true
			fmt.Printf("%7s  %-28s coins=%-8s dps=%-8s pets=%d\n", fmtTime(g.t), k, fmtNum(s.Coins), fmtNum(g.teamDPS()), len(s.Pets))
		}
	}
	const hours = 3.0
	for g.t = 0; g.t < hours*3600; g.t += dt {
		// marche vers le tas le plus proche et clique dessus
		if p := g.nearestPile(); p != nil {
			if d := dist(g.px, g.py, p.X, p.Y); d > 60 {
				g.px += (p.X - g.px) / d * g.speed() * dt
				g.py += (p.Y - g.py) / d * g.speed() * dt
			}
			tapT -= dt
			if tapT <= 0 {
				g.tapPile(p)
				tapT = 0.25
			}
		}
		g.updatePets()
		g.updatePiles()
		g.updateFX()
		if g.comboT > 0 {
			g.comboT -= dt
			if g.comboT <= 0 {
				g.combo = 0
			}
		}
		// quêtes
		if q, pr := g.questProgress(); q != nil && pr >= q.Goal {
			g.addCoins(q.Coins, false)
			s.Gems += q.Gems
			mark("quête: " + q.Text)
			g.advanceQuest()
		}
		// décisions toutes les secondes
		logT += dt
		if logT < 1 {
			continue
		}
		logT = 0
		w := worlds[s.World]
		// œuf le plus cher abordable du monde
		for i := len(w.Eggs) - 1; i >= 0; i-- {
			e := w.Eggs[i]
			if s.Coins >= e.Price && len(s.Pets) < s.storage()-3 && hatched[e.ID] < 30 {
				hatched[e.ID]++
				g.tryHatch(e, false)
				g.hatch = nil
				g.equipBest()
				mark("1er " + e.Name)
				break
			}
		}
		if len(s.Pets) > s.storage()-5 {
			rm := map[int64]bool{}
			for _, p := range g.junkPets() {
				rm[p.UID] = true
			}
			s.removePets(rm)
		}
		for _, p := range s.Pets {
			if len(g.craftGroup(p)) >= 5 && p.Tier < 2 {
				g.craft(p)
				mark("1re fusion")
				g.equipBest()
				break
			}
		}
		// améliorations en pièces bon marché (< 20 % des pièces)
		for _, up := range upgrades {
			if !up.Gem && s.Upgrades[up.ID] < up.Max && up.Cost(s.Upgrades[up.ID]) < s.Coins*0.2 {
				s.Coins -= up.Cost(s.Upgrades[up.ID])
				s.Upgrades[up.ID]++
				s.Stats.Upgrades++
			}
		}
		if s.Gems >= 20 && s.Upgrades["slot"] < 8 && s.Gems >= upgrades[5].Cost(s.Upgrades["slot"]) {
			s.Gems -= upgrades[5].Cost(s.Upgrades["slot"])
			s.Upgrades["slot"]++
			g.equipBest()
		}
		next := s.MaxWorld + 1
		if next < len(worlds) && s.Coins >= worlds[next].Unlock {
			g.unlockWorld(next)
			mark("monde " + worlds[next].Name)
		}
		if s.MaxWorld >= 1 {
			s.AutoDelete = int(Rare)
		}
		if s.MaxWorld > 0 && s.World < s.MaxWorld {
			g.enterWorld(s.MaxWorld)
		}
		// rebirth dès que possible si on n'a plus de monde à débloquer à court terme
		if s.Coins >= rebirthCost(s.Rebirths) && (next >= len(worlds) || worlds[next].Unlock > s.Coins*20) {
			g.doRebirth()
			mark(fmt.Sprintf("rebirth %d", s.Rebirths))
		}
		if int(g.t)%1800 == 0 {
			fmt.Printf("%7s  [état] monde=%s coins=%s dps=%s rebirth=%d index=%d/%d\n", fmtTime(g.t), worlds[s.World].Name, fmtNum(s.Coins), fmtNum(g.teamDPS()), s.Rebirths, g.indexCount(), len(allPets))
		}
	}
}
