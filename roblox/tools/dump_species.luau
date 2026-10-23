-- Exporte toutes les espèces avec des couleurs d'essai (aperçu)
local Shapes = require("../src/shared/PetShapes")
local json = require("./json")
local test = {
	bunny = { body = "FF9EC4", belly = "FFE3EE" }, cat = { body = "7FD6FF", belly = "E3F6FF" },
	fox = { body = "FF8A4C", belly = "FFF0DD" }, pup = { body = "FFC97A", belly = "FFF0D6", dark = "C98A4A" },
	bear = { body = "A8704B", belly = "E8C9A8" }, king = { body = "FFD23F", belly = "FFF1A8" },
	dragon = { body = "B69CFF", belly = "EBE2FF", dark = "6B5BD6", accent = "FFD23F" },
	unicorn = { body = "FFF1F8", belly = "FFFFFF" }, cloud = { body = "CFEFFF", belly = "FFFFFF" },
	phantom = { body = "7C6BD0", belly = "B7AEF5" }, golem = { body = "6FD66F", belly = "CFF7CF", dark = "3FA34F" },
	pegasus = { body = "FFF6FB", belly = "FFD6EC", accent = "FF8FB8" },
	cerberus = { body = "F5E6FF", belly = "FFFFFF", dark = "B69CFF", glow = "FF4FD8" },
	sphinx = { body = "D9A066", belly = "F0C890", glow = "5BE7FF" },
	anubis = { body = "2A2230", belly = "4A3A50", glow = "FFD54A" },
	fenrir = { body = "2A1F2E", belly = "6A1E2A", dark = "16101A", glow = "FF2A3D" },
	mammoth = { body = "7A4A2A", belly = "EEE6D0", dark = "4A2A14", glow = "FFE27A" },
	griffin = { body = "C89A50", belly = "FFFFFF", accent = "8C7BFF", dark = "4B3A8C", glow = "7FD6FF" },
	longdragon = { body = "3DBE8C", belly = "D8FFE8", accent = "FFD23F", glow = "FFE27A" },
	hydra = { body = "6B3FA0", belly = "C9A6FF", accent = "C6FF4F", glow = "C6FF4F" },
	phoenix = { body = "FF5A1F", belly = "FFD23F", glow = "FFF3B8" },
	kraken = { body = "2A8C8A", belly = "7FE0D8", accent = "9FF2EA", glow = "FFE27A" },
	leviathan = { body = "2E9AA0", belly = "B8F5EE", accent = "9FF2EA", dark = "1E5C66", glow = "FFE27A" },
}
local order = { "bunny", "cat", "fox", "pup", "bear", "king", "dragon", "unicorn", "cloud", "phantom", "golem",
	"pegasus", "cerberus", "sphinx", "anubis", "fenrir", "mammoth", "griffin", "longdragon", "hydra", "phoenix", "kraken", "leviathan" }
local models = {}
for _, sp in order do
	local c = test[sp]
	c.dark = c.dark or c.body
	c.accent = c.accent or "F2C14E"
	table.insert(models, { name = sp, parts = Shapes.build(sp, c) })
end
print(json(models))
