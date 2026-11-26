--!strict
-- Pure economy formulas (costs, multipliers, income). Unit-tested in CI.

local Config = require(script.Parent.Parent.Config)
local Types = require(script.Parent.Parent.Types)

local EconomyLogic = {}

function EconomyLogic.upgradeCost(upgradeId: Types.UpgradeId, currentLevel: number): number
	local def = Config.UPGRADES[upgradeId]
	return math.floor(def.baseCost * def.costGrowth ^ currentLevel)
end

function EconomyLogic.luckMultiplier(luckLevel: number): number
	return 1 + luckLevel * Config.LUCK_PER_LEVEL
end

function EconomyLogic.rollCooldown(speedLevel: number): number
	return math.max(
		Config.MIN_ROLL_COOLDOWN,
		Config.BASE_ROLL_COOLDOWN - speedLevel * Config.COOLDOWN_PER_SPEED_LEVEL
	)
end

function EconomyLogic.incomeMultiplier(incomeLevel: number): number
	return 1 + incomeLevel * Config.INCOME_PER_LEVEL
end

function EconomyLogic.sellValue(def: Types.CharacterDef): number
	return def.power * Config.SELL_VALUE_PER_POWER
end

-- Coins per second for a list of equipped characters.
function EconomyLogic.incomePerSecond(equipped: { Types.CharacterDef }, incomeLevel: number): number
	local total = 0
	for _, def in equipped do
		total += def.power
	end
	return math.floor(total * EconomyLogic.incomeMultiplier(incomeLevel))
end

return table.freeze(EconomyLogic)
