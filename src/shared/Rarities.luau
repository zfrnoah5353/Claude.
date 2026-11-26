--!strict
-- Rarity tiers, from most common to rarest.

local Types = require(script.Parent.Types)

local function rarity(
	id: Types.RarityId,
	displayName: string,
	order: number,
	color: Color3,
	hasAura: boolean
): Types.Rarity
	return table.freeze({
		id = id,
		displayName = displayName,
		order = order,
		color = color,
		hasAura = hasAura,
	})
end

local BY_ID: { [Types.RarityId]: Types.Rarity } = {
	Common = rarity("Common", "Commun", 1, Color3.fromRGB(190, 190, 200), false),
	Uncommon = rarity("Uncommon", "Peu commun", 2, Color3.fromRGB(90, 220, 110), false),
	Rare = rarity("Rare", "Rare", 3, Color3.fromRGB(70, 150, 255), false),
	Epic = rarity("Epic", "Épique", 4, Color3.fromRGB(175, 90, 255), false),
	Legendary = rarity("Legendary", "Légendaire", 5, Color3.fromRGB(255, 195, 40), true),
	Mythic = rarity("Mythic", "Mythique", 6, Color3.fromRGB(255, 70, 120), true),
	Divine = rarity("Divine", "Divin", 7, Color3.fromRGB(120, 255, 245), true),
	Secret = rarity("Secret", "SECRET", 8, Color3.fromRGB(20, 20, 30), true),
}

return table.freeze(BY_ID)
