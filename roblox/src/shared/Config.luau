--!strict
-- Toutes les données du jeu : mondes, œufs, pets, boutique, quêtes.
-- Ce module est partagé entre le serveur et les joueurs.

local Config = {}

local function hex(s: string): Color3
	return Color3.fromHex(s)
end

---------------------------------------------------------------------------
-- Robux (optionnel)
-- Crée tes Game Passes / Developer Products sur le site Roblox, puis colle
-- leurs identifiants ici. Tant qu'un identifiant vaut 0, l'objet s'achète
-- avec des gemmes gagnées en jeu.
---------------------------------------------------------------------------
Config.GamePassIds = {
	triple = 0, -- Triple éclosion
	auto = 0, -- Auto-éclosion
	coins2 = 0, -- Pièces x2
	luck2 = 0, -- Chance x2
	vip = 0, -- VIP : +2 emplacements de pets, +10 % de pièces
}

Config.GemProducts = {
	-- { id = 123456789, gems = 100, label = "100 gemmes" },
	{ id = 0, gems = 100, label = "Sac de 100 gemmes" },
	{ id = 0, gems = 550, label = "Coffre de 550 gemmes" },
}

---------------------------------------------------------------------------
-- Raretés
---------------------------------------------------------------------------
export type Rarity = { name: string, color: Color3 }

Config.Rarities = {
	{ name = "Commun", color = hex("8E96AA") },
	{ name = "Peu commun", color = hex("2DBE78") },
	{ name = "Rare", color = hex("3B8FFF") },
	{ name = "Épique", color = hex("A35BFF") },
	{ name = "Légendaire", color = hex("FFB020") },
	{ name = "Mythique", color = hex("FF4F8B") },
	{ name = "Divin", color = hex("FFC93C") },
} :: { Rarity }

Config.COMMON, Config.UNCOMMON, Config.RARE, Config.EPIC = 1, 2, 3, 4
Config.LEGENDARY, Config.MYTHIC, Config.DIVINE = 5, 6, 7

---------------------------------------------------------------------------
-- Mondes : chaque monde est une île placée le long de l'axe X.
---------------------------------------------------------------------------
export type World = {
	id: number,
	name: string,
	theme: string,
	scale: number, -- résistance des bonbons
	coinMult: number,
	unlock: number,
	ground: Color3,
	ground2: Color3,
	plaza: Color3,
	banner: Color3,
	candy: { Color3 },
	eggs: { string },
	origin: Vector3,
}

Config.WORLD_SPACING = 700

Config.Worlds = {
	{
		id = 1, origin = Vector3.zero, name = "Candy Meadow", theme = "meadow", scale = 1, coinMult = 1, unlock = 0,
		ground = hex("FFB3CF"), ground2 = hex("FFC6DB"), plaza = hex("FFF6E6"), banner = hex("FFD54A"),
		candy = { hex("FF8FB8"), hex("B69CFF"), hex("FFD54A"), hex("7FD6FF"), hex("7EE0B8"), hex("FF9A3C") },
		eggs = { "candy", "berry" },
	},
	{
		id = 2, origin = Vector3.zero, name = "Choco Land", theme = "choco", scale = 45, coinMult = 1.5, unlock = 60e3,
		ground = hex("CC9E74"), ground2 = hex("D9AE85"), plaza = hex("F3DCC2"), banner = hex("C98A5A"),
		candy = { hex("6B4430"), hex("A8704B"), hex("F3E0C8"), hex("FF8FB8"), hex("4A2C20") },
		eggs = { "choco", "mocha" },
	},
	{
		id = 3, origin = Vector3.zero, name = "Ice Cream Island", theme = "ice", scale = 2200, coinMult = 2, unlock = 15e6,
		ground = hex("B9E4FF"), ground2 = hex("CDEBFF"), plaza = hex("FFFFFF"), banner = hex("7EE0B8"),
		candy = { hex("FF8FB8"), hex("7EE0B8"), hex("FFF3B8"), hex("B69CFF"), hex("FFFFFF"), hex("A8704B") },
		eggs = { "frost", "sundae" },
	},
	{
		id = 4, origin = Vector3.zero, name = "Gummy Galaxy", theme = "galaxy", scale = 110e3, coinMult = 3, unlock = 3e9,
		ground = hex("28224A"), ground2 = hex("2E2752"), plaza = hex("3F3670"), banner = hex("B69CFF"),
		candy = { hex("FFD54A"), hex("7EE0B8"), hex("FF8FB8"), hex("7FD6FF"), hex("B69CFF"), hex("FF9A3C") },
		eggs = { "nebula", "star" },
	},
} :: { World }

for i, w in Config.Worlds do
	w.origin = Vector3.new((i - 1) * Config.WORLD_SPACING, 0, 0)
end

Config.BOSS_ORIGIN = Vector3.new(-900, 0, 0)

---------------------------------------------------------------------------
-- Pets et œufs
---------------------------------------------------------------------------
export type Pet = {
	id: string,
	name: string,
	species: string, -- plan 3D dans PetShapes
	body: Color3,
	belly: Color3,
	dark: Color3?,
	accent: Color3?,
	glow: Color3?,
	rarity: number,
	power: number,
	egg: string,
	scale: number, -- taille dans le monde
}

export type EggEntry = { pet: string, chance: number }

export type Egg = {
	id: string,
	name: string,
	world: number,
	price: number,
	shell: Color3,
	spot: Color3,
	pets: { EggEntry },
}

Config.Pets = {} :: { [string]: Pet }
Config.PetOrder = {} :: { string }
Config.Eggs = {} :: { [string]: Egg }
Config.EggOrder = {} :: { string }

-- Taille des pets selon la rareté : les mythiques et les divins sont plus imposants
Config.RarityScale = { 1, 1, 1, 1.05, 1.1, 1.35, 1.7 }

type PetSpec = { any }

local function hexOpt(v: any): Color3?
	return if v then hex(v) else nil
end

local function addEgg(id: string, name: string, world: number, price: number, shell: string, spot: string, specs: { PetSpec })
	local egg: Egg = { id = id, name = name, world = world, price = price, shell = hex(shell), spot = hex(spot), pets = {} }
	for _, s in specs do
		local extra = s[9] or {}
		local p: Pet = {
			id = s[1],
			name = s[2],
			species = s[3],
			body = hex(s[4]),
			belly = hex(s[5]),
			dark = hexOpt(extra.dark),
			accent = hexOpt(extra.accent),
			glow = hexOpt(extra.glow),
			rarity = s[6],
			power = s[7],
			egg = id,
			scale = Config.RarityScale[s[6]],
		}
		Config.Pets[p.id] = p
		table.insert(Config.PetOrder, p.id)
		table.insert(egg.pets, { pet = p.id, chance = s[8] })
	end
	Config.Eggs[id] = egg
	table.insert(Config.EggOrder, id)
end

-- Raretés : 1 Commun, 2 Peu commun, 3 Rare, 4 Épique, 5 Légendaire, 6 Mythique, 7 Divin
-- id, nom, espèce, corps, ventre, rareté, puissance, chance (%), couleurs en plus
local MYTH, DIV = 0.05, 0.004

-- Candy Meadow : mythologie grecque
addEgg("candy", "Candy Egg", 1, 500, "FF9EC4", "FFE3EE", {
	{ "gumdrop_bunny", "Gumdrop Bunny", "bunny", "FF9EC4", "FFE3EE", 1, 2, 60 },
	{ "jelly_cat", "Jelly Cat", "cat", "7FD6FF", "E3F6FF", 2, 3.5, 28 },
	{ "cupcake_pup", "Cupcake Pup", "pup", "FFC97A", "FFF0D6", 3, 6, 10, { dark = "C98A4A" } },
	{ "lollipop_fox", "Lollipop Fox", "fox", "FF8A4C", "FFF0DD", 4, 14, 1.9 },
	{ "mochi_dragon", "Mochi Dragon", "dragon", "B69CFF", "EBE2FF", 5, 60, 0.1, { dark = "6B5BD6", accent = "FFD23F" } },
	{ "pegasus", "Pégase Barbe-à-Papa", "pegasus", "FFF6FB", "FFD6EC", 6, 600, MYTH, { accent = "FF8FB8" } },
})
addEgg("berry", "Berry Egg", 1, 7500, "B69CFF", "EBE2FF", {
	{ "berry_bunny", "Berry Bunny", "bunny", "C86BD8", "F3D6F8", 1, 9, 58 },
	{ "cotton_cloud", "Cotton Cloud", "cloud", "CFEFFF", "FFFFFF", 2, 14, 28 },
	{ "grape_cat", "Grape Cat", "cat", "8E6BE8", "E2D8FF", 3, 22, 11 },
	{ "razz_dragon", "Razzberry Dragon", "dragon", "FF5A8A", "FFD6E2", 4, 55, 2.8, { dark = "B8285A", accent = "FFD23F" } },
	{ "donut_unicorn", "Donut Unicorn", "unicorn", "FFF1F8", "FFFFFF", 5, 220, 0.2 },
	{ "cerberus", "Cerbère Guimauve", "cerberus", "F5E6FF", "FFFFFF", 6, 2200, MYTH, { dark = "B69CFF", glow = "FF4FD8" } },
	{ "hydra", "Hydre d'Olympe", "hydra", "6B3FA0", "C9A6FF", 7, 11000, DIV, { accent = "C6FF4F", glow = "C6FF4F" } },
})
-- Choco Land : mythologie égyptienne
addEgg("choco", "Choco Egg", 2, 120e3, "A8704B", "E8C9A8", {
	{ "choco_bear", "Choco Bear", "bear", "A8704B", "E8C9A8", 1, 120, 58 },
	{ "truffle_pup", "Truffle Pup", "pup", "7A4E36", "C9A07E", 2, 180, 28, { dark = "4A2C20" } },
	{ "cocoa_fox", "Cocoa Fox", "fox", "C47A3D", "F3D9B8", 3, 290, 11 },
	{ "fudge_dragon", "Fudge Dragon", "dragon", "5A3424", "B58A6A", 4, 700, 2.6, { dark = "2E1A12", accent = "FFD23F" } },
	{ "golden_king", "Golden Gummy King", "king", "FFD23F", "FFF1A8", 5, 3000, 0.4 },
	{ "sphinx", "Sphinx Praliné", "sphinx", "D9A066", "F0C890", 6, 30000, MYTH, { glow = "5BE7FF" } },
})
addEgg("mocha", "Mocha Egg", 2, 1e6, "7A4E36", "C9A07E", {
	{ "mocha_cat", "Mocha Cat", "cat", "B08060", "EAD7C2", 1, 420, 58 },
	{ "caramel_bear", "Caramel Bear", "bear", "E0A040", "FBE3B5", 2, 640, 28 },
	{ "toffee_unicorn", "Toffee Unicorn", "unicorn", "F5D6A8", "FFF4E0", 3, 1000, 11 },
	{ "brownie_dragon", "Brownie Dragon", "dragon", "4A2C20", "9C6E52", 4, 2600, 2.86, { dark = "2A1810", accent = "FFD23F" } },
	{ "choco_phantom", "Choco Phantom", "phantom", "3A2418", "7A5440", 5, 15000, 0.14, { glow = "FFC97A" } },
	{ "anubis", "Anubis Cacao", "anubis", "2A2230", "4A3A50", 6, 150e3, MYTH, { glow = "FFD54A" } },
	{ "ra_phoenix", "Ra, Phénix Solaire", "phoenix", "FF5A1F", "FFD23F", 7, 750e3, DIV, { glow = "FFF3B8" } },
})
-- Ice Cream Island : mythologie nordique
addEgg("frost", "Frost Egg", 3, 20e6, "CFF3FF", "FFFFFF", {
	{ "vanilla_bunny", "Vanilla Bunny", "bunny", "FFF6E0", "FFFFFF", 1, 6000, 58 },
	{ "mint_cat", "Mint Cat", "cat", "7EE0B8", "DDF8EC", 2, 9000, 28 },
	{ "sorbet_fox", "Sorbet Fox", "fox", "FF7A9A", "FFE0E8", 3, 14000, 11 },
	{ "frosty_cloud", "Frosty Cloud", "cloud", "A8DCFF", "F0FAFF", 4, 34000, 2.8 },
	{ "ice_unicorn", "Ice Unicorn", "unicorn", "CFF3FF", "FFFFFF", 5, 150e3, 0.2 },
	{ "fenrir", "Fenrir Lune de Sang", "fenrir", "2A1F2E", "6A1E2A", 6, 1.5e6, MYTH, { dark = "16101A", glow = "FF2A3D" } },
})
addEgg("sundae", "Sundae Egg", 3, 180e6, "FFB3C8", "FFFFFF", {
	{ "sundae_pup", "Sundae Pup", "pup", "FFB3C8", "FFFFFF", 1, 22e3, 58, { dark = "E87A9A" } },
	{ "cherry_bear", "Cherry Bear", "bear", "E8344E", "FFC6CF", 2, 33e3, 28 },
	{ "popsicle_dragon", "Popsicle Dragon", "dragon", "FF9A3C", "FFE0B8", 3, 52e3, 11, { dark = "C4621A", accent = "7FD6FF" } },
	{ "split_unicorn", "Banana Split Unicorn", "unicorn", "FFE27A", "FFFAE0", 4, 130e3, 2.8 },
	{ "frozen_king", "Frozen King", "king", "8FD8FF", "E8F8FF", 5, 700e3, 0.2 },
	{ "mammoth", "Mammouth d'Ymir", "mammoth", "7A4A2A", "EEE6D0", 6, 7e6, MYTH, { dark = "4A2A14", glow = "FFE27A" } },
	{ "kraken", "Kraken des Abysses", "kraken", "2A8C8A", "7FE0D8", 7, 3.5e7, DIV, { accent = "9FF2EA", glow = "FFE27A" } },
})
-- Gummy Galaxy : mythologies célestes
addEgg("nebula", "Nebula Egg", 4, 4e9, "6B5BD6", "C9C0FF", {
	{ "star_bunny", "Star Bunny", "bunny", "6B5BD6", "B7AEF5", 1, 300e3, 58 },
	{ "cosmic_cat", "Cosmic Cat", "cat", "4846A8", "9C98EC", 2, 450e3, 28 },
	{ "comet_fox", "Comet Fox", "fox", "FF6A3C", "FFD0B8", 3, 700e3, 11 },
	{ "nebula_dragon", "Nebula Dragon", "dragon", "C04BD8", "F0C0FA", 4, 1.8e6, 2.79, { dark = "6E2280", accent = "7FD6FF" } },
	{ "sugar_phantom", "Sugar Phantom", "phantom", "4B3A8C", "7C6BD0", 5, 9e6, 0.2, { glow = "B9F3FF" } },
	{ "griffin", "Griffon Céleste", "griffin", "C89A50", "FFFFFF", 6, 9e7, MYTH, { accent = "8C7BFF", dark = "4B3A8C", glow = "7FD6FF" } },
})
addEgg("star", "Star Egg", 4, 40e9, "FFD54A", "FFF3B8", {
	{ "astro_pup", "Astro Pup", "pup", "E0E6FF", "FFFFFF", 1, 2.2e6, 58, { dark = "9AA6E0" } },
	{ "galaxy_bear", "Galaxy Bear", "bear", "3A3266", "7C6BD0", 2, 3.3e6, 28 },
	{ "meteor_unicorn", "Meteor Unicorn", "unicorn", "FFB86B", "FFF0DA", 3, 5.2e6, 11 },
	{ "void_dragon", "Void Dragon", "dragon", "2A2350", "6B5BD6", 4, 1.3e7, 2.8, { dark = "14102A", accent = "C04BD8" } },
	{ "supernova_king", "Supernova King", "king", "FF5A6E", "FFD0D6", 5, 8e7, 0.2 },
	{ "longdragon", "Dragon Céleste", "longdragon", "3DBE8C", "D8FFE8", 6, 8e8, MYTH, { accent = "FFD23F", glow = "FFE27A" } },
	{ "leviathan", "Léviathan Cosmique", "leviathan", "2E9AA0", "B8F5EE", 7, 4e9, DIV, { accent = "9FF2EA", dark = "1E5C66", glow = "FFE27A" } },
})

-- Pet exclusif du boss (sa puissance dépend du joueur qui le gagne)
Config.Pets.gummy_golem = {
	id = "gummy_golem", name = "Gummy Golem", species = "golem",
	body = hex("6FD66F"), belly = hex("CFF7CF"), dark = hex("3FA34F"), accent = nil, glow = hex("FFE27A"),
	rarity = 6, power = 0, egg = "boss", scale = 1.2,
}
table.insert(Config.PetOrder, "gummy_golem")

---------------------------------------------------------------------------
-- Améliorations, potions, passes
---------------------------------------------------------------------------
export type Upgrade = { id: string, name: string, desc: string, max: number, base: number, growth: number, gem: boolean }

Config.Upgrades = {
	{ id = "power", name = "Pets costauds", desc = "+10 % de dégâts des pets", max = 40, base = 300, growth = 2.1, gem = false },
	{ id = "tap", name = "Clic sucré", desc = "+50 % de dégâts du clic", max = 25, base = 120, growth = 2.05, gem = false },
	{ id = "crit", name = "Coup critique", desc = "+2 % de chances de critique", max = 15, base = 800, growth = 2.3, gem = false },
	{ id = "golden", name = "Bonbons dorés", desc = "+1 % de chance de gain x5", max = 15, base = 2500, growth = 2.4, gem = false },
	{ id = "speed", name = "Baskets guimauve", desc = "+8 % de vitesse de marche", max = 10, base = 250, growth = 2.0, gem = false },
	{ id = "slot", name = "Emplacement de pet", desc = "+1 pet équipé", max = 8, base = 20, growth = 1.55, gem = true },
	{ id = "storage", name = "Inventaire +25", desc = "+25 places pour tes pets", max = 10, base = 10, growth = 1.4, gem = true },
	{ id = "luck", name = "Trèfle sucré", desc = "+15 % de chance sur les œufs", max = 10, base = 15, growth = 1.5, gem = true },
	{ id = "coins", name = "Tirelire", desc = "+10 % de pièces", max = 20, base = 15, growth = 1.35, gem = true },
} :: { Upgrade }

function Config.upgradeCost(u: Upgrade, level: number): number
	return math.floor(u.base * u.growth ^ level)
end

Config.Passes = {
	{ id = "triple", name = "Triple éclosion", desc = "Ouvre 3 œufs d'un coup", gems = 120 },
	{ id = "auto", name = "Auto-éclosion", desc = "Ouvre des œufs en boucle", gems = 80 },
	{ id = "coins2", name = "Pièces x2", desc = "Double toutes tes pièces", gems = 300 },
	{ id = "luck2", name = "Chance x2", desc = "Double ta chance sur les œufs", gems = 220 },
	{ id = "vip", name = "VIP", desc = "+2 emplacements, +10 % de pièces", gems = 400 },
}

-- Identifiants Roblox (UserId) des admins. Le créateur du jeu est toujours admin,
-- et dans Studio tout le monde l'est pour pouvoir tester.
Config.AdminIds = {} :: { number }

Config.Potions = {
	{ id = "coins", name = "Potion de pièces x2", color = hex("FFD54A"), gems = 10 },
	{ id = "luck", name = "Potion de chance x2", color = hex("7EE0B8"), gems = 10 },
	{ id = "dmg", name = "Potion de force x2", color = hex("FF5A6E"), gems = 10 },
}
Config.POTION_TIME = 600

---------------------------------------------------------------------------
-- Quêtes, index, cadeau
---------------------------------------------------------------------------
export type Quest = { text: string, kind: string, goal: number, coins: number, gems: number }

Config.StarterQuests = {
	{ text = "Casse 10 tas de bonbons", kind = "piles", goal = 10, coins = 150, gems = 0 },
	{ text = "Ouvre ton premier œuf", kind = "hatch", goal = 1, coins = 300, gems = 0 },
	{ text = "Équipe 3 pets", kind = "equip", goal = 3, coins = 0, gems = 5 },
	{ text = "Récolte 5K pièces", kind = "coins", goal = 5000, coins = 1500, gems = 0 },
	{ text = "Achète une amélioration", kind = "upgrade", goal = 1, coins = 0, gems = 5 },
	{ text = "Ouvre 15 œufs", kind = "hatch", goal = 15, coins = 0, gems = 10 },
	{ text = "Fusionne un pet doré", kind = "golden", goal = 1, coins = 0, gems = 20 },
	{ text = "Bats le Gummy Golem", kind = "boss", goal = 1, coins = 0, gems = 30 },
	{ text = "Débloque Choco Land", kind = "world", goal = 2, coins = 0, gems = 30 },
	{ text = "Fais ton premier Rebirth", kind = "rebirth", goal = 1, coins = 0, gems = 60 },
	{ text = "Ouvre 150 œufs", kind = "hatch", goal = 150, coins = 0, gems = 60 },
	{ text = "Débloque Ice Cream Island", kind = "world", goal = 3, coins = 0, gems = 100 },
	{ text = "Fusionne un pet arc-en-ciel", kind = "rainbow", goal = 1, coins = 0, gems = 120 },
	{ text = "Débloque Gummy Galaxy", kind = "world", goal = 4, coins = 0, gems = 200 },
	{ text = "Atteins le Rebirth 5", kind = "rebirth", goal = 5, coins = 0, gems = 300 },
} :: { Quest }

-- Quêtes dont la progression est l'état actuel (et non un compteur depuis le début)
Config.AbsoluteQuest = { equip = true, world = true, rebirth = true }

Config.DailyText = {
	piles = "Casse %s tas de bonbons",
	hatch = "Ouvre %s œufs",
	taps = "Clique %s fois sur des bonbons",
	coins = "Récolte %s pièces",
	boss = "Bats le boss %s fois",
	golden = "Fusionne %s pet doré",
}

Config.IndexMilestones = {
	{ need = 5, gems = 10 },
	{ need = 10, gems = 20 },
	{ need = 18, gems = 40 },
	{ need = 26, gems = 60 },
	{ need = 34, gems = 100 },
	{ need = 42, gems = 250 },
	{ need = 53, gems = 1000 },
}

Config.GiftLabels = { "Pièces", "10 gemmes", "Potion de pièces", "15 gemmes", "Potion de chance", "25 gemmes", "50 gemmes + force" }

---------------------------------------------------------------------------
-- Formules
---------------------------------------------------------------------------
Config.PILE_HP = { 15, 80, 600 } -- petit, moyen, coffre
Config.BASE_SLOTS = 4
Config.BASE_STORAGE = 60
Config.BOSS_INTERVAL = 600
Config.BOSS_WINDOW = 120
Config.BOSS_FIGHT = 90

function Config.rebirthCost(r: number): number
	return 250e3 * 12 ^ r
end

function Config.rebirthMult(r: number): number
	return 1 + 0.5 * r
end

function Config.tierMult(tier: number): number
	if tier == 1 then
		return 3
	elseif tier == 2 then
		return 10
	end
	return 1
end

Config.TierNames = { [0] = "", [1] = "Doré", [2] = "Arc-en-ciel" }

local suffixes = { "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc" }

-- 1234567 -> "1.23M"
function Config.fmt(n: number): string
	if n ~= n then
		return "0"
	end
	if n < 0 then
		return "-" .. Config.fmt(-n)
	end
	if n < 1000 then
		return tostring(math.floor(n))
	end
	local i = 0
	while n >= 1000 and i < #suffixes do
		n /= 1000
		i += 1
	end
	local s
	if n < 10 then
		s = string.format("%.2f", math.floor(n * 100) / 100)
	elseif n < 100 then
		s = string.format("%.1f", math.floor(n * 10) / 10)
	else
		s = string.format("%d", math.floor(n))
	end
	if string.find(s, "%.") then
		s = string.gsub(s, "0+$", "")
		s = string.gsub(s, "%.$", "")
	end
	return s .. suffixes[i]
end

function Config.fmtTime(sec: number): string
	sec = math.max(0, math.floor(sec))
	if sec >= 3600 then
		return string.format("%dh %02dm", sec // 3600, (sec % 3600) // 60)
	end
	return string.format("%02d:%02d", sec // 60, sec % 60)
end

function Config.fmtChance(c: number): string
	if c >= 10 then
		return string.format("%d %%", math.floor(c + 0.5))
	elseif c >= 1 then
		return string.format("%.1f %%", c)
	elseif c >= 0.1 then
		return string.format("%.2f %%", c)
	end
	return string.format("%.3f %%", c)
end

return Config
