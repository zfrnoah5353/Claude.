--!strict
-- The only module that talks to DataStoreService.
--
-- Lifecycle: PlayerAdded -> claim session lock + load (UpdateAsync) -> in-memory
-- profile (gameplay mutates ONLY this table) -> staggered autosave -> final save
-- + lock release on PlayerRemoving and for everyone on BindToClose.
--
-- If a load fails the player is kicked rather than given a default profile,
-- because saving a default profile would overwrite their real data.

local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local Signal = require(ReplicatedStorage.Shared.Util.Signal)
local ProfileSchema = require(script.Parent.Parent.Lib.ProfileSchema)

export type Profile = ProfileSchema.Profile

local IS_STUDIO = RunService:IsStudio()
local JOB_ID = if game.JobId ~= "" then game.JobId else "studio-" .. HttpService:GenerateGUID(false)
local LOCK_ATTEMPTS = 5
local LOCK_RETRY_SECONDS = 3
local SHUTDOWN_TIMEOUT = if IS_STUDIO then 5 else 25

local PlayerData = {}

PlayerData.Loaded = Signal.new() :: Signal.Signal<Player, Profile>

local profiles: { [Player]: Profile } = {}
local nextSaveAt: { [Player]: number } = {}
local savingNow: { [Player]: boolean } = {}
local activeReleases = 0
local memoryOnly = false -- Studio without "Enable Studio Access to API Services"
local store: DataStore? = nil

local function keyFor(player: Player): string
	return `u_{player.UserId}`
end

-- pcall + exponential backoff. Returns success and the last error message.
local function withRetry(attempts: number, fn: () -> ()): (boolean, string?)
	local delaySeconds = 1
	local lastError: string? = nil
	for attempt = 1, attempts do
		local ok, err = pcall(fn)
		if ok then
			return true, nil
		end
		lastError = tostring(err)
		warn(`[PlayerData] DataStore attempt {attempt}/{attempts} failed: {lastError}`)
		if attempt < attempts then
			task.wait(delaySeconds)
			delaySeconds = math.min(delaySeconds * 2, 16)
		end
	end
	return false, lastError
end

local function isStudioAccessError(message: string?): boolean
	if not IS_STUDIO or not message then
		return false
	end
	return message:find("StudioAccessToApisNotAllowed") ~= nil
		or message:find("403") ~= nil
		or message:find("API Services") ~= nil
end

local function lockIsForeignAndFresh(record: any): boolean
	local lock = if typeof(record) == "table" then record.lock else nil
	if typeof(lock) ~= "table" or typeof(lock.time) ~= "number" then
		return false
	end
	if lock.jobId == JOB_ID then
		return false
	end
	-- In Studio, every playtest is a new "server": take over our own old locks.
	if IS_STUDIO then
		return false
	end
	return os.time() - lock.time < Config.SESSION_LOCK_STALE_SECONDS
end

type ClaimResult = "ok" | "locked" | "error"

local function claim(player: Player): (ClaimResult, Profile?)
	if memoryOnly or not store then
		return "ok", ProfileSchema.default()
	end
	local dataStore = store :: DataStore

	for attempt = 1, LOCK_ATTEMPTS do
		local lockedElsewhere = false
		local loaded: Profile? = nil
		local schemaError = false

		local ok, err = withRetry(3, function()
			dataStore:UpdateAsync(keyFor(player), function(old: any): any
				-- No yielding in here. May run more than once: reset outputs.
				lockedElsewhere = false
				loaded = nil
				schemaError = false
				if lockIsForeignAndFresh(old) then
					lockedElsewhere = true
					return nil -- abort the write
				end
				local storedData = if typeof(old) == "table" then old.data else nil
				local okLoad, result = pcall(ProfileSchema.load, storedData)
				if not okLoad then
					schemaError = true
					warn(`[PlayerData] cannot load profile of {player.UserId}: {result}`)
					return nil
				end
				loaded = result
				return { data = result, lock = { jobId = JOB_ID, time = os.time() } }
			end)
		end)

		if not ok then
			if isStudioAccessError(err) then
				memoryOnly = true
				warn(
					"[PlayerData] Studio has no DataStore access: progress will NOT be saved. "
						.. "Enable it in Game Settings > Security > Enable Studio Access to API Services."
				)
				return "ok", ProfileSchema.default()
			end
			return "error", nil
		end
		if schemaError then
			return "error", nil
		end
		if loaded then
			return "ok", loaded
		end
		if lockedElsewhere and attempt < LOCK_ATTEMPTS then
			task.wait(LOCK_RETRY_SECONDS)
		end
	end
	return "locked", nil
end

local function save(player: Player, profile: Profile, release: boolean): boolean
	if memoryOnly or not store then
		return true
	end
	local dataStore = store :: DataStore
	local ok = withRetry(3, function()
		dataStore:UpdateAsync(keyFor(player), function(old: any): any
			if lockIsForeignAndFresh(old) then
				-- Another server owns this profile now; never overwrite it.
				return nil
			end
			return {
				data = profile,
				lock = if release then nil else { jobId = JOB_ID, time = os.time() },
			}
		end)
	end)
	return ok
end

local function onPlayerAdded(player: Player)
	local result, profile = claim(player)

	if player.Parent == nil then
		-- Left while loading: release what we just claimed.
		if result == "ok" and profile then
			save(player, profile, true)
		end
		return
	end

	if result == "locked" then
		player:Kick(
			"Ta sauvegarde est encore en cours sur un autre serveur. Reviens dans une minute !"
		)
		return
	elseif result == "error" or not profile then
		player:Kick("Impossible de charger ta sauvegarde. Reviens dans un instant.")
		return
	end

	profiles[player] = profile
	-- Stagger autosaves so players don't all save on the same tick.
	nextSaveAt[player] = os.clock()
		+ Config.AUTOSAVE_INTERVAL
		+ (player.UserId % Config.AUTOSAVE_INTERVAL)
	PlayerData.Loaded:Fire(player, profile)
end

local function release(player: Player)
	local profile = profiles[player]
	if not profile then
		return
	end
	profiles[player] = nil
	nextSaveAt[player] = nil
	activeReleases += 1
	-- Wait for an in-flight autosave so the final write is the last write.
	while savingNow[player] do
		task.wait(0.1)
	end
	save(player, profile, true)
	savingNow[player] = nil
	activeReleases -= 1
end

local function autosave(player: Player, profile: Profile)
	savingNow[player] = true
	save(player, profile, false)
	savingNow[player] = nil
end

function PlayerData.get(player: Player): Profile?
	return profiles[player]
end

function PlayerData.isMemoryOnly(): boolean
	return memoryOnly
end

-- QA only (gated in CheatCommands): reset the in-memory profile to defaults.
function PlayerData.reset(player: Player): boolean
	local profile = profiles[player]
	if not profile then
		return false
	end
	local fresh = ProfileSchema.default() :: any
	local target = profile :: any
	table.clear(target)
	for key, value in fresh do
		target[key] = value
	end
	return true
end

function PlayerData.init()
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(Config.DATASTORE_NAME)
	end)
	if ok then
		store = result
	elseif IS_STUDIO then
		memoryOnly = true
		warn("[PlayerData] DataStore unavailable in Studio — progress will not be saved.")
	else
		error(`[PlayerData] cannot open DataStore: {result}`)
	end

	Players.PlayerAdded:Connect(onPlayerAdded)
	Players.PlayerRemoving:Connect(release)

	game:BindToClose(function()
		for player in profiles do
			task.spawn(release, player)
		end
		local deadline = os.clock() + SHUTDOWN_TIMEOUT
		while activeReleases > 0 and os.clock() < deadline do
			task.wait(0.1)
		end
	end)
end

function PlayerData.start()
	-- Players who joined before the bootstrap connected PlayerAdded.
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end

	local accumulator = 0
	RunService.Heartbeat:Connect(function(dt: number)
		accumulator += dt
		if accumulator < 1 then
			return
		end
		accumulator = 0
		if memoryOnly then
			return
		end
		local now = os.clock()
		for player, due in nextSaveAt do
			if now >= due and not savingNow[player] then
				local profile = profiles[player]
				if profile then
					local budget = DataStoreService:GetRequestBudgetForRequestType(
						Enum.DataStoreRequestType.UpdateAsync
					)
					if budget < 2 then
						nextSaveAt[player] = now + 5 -- defer, budget is low
					else
						nextSaveAt[player] = now + Config.AUTOSAVE_INTERVAL
						task.spawn(autosave, player, profile)
					end
				end
			end
		end
	end)
end

return PlayerData
