-- Usage : cp ../src/shared/MapDecor.luau _gen/ && luau dump_decor.luau > decor.json
-- (imprime le décor des 4 mondes en JSON, pour l'aperçu tools/web)
local json = require("./json")
local Decor = require("./_gen/MapDecor")
local worlds = {
	{ "meadow", { "FF8FB8", "B69CFF", "FFD54A", "7FD6FF", "7EE0B8", "FF9A3C" } },
	{ "choco", { "6B4430", "A8704B", "F3E0C8", "FF8FB8", "4A2C20" } },
	{ "ice", { "FF8FB8", "7EE0B8", "FFF3B8", "B69CFF", "FFFFFF", "A8704B" } },
	{ "galaxy", { "FFD54A", "7EE0B8", "FF8FB8", "7FD6FF", "B69CFF", "FF9A3C" } },
}
local out = {}
for i, w in worlds do
	local list = Decor.build(w[1], w[2], i * 977)
	out[i] = { theme = w[1], parts = list }
end
print(json(out))
