package main

import (
	"encoding/json"
	"math/rand"
	"os"
	"path/filepath"
	"time"
)

type OwnedPet struct {
	UID   int64   `json:"uid"`
	Def   string  `json:"def"`
	Tier  int     `json:"tier"` // 0 normal, 1 doré, 2 arc-en-ciel
	Shiny bool    `json:"shiny,omitempty"`
	Level int     `json:"lvl"`
	XP    float64 `json:"xp"`
	Equip bool    `json:"eq,omitempty"`
	Lock  bool    `json:"lock,omitempty"`
	Bonus float64 `json:"bonus,omitempty"` // puissance fixe (pets de boss)
}

type Stats struct {
	Hatched  int     `json:"hatched"`
	Piles    int     `json:"piles"`
	Taps     int     `json:"taps"`
	Bosses   int     `json:"bosses"`
	Golden   int     `json:"golden"`
	Rainbow  int     `json:"rainbow"`
	Upgrades int     `json:"upgrades"`
	Play     float64 `json:"play"`
	BestHit  float64 `json:"bestHit"`
}

type DailyQuest struct {
	Kind    string  `json:"kind"`
	Target  float64 `json:"target"`
	Base    float64 `json:"base"`
	Gems    float64 `json:"gems"`
	Claimed bool    `json:"claimed"`
}

type Save struct {
	Version     int                `json:"version"`
	Coins       float64            `json:"coins"`
	Gems        float64            `json:"gems"`
	TotalCoins  float64            `json:"totalCoins"`
	Rebirths    int                `json:"rebirths"`
	World       int                `json:"world"`
	MaxWorld    int                `json:"maxWorld"`
	Pets        []*OwnedPet        `json:"pets"`
	NextUID     int64              `json:"nextUid"`
	Discovered  map[string]bool    `json:"discovered"`
	Upgrades    map[string]int     `json:"upgrades"`
	Passes      map[string]bool    `json:"passes"`
	Potions     map[string]float64 `json:"potions"`
	Quest       int                `json:"quest"`
	QuestBase   float64            `json:"questBase"`
	DailyDay    string             `json:"dailyDay"`
	Daily       []*DailyQuest      `json:"daily"`
	GiftDay     string             `json:"giftDay"`
	GiftStreak  int                `json:"giftStreak"`
	Stats       Stats              `json:"stats"`
	IndexClaim  int                `json:"indexClaim"`
	BossTimer   float64            `json:"bossTimer"`
	BossWins    int                `json:"bossWins"`
	AutoCollect bool               `json:"autoCollect"`
	Muted       bool               `json:"muted"`
	LastSeen    int64              `json:"lastSeen"`
	Tutorial    bool               `json:"tutorial"`
	AutoDelete  int                `json:"autoDelete"` // rareté max supprimée à l'éclosion, -1 = aucune
}

func newSave() *Save {
	s := &Save{Version: 1, NextUID: 1, BossTimer: 240, AutoCollect: true, AutoDelete: -1}
	s.fix()
	s.addPet("gumdrop_bunny", 0, false)
	s.Pets[0].Equip = true
	return s
}

func (s *Save) fix() {
	if s.Discovered == nil {
		s.Discovered = map[string]bool{}
	}
	if s.Upgrades == nil {
		s.Upgrades = map[string]int{}
	}
	if s.Passes == nil {
		s.Passes = map[string]bool{}
	}
	if s.Potions == nil {
		s.Potions = map[string]float64{}
	}
	if s.World > s.MaxWorld {
		s.World = s.MaxWorld
	}
	if s.MaxWorld >= len(worlds) {
		s.MaxWorld = len(worlds) - 1
	}
	var ok []*OwnedPet
	for _, p := range s.Pets {
		if petDefs[p.Def] != nil {
			ok = append(ok, p)
		}
	}
	s.Pets = ok
}

func (s *Save) addPet(def string, tier int, shiny bool) *OwnedPet {
	p := &OwnedPet{UID: s.NextUID, Def: def, Tier: tier, Shiny: shiny}
	s.NextUID++
	s.Pets = append(s.Pets, p)
	s.Discovered[def] = true
	return p
}

func (s *Save) pet(uid int64) *OwnedPet {
	for _, p := range s.Pets {
		if p.UID == uid {
			return p
		}
	}
	return nil
}

func (s *Save) removePets(uids map[int64]bool) {
	var keep []*OwnedPet
	for _, p := range s.Pets {
		if !uids[p.UID] {
			keep = append(keep, p)
		}
	}
	s.Pets = keep
}

func (s *Save) slots() int   { return 4 + s.Upgrades["slot"] }
func (s *Save) storage() int { return 60 + 25*s.Upgrades["storage"] }

func (s *Save) equippedCount() int {
	n := 0
	for _, p := range s.Pets {
		if p.Equip {
			n++
		}
	}
	return n
}

func savePath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "SweetPetsFactory", "save.json")
}

func loadSave() (*Save, bool) {
	p := savePath()
	if p == "" || debugMode {
		return newSave(), false
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return newSave(), false
	}
	s := &Save{AutoDelete: -1}
	if json.Unmarshal(b, s) != nil {
		return newSave(), false
	}
	s.fix()
	return s, true
}

func (s *Save) write() {
	p := savePath()
	if p == "" || debugMode {
		return
	}
	s.LastSeen = time.Now().Unix()
	b, err := json.MarshalIndent(s, "", " ")
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(p), 0o755)
	tmp := p + ".tmp"
	if os.WriteFile(tmp, b, 0o644) == nil {
		_ = os.Rename(tmp, p)
	}
}

func today() string     { return time.Now().Format("2006-01-02") }
func yesterday() string { return time.Now().AddDate(0, 0, -1).Format("2006-01-02") }

// ---------- quêtes ----------

type QuestDef struct {
	Text  string
	Kind  string
	Goal  float64
	Coins float64
	Gems  float64
}

var starterQuests = []QuestDef{
	{"Casse 10 tas de bonbons", "piles", 10, 150, 0},
	{"Ouvre ton premier œuf", "hatch", 1, 300, 0},
	{"Équipe 3 pets", "equip", 3, 0, 5},
	{"Récolte 5K pièces", "coins", 5000, 1500, 0},
	{"Achète une amélioration", "upgrade", 1, 0, 5},
	{"Ouvre 15 œufs", "hatch", 15, 0, 10},
	{"Fusionne un pet doré", "golden", 1, 0, 20},
	{"Bats le Gummy Golem", "boss", 1, 0, 30},
	{"Débloque Choco Land", "world", 1, 0, 30},
	{"Fais ton premier Rebirth", "rebirth", 1, 0, 60},
	{"Ouvre 150 œufs", "hatch", 150, 0, 60},
	{"Débloque Ice Cream Island", "world", 2, 0, 100},
	{"Fusionne un pet arc-en-ciel", "rainbow", 1, 0, 120},
	{"Débloque Gummy Galaxy", "world", 3, 0, 200},
	{"Atteins le Rebirth 5", "rebirth", 5, 0, 300},
}

// Quêtes « absolues » : on compare à l'état actuel et non à un compteur.
func absoluteKind(k string) bool { return k == "equip" || k == "world" || k == "rebirth" }

func (g *Game) metric(kind string) float64 {
	s := g.s
	switch kind {
	case "piles":
		return float64(s.Stats.Piles)
	case "hatch":
		return float64(s.Stats.Hatched)
	case "equip":
		return float64(s.equippedCount())
	case "coins":
		return s.TotalCoins
	case "upgrade":
		return float64(s.Stats.Upgrades)
	case "golden":
		return float64(s.Stats.Golden)
	case "rainbow":
		return float64(s.Stats.Rainbow)
	case "boss":
		return float64(s.Stats.Bosses)
	case "world":
		return float64(s.MaxWorld)
	case "rebirth":
		return float64(s.Rebirths)
	case "taps":
		return float64(s.Stats.Taps)
	}
	return 0
}

func (g *Game) questProgress() (q *QuestDef, prog float64) {
	if g.s.Quest >= len(starterQuests) {
		return nil, 0
	}
	q = &starterQuests[g.s.Quest]
	if absoluteKind(q.Kind) {
		return q, g.metric(q.Kind)
	}
	return q, g.metric(q.Kind) - g.s.QuestBase
}

func (g *Game) advanceQuest() {
	g.s.Quest++
	if g.s.Quest < len(starterQuests) {
		g.s.QuestBase = g.metric(starterQuests[g.s.Quest].Kind)
	}
}

var dailyText = map[string]string{
	"piles":  "Casse %s tas de bonbons",
	"hatch":  "Ouvre %s œufs",
	"taps":   "Clique %s fois sur des bonbons",
	"coins":  "Récolte %s pièces",
	"boss":   "Bats le boss %s fois",
	"golden": "Fusionne %s pet doré",
}

func (g *Game) refreshDaily() {
	d := today()
	if g.s.DailyDay == d && len(g.s.Daily) == 3 {
		return
	}
	g.s.DailyDay = d
	seed := int64(0)
	for _, c := range d {
		seed = seed*31 + int64(c)
	}
	rng := rand.New(rand.NewSource(seed))
	kinds := []string{"piles", "hatch", "taps", "coins", "boss", "golden"}
	rng.Shuffle(len(kinds), func(i, j int) { kinds[i], kinds[j] = kinds[j], kinds[i] })
	g.s.Daily = nil
	for _, k := range kinds[:3] {
		var t float64
		switch k {
		case "piles":
			t = float64(80 + rng.Intn(8)*20)
		case "hatch":
			t = float64(15 + rng.Intn(5)*5)
		case "taps":
			t = float64(150 + rng.Intn(6)*50)
		case "coins":
			t = roundNice(maxf(5000, g.estimatedCPS()*900))
		case "boss":
			t = 1
		case "golden":
			t = 1
		}
		g.s.Daily = append(g.s.Daily, &DailyQuest{Kind: k, Target: t, Base: g.metric(k), Gems: float64(8 + rng.Intn(8))})
	}
}

func maxf(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func roundNice(v float64) float64 {
	m := 1.0
	for v >= 100 {
		v /= 10
		m *= 10
	}
	return float64(int(v)) * m
}

// ---------- cadeau quotidien ----------

func (g *Game) giftReady() bool { return g.s.GiftDay != today() }

func (g *Game) giftNextStreak() int {
	if g.s.GiftDay == yesterday() {
		return g.s.GiftStreak%7 + 1
	}
	return 1
}
