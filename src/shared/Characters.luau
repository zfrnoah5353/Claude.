--!strict
-- Character catalog. All characters are original creations for this game.
-- Chances are "1 in oneIn" before luck. The server reads this table as its
-- authority; the client reads it only to render names, colors and odds.

local Types = require(script.Parent.Types)

local LIST: { Types.CharacterDef } = {
	-- Common
	{
		id = "kaito",
		displayName = "Kaito",
		title = "l'Apprenti",
		rarity = "Common",
		oneIn = 2,
		power = 1,
	},
	{
		id = "mika",
		displayName = "Mika",
		title = "la Lycéenne",
		rarity = "Common",
		oneIn = 3,
		power = 2,
	},
	{
		id = "ren",
		displayName = "Ren",
		title = "le Livreur",
		rarity = "Common",
		oneIn = 4,
		power = 3,
	},
	-- Uncommon
	{
		id = "sora",
		displayName = "Sora",
		title = "Lame-Vent",
		rarity = "Uncommon",
		oneIn = 8,
		power = 5,
	},
	{
		id = "yuki",
		displayName = "Yuki",
		title = "Fleur-de-Givre",
		rarity = "Uncommon",
		oneIn = 12,
		power = 7,
	},
	{
		id = "daichi",
		displayName = "Daichi",
		title = "Poing-de-Roche",
		rarity = "Uncommon",
		oneIn = 16,
		power = 9,
	},
	-- Rare
	{
		id = "akane",
		displayName = "Akane",
		title = "Flamme Écarlate",
		rarity = "Rare",
		oneIn = 40,
		power = 18,
	},
	{
		id = "haru",
		displayName = "Haru",
		title = "Archer Céleste",
		rarity = "Rare",
		oneIn = 64,
		power = 25,
	},
	{
		id = "nori",
		displayName = "Nori",
		title = "Maître des Ombres",
		rarity = "Rare",
		oneIn = 100,
		power = 35,
	},
	-- Epic
	{
		id = "rin",
		displayName = "Rin",
		title = "Danseuse de Foudre",
		rarity = "Epic",
		oneIn = 250,
		power = 70,
	},
	{
		id = "takeshi",
		displayName = "Takeshi",
		title = "Samouraï Spectral",
		rarity = "Epic",
		oneIn = 500,
		power = 110,
	},
	{
		id = "ayame",
		displayName = "Ayame",
		title = "Reine des Renards",
		rarity = "Epic",
		oneIn = 800,
		power = 160,
	},
	-- Legendary
	{
		id = "ryuji",
		displayName = "Ryuji",
		title = "Dragon Éveillé",
		rarity = "Legendary",
		oneIn = 2000,
		power = 400,
	},
	{
		id = "hikari",
		displayName = "Hikari",
		title = "Prêtresse de l'Aube",
		rarity = "Legendary",
		oneIn = 3500,
		power = 600,
	},
	{
		id = "kuro",
		displayName = "Kuro",
		title = "Faucheur du Néant",
		rarity = "Legendary",
		oneIn = 5000,
		power = 850,
	},
	-- Mythic
	{
		id = "seiryu",
		displayName = "Seiryu",
		title = "Empereur des Tempêtes",
		rarity = "Mythic",
		oneIn = 15000,
		power = 2500,
	},
	{
		id = "tsukiko",
		displayName = "Tsukiko",
		title = "Déesse Lunaire",
		rarity = "Mythic",
		oneIn = 30000,
		power = 4000,
	},
	-- Divine
	{
		id = "kaguya",
		displayName = "Kaguya",
		title = "Étoile Éternelle",
		rarity = "Divine",
		oneIn = 100000,
		power = 12000,
	},
	{
		id = "zero",
		displayName = "Zero",
		title = "le Héros Sans Nom",
		rarity = "Divine",
		oneIn = 250000,
		power = 25000,
	},
	-- Secret
	{
		id = "anomaly",
		displayName = "???",
		title = "L'Anomalie",
		rarity = "Secret",
		oneIn = 1000000,
		power = 100000,
	},
}

local byId: { [string]: Types.CharacterDef } = {}
for _, def in LIST do
	assert(byId[def.id] == nil, `duplicate character id {def.id}`)
	byId[def.id] = table.freeze(def)
end

-- Rarest first: the order RollLogic walks the table in.
local rarestFirst = table.clone(LIST)
table.sort(rarestFirst, function(a, b)
	return a.oneIn > b.oneIn
end)

local Characters = {}

Characters.list = table.freeze(LIST) -- most common first (display order)
Characters.rarestFirst = table.freeze(rarestFirst)

function Characters.get(id: string): Types.CharacterDef?
	return byId[id]
end

function Characters.fullName(def: Types.CharacterDef): string
	return `{def.displayName} {def.title}`
end

return table.freeze(Characters)
