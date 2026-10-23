local Shapes = require("../src/shared/PetShapes")
for _, sp in { "dragon", "king", "unicorn", "phantom", "golem", "pegasus", "cerberus", "sphinx", "anubis", "fenrir", "mammoth", "griffin", "longdragon", "hydra", "phoenix", "kraken", "leviathan" } do
	local parts, bones = Shapes.build(sp, { body = "FF0000", belly = "FFFFFF", dark = "000000", accent = "FFD23F" })
	local bound = Shapes.bindAnims(sp, bones)
	local counts = {}
	for st, l in bound do
		table.insert(counts, st .. "=" .. #l)
	end
	table.sort(counts)
	local unboned = 0
	for _, p in parts do
		if p.bone == 0 then unboned += 1 end
	end
	print(sp, #bones .. " os", table.concat(counts, " "), #parts .. " pièces (" .. unboned .. " fixes)")
end
