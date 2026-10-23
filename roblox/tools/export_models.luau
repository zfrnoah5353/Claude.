-- Exporte en JSON les plans des pets (avec leurs vraies couleurs) pour
-- générer les fichiers .rbxmx et les aperçus. Usage : luau export_models.luau [rareté min]

local stubs = require("./stubs")
local c3 = stubs.c3

local Config = require("./_gen/Config")
local Shapes = require("../src/shared/PetShapes")
local json = require("./json")

local args = { ... }
local minRarity = tonumber(args[1]) or 1
local out = {}
for _, id in Config.PetOrder do
	local def = Config.Pets[id]
	if def.rarity >= minRarity then
		local colors = {
			body = def.body:ToHex(),
			belly = def.belly:ToHex(),
			dark = if def.dark then def.dark:ToHex() else def.body:Lerp(c3(0, 0, 0), 0.3):ToHex(),
			accent = if def.accent then def.accent:ToHex() else "F2C14E",
			glow = if def.glow then def.glow:ToHex() else nil,
		}
		local parts, bones = Shapes.build(def.species, colors)
		table.insert(out, {
			bones = bones,
			anims = Shapes.bindAnims(def.species, bones),
			name = id,
			label = def.name,
			rarity = def.rarity,
			rarityName = Config.Rarities[def.rarity].name,
			scale = def.scale,
			glow = colors.glow or Config.Rarities[def.rarity].color:ToHex(),
			parts = parts,
		})
	end
end
print(json(out))
