--!strict
-- The roll. Entirely server-side: the client asks "roll please", the server
-- enforces the cooldown, computes luck, picks the character and stores it.
-- The client only animates the result it receives.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Characters = require(ReplicatedStorage.Shared.Characters)
local Config = require(ReplicatedStorage.Shared.Config)
local EconomyLogic = require(ReplicatedStorage.Shared.Util.EconomyLogic)
local RollLogic = require(ReplicatedStorage.Shared.Util.RollLogic)
local Types = require(ReplicatedStorage.Shared.Types)
local ServerNet = require(script.Parent.Parent.Lib.ServerNet)
local SessionState = require(script.Parent.Parent.Lib.SessionState)
local PlayerData = require(script.Parent.PlayerData)
local StateSync = require(script.Parent.StateSync)
local Inventory = require(script.Parent.Inventory)

-- Network jitter tolerance. Rolls are scheduled (next = max(next, now) + cooldown),
-- so jitter is absorbed without raising the average rate above 1 / cooldown.
local JITTER_SECONDS = 0.15

local random = Random.new()
local function rng(): number
	return random:NextNumber()
end

local Rolling = {}

-- Public API: performs one roll for the player (gameplay and QA share it).
function Rolling.roll(player: Player): Types.RollResult?
	local profile = PlayerData.get(player)
	if not profile then
		return nil
	end
	local session = SessionState.get(player)

	local nextRollNumber = profile.totalRolls + 1
	local luck, boosted = RollLogic.luckFor(
		EconomyLogic.luckMultiplier(profile.upgrades.luck),
		nextRollNumber,
		Config.BOOSTED_ROLL_EVERY,
		Config.BOOSTED_ROLL_MULTIPLIER,
		session.luckOverride
	)
	local pityTriggered = RollLogic.isPityRoll(profile.pity, Config.PITY_THRESHOLD)
	local def = RollLogic.roll(
		Characters.rarestFirst,
		luck,
		rng,
		if pityTriggered then Config.PITY_MIN_ONE_IN else nil
	)

	local isNew = not profile.discovered[def.id]
	profile.totalRolls = nextRollNumber
	profile.pity = if def.oneIn >= Config.PITY_MIN_ONE_IN then 0 else profile.pity + 1
	Inventory.grant(player, def.id, 1)

	if def.oneIn >= Config.ANNOUNCE_MIN_ONE_IN then
		local announcement: Types.Announcement = {
			userId = player.UserId,
			playerName = player.DisplayName,
			characterId = def.id,
		}
		ServerNet.fireAll("Announce", announcement)
	end

	StateSync.markDirty(player)
	return { id = def.id, isNew = isNew, boosted = boosted, pityTriggered = pityTriggered }
end

local function onRoll(player: Player): Types.RollResult?
	local profile = PlayerData.get(player)
	if not profile then
		return nil
	end
	-- Cooldown is decided by the server from the server-side upgrade level.
	local session = SessionState.get(player)
	local now = os.clock()
	local cooldown = EconomyLogic.rollCooldown(profile.upgrades.speed)
	if now < session.nextRollAt - JITTER_SECONDS then
		return nil
	end
	session.nextRollAt = math.max(session.nextRollAt, now) + cooldown
	return Rolling.roll(player)
end

-- QA only (called from gated CheatCommands).
function Rolling.setLuckOverride(player: Player, multiplier: number?)
	SessionState.get(player).luckOverride = multiplier
	StateSync.markDirty(player)
end

function Rolling.setPity(player: Player, pity: number)
	local profile = PlayerData.get(player)
	if profile then
		profile.pity = math.max(0, pity)
		StateSync.markDirty(player)
	end
end

function Rolling.init()
	-- Bucket allows a little burst; the cooldown above is the real limiter.
	ServerNet.onInvoke("Roll", { rate = 4, burst = 4 }, onRoll)
end

return Rolling
