--!strict
-- Pure roll logic: no Roblox services, randomness injected.
-- The server's result is the only one that counts; this module exists in
-- shared/ so it can be unit-tested in CI and shown to players as odds.

local Types = require(script.Parent.Parent.Types)

export type Rng = () -> number -- returns a float in [0, 1)

local RollLogic = {}

-- Effective chance for a single entry (clamped to 1).
function RollLogic.chance(oneIn: number, luck: number): number
	if oneIn <= 1 then
		return 1
	end
	return math.min(1, luck / oneIn)
end

--[[
	Walk the pool from rarest to most common and give each entry its own
	independent chance (luck / oneIn). The first hit wins; if nothing hits,
	the most common entry of the pool is returned.

	`rarestFirst` must be sorted by oneIn descending.
	`minOneIn` restricts the pool (used for the pity guarantee).
]]
function RollLogic.roll(
	rarestFirst: { Types.CharacterDef },
	luck: number,
	rng: Rng,
	minOneIn: number?
): Types.CharacterDef
	assert(#rarestFirst > 0, "empty roll pool")
	local safeLuck = if luck ~= luck or luck < 1 then 1 else luck
	local floor = minOneIn or 0

	local fallback: Types.CharacterDef? = nil
	for _, def in rarestFirst do
		if def.oneIn >= floor then
			fallback = def -- last eligible entry = most common eligible
			if rng() < RollLogic.chance(def.oneIn, safeLuck) then
				return def
			end
		end
	end

	-- If the floor excluded everything, fall back to the rarest entry.
	return fallback or rarestFirst[1]
end

-- Luck for the next roll, given the player's state.
function RollLogic.luckFor(
	upgradeLuck: number,
	nextRollNumber: number,
	boostEvery: number,
	boostMultiplier: number,
	override: number?
): (number, boolean)
	local boosted = boostEvery > 0 and nextRollNumber % boostEvery == 0
	local luck = upgradeLuck * (override or 1)
	if boosted then
		luck *= boostMultiplier
	end
	return luck, boosted
end

-- Rolls left before the guaranteed high-rarity roll.
function RollLogic.isPityRoll(pity: number, threshold: number): boolean
	return pity + 1 >= threshold
end

return table.freeze(RollLogic)
