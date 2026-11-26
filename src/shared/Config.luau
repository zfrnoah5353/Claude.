--!strict
-- Tunable gameplay values. NOTE: replicated to clients — nothing secret here,
-- and the server never trusts a client-reported value from this file.

local Types = require(script.Parent.Types)

type UpgradeDef = {
	id: Types.UpgradeId,
	displayName: string,
	description: string,
	maxLevel: number,
	baseCost: number,
	costGrowth: number,
}

local UPGRADES: { [Types.UpgradeId]: UpgradeDef } = {
	luck = {
		id = "luck",
		displayName = "Chance",
		description = "+15 % de chance par niveau",
		maxLevel = 20,
		baseCost = 100,
		costGrowth = 1.6,
	},
	speed = {
		id = "speed",
		displayName = "Vitesse de roll",
		description = "-0,1 s de délai entre deux rolls",
		maxLevel = 8,
		baseCost = 250,
		costGrowth = 1.8,
	},
	income = {
		id = "income",
		displayName = "Revenus",
		description = "+25 % de pièces par seconde",
		maxLevel = 15,
		baseCost = 150,
		costGrowth = 1.7,
	},
}

return table.freeze({
	-- persistence
	DATASTORE_NAME = "AnimeRNG_PlayerData_v1",
	AUTOSAVE_INTERVAL = 60,
	SESSION_LOCK_STALE_SECONDS = 150, -- > 2x autosave: a crashed server's lock self-heals

	-- rolling
	BASE_ROLL_COOLDOWN = 1.2,
	MIN_ROLL_COOLDOWN = 0.4,
	COOLDOWN_PER_SPEED_LEVEL = 0.1,
	LUCK_PER_LEVEL = 0.15,
	BOOSTED_ROLL_EVERY = 10, -- every 10th roll...
	BOOSTED_ROLL_MULTIPLIER = 2, -- ...gets x2 luck
	PITY_THRESHOLD = 250, -- rolls without a Legendary+ before one is guaranteed
	PITY_MIN_ONE_IN = 2000, -- "Legendary or better" = base chance 1 in 2000 or rarer
	ANNOUNCE_MIN_ONE_IN = 1000, -- server-wide announcement for 1 in 1000+

	-- inventory / economy
	MAX_EQUIPPED = 3,
	SELL_VALUE_PER_POWER = 5,
	INCOME_PER_LEVEL = 0.25,
	INCOME_TICK_SECONDS = 1,

	UPGRADES = table.freeze(UPGRADES),
	UPGRADE_ORDER = table.freeze({ "luck", "speed", "income" } :: { Types.UpgradeId }),
})
