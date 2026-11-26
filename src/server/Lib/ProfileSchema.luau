--!strict
-- Player profile schema, defaults and migrations. Pure (no services) so the
-- migration path is unit-tested against fixture profiles.

local ProfileSchema = {}

ProfileSchema.CURRENT_VERSION = 1

export type UpgradeId = "luck" | "speed" | "income"

export type Profile = {
	version: number,
	coins: number,
	totalRolls: number,
	pity: number,
	bestOneIn: number,
	inventory: { [string]: number },
	equipped: { string },
	discovered: { [string]: boolean },
	upgrades: { [UpgradeId]: number },
}

function ProfileSchema.default(): Profile
	-- Always a fresh table: a shared reference would corrupt across players.
	return {
		version = ProfileSchema.CURRENT_VERSION,
		coins = 0,
		totalRolls = 0,
		pity = 0,
		bestOneIn = 0,
		inventory = {},
		equipped = {},
		discovered = {},
		upgrades = { luck = 0, speed = 0, income = 0 },
	}
end

-- [fromVersion] = step to fromVersion + 1. Add a step whenever the schema changes;
-- never delete fields in place (old and new servers run side by side).
local MIGRATIONS: { [number]: (any) -> any } = {}

local function number(value: any, fallback: number): number
	if typeof(value) == "number" and value == value and value >= 0 and value ~= math.huge then
		return value
	end
	return fallback
end

-- Fill any missing/corrupt fields with defaults without touching valid data.
local function reconcile(data: any): Profile
	local defaults = ProfileSchema.default()
	local out = defaults

	out.version = number(data.version, defaults.version)
	out.coins = number(data.coins, 0)
	out.totalRolls = number(data.totalRolls, 0)
	out.pity = number(data.pity, 0)
	out.bestOneIn = number(data.bestOneIn, 0)

	if typeof(data.inventory) == "table" then
		for id, count in data.inventory do
			if typeof(id) == "string" and typeof(count) == "number" and count >= 1 then
				out.inventory[id] = math.floor(count)
			end
		end
	end
	if typeof(data.equipped) == "table" then
		for _, id in data.equipped do
			if
				typeof(id) == "string"
				and out.inventory[id]
				and not table.find(out.equipped, id)
			then
				table.insert(out.equipped, id)
			end
		end
	end
	if typeof(data.discovered) == "table" then
		for id, flag in data.discovered do
			if typeof(id) == "string" and flag == true then
				out.discovered[id] = true
			end
		end
	end
	if typeof(data.upgrades) == "table" then
		out.upgrades.luck = number(data.upgrades.luck, 0)
		out.upgrades.speed = number(data.upgrades.speed, 0)
		out.upgrades.income = number(data.upgrades.income, 0)
	end
	return out
end

-- Returns a migrated, reconciled profile. Errors if data is from the future
-- (a newer server wrote it): the caller must NOT overwrite it.
function ProfileSchema.load(data: any): Profile
	if typeof(data) ~= "table" then
		return ProfileSchema.default()
	end
	local version = number(data.version, 1)
	if version > ProfileSchema.CURRENT_VERSION then
		error(
			`profile version {version} is newer than this server ({ProfileSchema.CURRENT_VERSION})`
		)
	end
	while version < ProfileSchema.CURRENT_VERSION do
		local step = MIGRATIONS[version]
		if not step then
			error(`missing migration from v{version}`)
		end
		data = step(data)
		version += 1
		data.version = version
	end
	return reconcile(data)
end

return table.freeze(ProfileSchema)
