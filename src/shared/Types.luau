--!strict
-- Shared type definitions. Everything that crosses the client/server boundary
-- (remote payloads, snapshots, catalog entries) is declared here so both sides
-- agree by construction. Types are compile-time only: the server still
-- validates every remote argument at runtime (see server/Lib/Guard).

export type RarityId =
	"Common"
	| "Uncommon"
	| "Rare"
	| "Epic"
	| "Legendary"
	| "Mythic"
	| "Divine"
	| "Secret"

export type Rarity = {
	id: RarityId,
	displayName: string,
	order: number,
	color: Color3,
	hasAura: boolean,
}

export type CharacterDef = {
	id: string,
	displayName: string,
	title: string,
	rarity: RarityId,
	oneIn: number, -- base chance is 1 / oneIn
	power: number, -- coins per second while equipped
}

export type UpgradeId = "luck" | "speed" | "income"

export type Upgrades = { [UpgradeId]: number }

-- Full state the client renders. Sent on join and after structural changes.
export type StateSnapshot = {
	coins: number,
	totalRolls: number,
	pity: number,
	bestOneIn: number,
	inventory: { [string]: number },
	equipped: { string },
	discovered: { [string]: boolean },
	upgrades: Upgrades,
	-- derived values, computed by the server (authoritative)
	luck: number,
	rollCooldown: number,
	incomePerSecond: number,
}

export type RollResult = {
	id: string,
	isNew: boolean,
	boosted: boolean, -- every Nth roll gets a luck multiplier
	pityTriggered: boolean, -- guaranteed high rarity
}

export type Announcement = {
	userId: number,
	playerName: string,
	characterId: string,
}

export type CheatCommand = "coins" | "luck" | "pity" | "grantAll" | "reset"

return nil
