package main

import (
	"image/color"
	"math"
)

type Rarity int

const (
	Common Rarity = iota
	Uncommon
	Rare
	Epic
	Legendary
	Mythic
	Secret
)

var rarityName = [...]string{"Commun", "Peu commun", "Rare", "Épique", "Légendaire", "Mythique", "Secret"}
var rarityCol = [...]color.RGBA{hexc("#8E96AA"), hexc("#2DBE78"), hexc("#3B8FFF"), hexc("#A35BFF"), hexc("#FFB020"), hexc("#FF4F8B"), hexc("#2B2545")}

type PetDef struct {
	ID, Name   string
	Ear, Extra string
	Body       color.RGBA
	Belly      color.RGBA
	Rarity     Rarity
	Power      float64
	Chance     float64 // en %
	Egg        string
}

type EggDef struct {
	ID, Name    string
	World       int
	Price       float64
	Shell, Spot color.RGBA
	Pets        []*PetDef
	X, Y        float64 // position du socle dans le monde
}

type WorldDef struct {
	Name, Theme     string
	Scale, CoinMult float64
	Unlock          float64
	Ground, Ground2 color.RGBA
	Plaza, Edge     color.RGBA
	Banner          color.RGBA
	Dark            bool
	PileCols        []color.RGBA
	Eggs            []*EggDef
}

var (
	petDefs  = map[string]*PetDef{}
	allPets  []*PetDef
	eggs     []*EggDef
	eggByID  = map[string]*EggDef{}
	worlds   []*WorldDef
	golemDef *PetDef
)

func pd(id, name, ear, extra, body, belly string, r Rarity, pow, chance float64) *PetDef {
	return &PetDef{ID: id, Name: name, Ear: ear, Extra: extra, Body: hexc(body), Belly: hexc(belly), Rarity: r, Power: pow, Chance: chance}
}

func addEgg(id, name string, world int, price float64, shell, spot string, pets ...*PetDef) {
	e := &EggDef{ID: id, Name: name, World: world, Price: price, Shell: hexc(shell), Spot: hexc(spot), Pets: pets}
	for _, p := range pets {
		p.Egg = id
		petDefs[p.ID] = p
		allPets = append(allPets, p)
	}
	eggs = append(eggs, e)
	eggByID[id] = e
	worlds[world].Eggs = append(worlds[world].Eggs, e)
}

func init() {
	worlds = []*WorldDef{
		{Name: "Candy Meadow", Theme: "meadow", Scale: 1, CoinMult: 1, Unlock: 0,
			Ground: hexc("#FFE6F0"), Ground2: hexc("#FFD9E8"), Plaza: hexc("#FFF6E6"), Edge: hexc("#A6E8C4"), Banner: yellow,
			PileCols: []color.RGBA{pink, lilac, yellow, sky, mint, orange}},
		{Name: "Choco Land", Theme: "choco", Scale: 45, CoinMult: 1.5, Unlock: 60e3,
			Ground: hexc("#D9AE85"), Ground2: hexc("#CC9E74"), Plaza: hexc("#F3DCC2"), Edge: hexc("#8A5A3C"), Banner: hexc("#C98A5A"),
			PileCols: []color.RGBA{hexc("#6B4430"), hexc("#A8704B"), hexc("#F3E0C8"), hexc("#FF8FB8"), hexc("#4A2C20")}},
		{Name: "Ice Cream Island", Theme: "ice", Scale: 2200, CoinMult: 2, Unlock: 15e6,
			Ground: hexc("#E6F7FF"), Ground2: hexc("#D6F0FF"), Plaza: hexc("#FFFFFF"), Edge: hexc("#7FD6FF"), Banner: mint,
			PileCols: []color.RGBA{pink, mint, hexc("#FFF3B8"), lilac, hexc("#FFFFFF"), hexc("#A8704B")}},
		{Name: "Gummy Galaxy", Theme: "galaxy", Scale: 110e3, CoinMult: 3, Unlock: 3e9, Dark: true,
			Ground: hexc("#2E2752"), Ground2: hexc("#28224A"), Plaza: hexc("#3F3670"), Edge: hexc("#1B1630"), Banner: lilac,
			PileCols: []color.RGBA{yellow, mint, pink, sky, lilac, orange}},
	}

	addEgg("candy", "Candy Egg", 0, 500, "#FF9EC4", "#FFE3EE",
		pd("gumdrop_bunny", "Gumdrop Bunny", "long", "", "#FF9EC4", "#FFE3EE", Common, 2, 60),
		pd("jelly_cat", "Jelly Cat", "point", "", "#7FD6FF", "#E3F6FF", Uncommon, 3.5, 28),
		pd("cupcake_pup", "Cupcake Pup", "floppy", "", "#FFC97A", "#FFF0D6", Rare, 6, 10),
		pd("lollipop_fox", "Lollipop Fox", "point", "tail", "#FF8A4C", "#FFF0DD", Epic, 14, 1.9),
		pd("mochi_dragon", "Mochi Dragon", "horn", "wings", "#B69CFF", "#EBE2FF", Legendary, 60, 0.1),
	)
	addEgg("berry", "Berry Egg", 0, 7500, "#B69CFF", "#EBE2FF",
		pd("berry_bunny", "Berry Bunny", "long", "", "#C86BD8", "#F3D6F8", Common, 9, 58),
		pd("cotton_cloud", "Cotton Cloud", "none", "", "#CFEFFF", "#FFFFFF", Uncommon, 14, 28),
		pd("grape_cat", "Grape Cat", "point", "", "#8E6BE8", "#E2D8FF", Rare, 22, 11),
		pd("razz_dragon", "Razzberry Dragon", "horn", "wings", "#FF5A8A", "#FFD6E2", Epic, 55, 2.8),
		pd("donut_unicorn", "Donut Unicorn", "point", "unicorn", "#FFF1F8", "#FFFFFF", Legendary, 220, 0.2),
	)
	addEgg("choco", "Choco Egg", 1, 120e3, "#A8704B", "#E8C9A8",
		pd("choco_bear", "Choco Bear", "round", "", "#A8704B", "#E8C9A8", Common, 120, 58),
		pd("truffle_pup", "Truffle Pup", "floppy", "", "#7A4E36", "#C9A07E", Uncommon, 180, 28),
		pd("cocoa_fox", "Cocoa Fox", "point", "tail", "#C47A3D", "#F3D9B8", Rare, 290, 11),
		pd("fudge_dragon", "Fudge Dragon", "horn", "wings", "#5A3424", "#B58A6A", Epic, 700, 2.6),
		pd("golden_king", "Golden Gummy King", "round", "crown", "#FFD23F", "#FFF1A8", Legendary, 3000, 0.4),
	)
	addEgg("mocha", "Mocha Egg", 1, 1e6, "#7A4E36", "#C9A07E",
		pd("mocha_cat", "Mocha Cat", "point", "", "#B08060", "#EAD7C2", Common, 420, 58),
		pd("caramel_bear", "Caramel Bear", "round", "", "#E0A040", "#FBE3B5", Uncommon, 640, 28),
		pd("toffee_unicorn", "Toffee Unicorn", "point", "unicorn", "#F5D6A8", "#FFF4E0", Rare, 1000, 11),
		pd("brownie_dragon", "Brownie Dragon", "horn", "wings", "#4A2C20", "#9C6E52", Epic, 2600, 2.86),
		pd("choco_phantom", "Choco Phantom", "none", "halo", "#3A2418", "#7A5440", Legendary, 15000, 0.14),
	)
	addEgg("frost", "Frost Egg", 2, 20e6, "#CFF3FF", "#FFFFFF",
		pd("vanilla_bunny", "Vanilla Bunny", "long", "", "#FFF6E0", "#FFFFFF", Common, 6000, 58),
		pd("mint_cat", "Mint Cat", "point", "", "#7EE0B8", "#DDF8EC", Uncommon, 9000, 28),
		pd("sorbet_fox", "Sorbet Fox", "point", "tail", "#FF7A9A", "#FFE0E8", Rare, 14000, 11),
		pd("frosty_cloud", "Frosty Cloud", "none", "", "#A8DCFF", "#F0FAFF", Epic, 34000, 2.8),
		pd("ice_unicorn", "Ice Unicorn", "point", "unicorn", "#CFF3FF", "#FFFFFF", Legendary, 150e3, 0.2),
	)
	addEgg("sundae", "Sundae Egg", 2, 180e6, "#FFB3C8", "#FFFFFF",
		pd("sundae_pup", "Sundae Pup", "floppy", "", "#FFB3C8", "#FFFFFF", Common, 22e3, 58),
		pd("cherry_bear", "Cherry Bear", "round", "", "#E8344E", "#FFC6CF", Uncommon, 33e3, 28),
		pd("popsicle_dragon", "Popsicle Dragon", "horn", "wings", "#FF9A3C", "#FFE0B8", Rare, 52e3, 11),
		pd("split_unicorn", "Banana Split Unicorn", "point", "unicorn", "#FFE27A", "#FFFAE0", Epic, 130e3, 2.8),
		pd("frozen_king", "Frozen King", "round", "crown", "#8FD8FF", "#E8F8FF", Legendary, 700e3, 0.2),
	)
	addEgg("nebula", "Nebula Egg", 3, 4e9, "#6B5BD6", "#C9C0FF",
		pd("star_bunny", "Star Bunny", "long", "", "#6B5BD6", "#B7AEF5", Common, 300e3, 58),
		pd("cosmic_cat", "Cosmic Cat", "point", "", "#4846A8", "#9C98EC", Uncommon, 450e3, 28),
		pd("comet_fox", "Comet Fox", "point", "tail", "#FF6A3C", "#FFD0B8", Rare, 700e3, 11),
		pd("nebula_dragon", "Nebula Dragon", "horn", "wings", "#C04BD8", "#F0C0FA", Epic, 1.8e6, 2.79),
		pd("sugar_phantom", "Sugar Phantom", "none", "halo", "#4B3A8C", "#7C6BD0", Legendary, 9e6, 0.2),
		pd("gummy_void", "Gummy Void", "none", "halo", "#1B1630", "#4B3A8C", Secret, 6e7, 0.01),
	)
	addEgg("star", "Star Egg", 3, 40e9, "#FFD54A", "#FFF3B8",
		pd("astro_pup", "Astro Pup", "floppy", "", "#E0E6FF", "#FFFFFF", Common, 2.2e6, 58),
		pd("galaxy_bear", "Galaxy Bear", "round", "", "#3A3266", "#7C6BD0", Uncommon, 3.3e6, 28),
		pd("meteor_unicorn", "Meteor Unicorn", "point", "unicorn", "#FFB86B", "#FFF0DA", Rare, 5.2e6, 11),
		pd("void_dragon", "Void Dragon", "horn", "wings", "#2A2350", "#6B5BD6", Epic, 1.3e7, 2.8),
		pd("supernova_king", "Supernova King", "round", "crown", "#FF5A6E", "#FFD0D6", Legendary, 8e7, 0.2),
	)

	golemDef = pd("gummy_golem", "Gummy Golem", "none", "golem", "#6FD66F", "#CFF7CF", Mythic, 0, 0)
	golemDef.Egg = "boss"
	petDefs[golemDef.ID] = golemDef
	allPets = append(allPets, golemDef)

	// Socles d'œufs : deux par monde, côte à côte sur la place.
	for _, w := range worlds {
		for i, e := range w.Eggs {
			e.X = 1060 + float64(i)*280
			e.Y = 470
		}
	}
}

// ---------- améliorations ----------

type UpgradeDef struct {
	ID, Name, Desc string
	Max            int
	Base, Growth   float64
	Gem            bool
}

var upgrades = []*UpgradeDef{
	{ID: "power", Name: "Pets costauds", Desc: "+10 % de dégâts des pets", Max: 40, Base: 300, Growth: 2.1},
	{ID: "tap", Name: "Clic sucré", Desc: "+50 % de dégâts du clic", Max: 25, Base: 120, Growth: 2.05},
	{ID: "crit", Name: "Coup critique", Desc: "+2 % de chances de critique", Max: 15, Base: 800, Growth: 2.3},
	{ID: "golden", Name: "Bonbons dorés", Desc: "+1 % de tas dorés (x5 pièces)", Max: 15, Base: 2500, Growth: 2.4},
	{ID: "speed", Name: "Baskets guimauve", Desc: "+8 % de vitesse de marche", Max: 10, Base: 250, Growth: 2.0},
	{ID: "slot", Name: "Emplacement de pet", Desc: "+1 pet équipé", Max: 8, Base: 20, Growth: 1.55, Gem: true},
	{ID: "storage", Name: "Inventaire +25", Desc: "+25 places pour tes pets", Max: 10, Base: 10, Growth: 1.4, Gem: true},
	{ID: "luck", Name: "Trèfle sucré", Desc: "+15 % de chance sur les œufs", Max: 10, Base: 15, Growth: 1.5, Gem: true},
	{ID: "coins", Name: "Tirelire", Desc: "+10 % de pièces", Max: 20, Base: 15, Growth: 1.35, Gem: true},
}

func (u *UpgradeDef) Cost(level int) float64 {
	return math.Floor(u.Base * math.Pow(u.Growth, float64(level)))
}

type PassDef struct {
	ID, Name, Desc string
	Price          float64
}

var passes = []*PassDef{
	{ID: "triple", Name: "Triple éclosion", Desc: "Ouvre 3 œufs d'un coup", Price: 120},
	{ID: "auto", Name: "Auto-éclosion", Desc: "Ouvre des œufs en boucle", Price: 80},
	{ID: "coins2", Name: "Pièces x2", Desc: "Double toutes tes pièces, pour toujours", Price: 300},
	{ID: "luck2", Name: "Chance x2", Desc: "Double ta chance sur les œufs", Price: 220},
}

type PotionDef struct {
	ID, Name string
	Col      color.RGBA
	Price    float64
}

var potions = []*PotionDef{
	{ID: "coins", Name: "Potion de pièces x2", Col: yellow, Price: 10},
	{ID: "luck", Name: "Potion de chance x2", Col: mint, Price: 10},
	{ID: "dmg", Name: "Potion de force x2", Col: red, Price: 10},
}

const potionDuration = 600.0

// ---------- paliers de l'index ----------

var indexMilestones = []struct {
	Need int
	Gems float64
}{{5, 10}, {10, 20}, {18, 40}, {26, 60}, {34, 100}, {41, 250}}

func rebirthCost(r int) float64 { return 250e3 * math.Pow(12, float64(r)) }
func rebirthMult(r int) float64 { return 1 + 0.5*float64(r) }
