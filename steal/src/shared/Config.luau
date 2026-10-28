--!strict
-- Steal a Sweet Egg : toutes les données du jeu (pets, œufs, prix, Robux).
-- Partagé entre le serveur et les joueurs.

local Config = {}

local function hex(s: string): Color3
	return Color3.fromHex(s)
end

---------------------------------------------------------------------------
-- Robux
-- Sur le Creator Hub (create.roblox.com) › ton jeu › Monétisation, crée un Pass
-- pour chaque ligne de Passes et un Produit pour chaque ligne de Products, au prix
-- conseillé, puis colle leurs identifiants à la place des 0 et republie.
-- Une ligne à 0 reste affichée dans la boutique mais ne peut pas être achetée.
---------------------------------------------------------------------------
export type Pass = { key: string, id: number, name: string, desc: string, icon: string, robux: number }
Config.Passes = {
	{ key = "vip", id = 0, name = "VIP", desc = "Argent x2 pour toujours + bouton « Tout ramasser »", icon = "👑", robux = 399 },
	{ key = "lock", id = 0, name = "Super cadenas", desc = "+30 s de verrouillage de ta base", icon = "🔒", robux = 149 },
	{ key = "speed", id = 0, name = "Baskets fusée", desc = "+30 % de vitesse (idéal pour voler)", icon = "👟", robux = 99 },
	{ key = "luck", id = 0, name = "Trèfle d'or", desc = "15 % de chance qu'un œuf acheté monte d'une rareté", icon = "🍀", robux = 199 },
	{ key = "hatch", id = 0, name = "Éclosion rapide", desc = "Tes œufs éclosent 2 fois plus vite", icon = "⚡", robux = 149 },
} :: { Pass }

export type Product = { key: string, id: number, name: string, desc: string, icon: string, robux: number }
Config.Products = {
	{ key = "cash1", id = 0, name = "Petit sac d'argent", desc = "10 minutes de tes gains", icon = "💵", robux = 29 },
	{ key = "cash2", id = 0, name = "Valise d'argent", desc = "1 heure de tes gains", icon = "💰", robux = 99 },
	{ key = "cash3", id = 0, name = "Coffre-fort", desc = "8 heures de tes gains", icon = "🏦", robux = 399 },
	{ key = "luckevent", id = 0, name = "Pluie d'œufs rares", desc = "Chance x3 pour tout le serveur, 10 min", icon = "🌈", robux = 149 },
	{ key = "mythic", id = 0, name = "Œuf Mythique", desc = "Un œuf mythique livré dans ta base", icon = "🥚", robux = 249 },
	{ key = "divine", id = 0, name = "Œuf Divin", desc = "Un œuf divin livré dans ta base", icon = "✨", robux = 799 },
} :: { Product }

Config.Music = { id = 1842224894, volume = 0.3 } -- APM « Bubblegum Factory »

---------------------------------------------------------------------------
-- Raretés et œufs : un œuf par rareté, il éclot en un pet de cette rareté
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

export type Egg = {
	id: string,
	name: string,
	rarity: number,
	price: number,
	income: number, -- revenu de base par seconde des pets de cette rareté
	hatch: number, -- secondes avant l'éclosion
	weight: number, -- fréquence sur le tapis
	shell: Color3,
	spot: Color3,
	pets: { { pet: string, chance: number } },
}

Config.Eggs = {} :: { [string]: Egg }
Config.EggOrder = {} :: { string }
local EGGS: { { any } } = {
	{ "Œuf Bonbon", "FF9EC4", "FFE3EE", 25, 1, 6, 50 },
	{ "Œuf Menthe", "7EE0B8", "DDF8EC", 250, 6, 12, 26 },
	{ "Œuf Myrtille", "6FA8FF", "DDEBFF", 2500, 40, 25, 13 },
	{ "Œuf Raisin", "A35BFF", "E6D6FF", 25e3, 300, 40, 7 },
	{ "Œuf Caramel d'or", "FFB020", "FFF0C8", 300e3, 2500, 60, 3 },
	{ "Œuf Mythique", "FF4F8B", "FFD6E4", 4e6, 25e3, 90, 0.8 },
	{ "Œuf Divin", "FFE27A", "FFFFFF", 60e6, 300e3, 150, 0.15 },
}
for r, e in EGGS do
	local egg: Egg = { id = "r" .. r, name = e[1], rarity = r, shell = hex(e[2]), spot = hex(e[3]), price = e[4], income = e[5], hatch = e[6], weight = e[7], pets = {} }
	Config.Eggs[egg.id] = egg
	table.insert(Config.EggOrder, egg.id)
end
function Config.eggOf(rarity: number): Egg
	return Config.Eggs["r" .. rarity]
end

---------------------------------------------------------------------------
-- Pets (les 53 modèles 3D de Sweet Pets)
---------------------------------------------------------------------------
export type Pet = {
	id: string,
	name: string,
	species: string,
	body: Color3,
	belly: Color3,
	dark: Color3?,
	accent: Color3?,
	glow: Color3?,
	rarity: number,
	power: number,
	income: number,
	egg: string,
	scale: number,
}
Config.Pets = {} :: { [string]: Pet }
Config.PetOrder = {} :: { string }
Config.RarityScale = { 1, 1, 1.05, 1.1, 1.2, 1.4, 1.7 }

local function hexOpt(v: any): Color3?
	return if v then hex(v) else nil
end

-- même format que Sweet Pets Factory : on ne garde que les pets
local function addEgg(_id: string, _name: string, _world: number, _price: number, _shell: string, _spot: string, specs: { { any } })
	for _, s in specs do
		local extra = s[9] or {}
		local p: Pet = {
			id = s[1], name = s[2], species = s[3], body = hex(s[4]), belly = hex(s[5]),
			dark = hexOpt(extra.dark), accent = hexOpt(extra.accent), glow = hexOpt(extra.glow),
			rarity = s[6], power = s[7], income = 0, egg = "r" .. s[6], scale = Config.RarityScale[s[6]],
		}
		Config.Pets[p.id] = p
		table.insert(Config.PetOrder, p.id)
	end
end
local MYTH, DIV = 0, 0

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


-- Revenu de chaque pet : de 1x à 2,5x le revenu de son œuf selon sa puissance d'origine.
-- Les plus forts sortent plus rarement.
for _, eggId in Config.EggOrder do
	local egg = Config.Eggs[eggId]
	local list = {}
	for _, id in Config.PetOrder do
		if Config.Pets[id].rarity == egg.rarity then
			table.insert(list, Config.Pets[id])
		end
	end
	table.sort(list, function(a, b)
		return a.power < b.power
	end)
	for i, p in list do
		local k = if #list > 1 then (i - 1) / (#list - 1) else 0
		p.income = math.floor(egg.income * (1 + 1.5 * k) + 0.5)
		table.insert(egg.pets, { pet = p.id, chance = 1 / (1 + 0.5 * (i - 1)) })
	end
end

---------------------------------------------------------------------------
-- Mutations à l'éclosion : 1 = Doré (x3), 2 = Arc-en-ciel (x10), shiny (x1,5)
---------------------------------------------------------------------------
Config.GOLD_CHANCE = 0.08
Config.RAINBOW_CHANCE = 0.015
Config.SHINY_CHANCE = 0.03
Config.TierNames = { [0] = "", [1] = "Doré", [2] = "Arc-en-ciel" }
function Config.tierMult(tier: number): number
	return if tier == 1 then 3 elseif tier == 2 then 10 else 1
end
function Config.petIncome(def: string, tier: number, shiny: boolean): number
	local p = Config.Pets[def]
	if not p then
		return 0
	end
	return p.income * Config.tierMult(tier) * (if shiny then 1.5 else 1)
end
function Config.sellPrice(def: string, tier: number, shiny: boolean): number
	return math.floor(Config.petIncome(def, tier, shiny) * 20)
end

---------------------------------------------------------------------------
-- Bases, verrou, rebirth
---------------------------------------------------------------------------
Config.MAX_PLAYERS = 8
Config.SLOT_LEVELS = { 10, 15, 20 } -- emplacements selon l'agrandissement
Config.EXPAND_COST = { 50e3, 5e6 } -- prix pour passer à 15 puis 20
Config.LOCK_TIME = 60
Config.START_CASH = 100
Config.CONVEYOR_SPEED = 7
Config.CONVEYOR_EVERY = 2.2
Config.STEAL_SPEED = 0.7 -- vitesse du voleur qui porte un pet
Config.CARRY_TIME = 60 -- au-delà, le pet retourne chez lui

function Config.rebirthCost(r: number): number
	return 1e6 * 10 ^ r
end
function Config.rebirthMult(r: number): number
	return 1 + 0.5 * r
end

local suffixes = { "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc" }
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
	if sec >= 60 then
		return string.format("%d:%02d", sec // 60, sec % 60)
	end
	return tostring(sec) .. "s"
end

return Config
